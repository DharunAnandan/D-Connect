// Where phone-call audio plays, decided per call. PulseAudio stays the system sound server for
// everything (Teams, browsers, earbuds); PipeWire runs alongside only as the Bluetooth
// hands-free unit for the linked phone. During a call taken in D-Connect, two small GStreamer
// bridges carry the call between PipeWire and PulseAudio's *default* speaker and mic:
//   phone call (PipeWire bluez_input)  -> pulsesink  (laptop speakers)
//   pulsesrc (laptop mic)              -> PipeWire bluez_output -> phone call
// Nothing is ever made a default device, so other apps are untouched.
//  - answered or dialled in D-Connect  -> laptop
//  - answered on the phone             -> the PC drops the call audio link, the phone keeps it
import { ChildProcess, execFile, spawn } from 'child_process'
import type { CallState } from '@shared/protocol'
import type { Ctx } from '../context'
import { callLinkUp, fixCallLink } from './bluetooth'

function sh(cmd: string, args: string[], timeout = 6000): Promise<string> {
  return new Promise((resolve) => execFile(cmd, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (err, out) => resolve(err ? '' : out)))
}
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export type CallRoute = 'pc' | 'phone' | 'speaker' // laptop · phone receiver · phone speaker

interface PwObject {
  id: number
  type: string
  info?: { props?: Record<string, any>; params?: Record<string, any[]> }
}

async function pwDump(): Promise<PwObject[]> {
  try {
    return JSON.parse((await sh('pw-dump', [])) || '[]')
  } catch {
    return []
  }
}

export function callAudio(ctx: Ctx): { answeredHere: () => void; setMuted: (m: boolean) => void } {
  if (process.platform !== 'linux') return { answeredHere: () => {}, setMuted: () => {} }

  let here = false
  let route: CallRoute | null = null
  let bridges: ChildProcess[] = []
  let state: CallState['state'] = 'idle'
  let busy = Promise.resolve()
  let lastError = ''
  let controlOff = false
  // where the call plays and listens on this PC (null = the system default)
  let outDev: string | null = null
  let inDev: string | null = null
  let nodesNow: { source?: PwObject; sink?: PwObject } = {}
  let phoneWantedUntil = 0

  // the linked phone's Bluetooth address (by name), e.g. 18:AB:1D:B9:E5:AA
  const phoneAddress = async (): Promise<string | null> => {
    const name = ctx.hub.session?.device.name?.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!name) return null
    for (const line of (await sh('bluetoothctl', ['devices'])).split('\n')) {
      const m = /^Device\s+([0-9A-F:]{17})\s+(.*)$/i.exec(line.trim())
      if (m && m[2].toLowerCase().replace(/[^a-z0-9]/g, '') === name) return m[1]
    }
    return null
  }

  const pwPhone = async (): Promise<{ device?: PwObject; source?: PwObject; sink?: PwObject }> => {
    const addr = (await phoneAddress())?.replace(/:/g, '_')
    const all = await pwDump()
    const match = (o: PwObject): boolean => !addr || JSON.stringify(o.info?.props || {}).includes(addr)
    const props = (o: PwObject): Record<string, any> => o.info?.props || {}
    return {
      device: all.find((o) => o.type === 'PipeWire:Interface:Device' && String(props(o)['device.name'] || '').startsWith('bluez_card') && match(o)),
      // the call's audio from the phone / to the phone (PipeWire 0.3 names them bluez_input /
      // bluez_output and labels them as streams, not devices)
      source: all.find((o) => o.type === 'PipeWire:Interface:Node' && String(props(o)['node.name'] || '').startsWith('bluez_input') && match(o)),
      sink: all.find((o) => o.type === 'PipeWire:Interface:Node' && String(props(o)['node.name'] || '').startsWith('bluez_output') && match(o))
    }
  }

  const setPwProfile = async (name: 'off' | 'audio-gateway'): Promise<void> => {
    const { device } = await pwPhone()
    if (!device) return
    const profiles = device.info?.params?.EnumProfile || []
    const p = profiles.find((x: any) => x.name === name)
    if (!p) return
    await sh('pw-cli', ['set-param', String(device.id), 'Profile', `{ index: ${p.index}, save: false }`])
  }

  const stopBridges = (): void => {
    for (const b of bridges) b.kill()
    // unload this bridge's voice processing (not a newer one started right after)
    const mod = ecModule
    if (bridges.length && mod) {
      ecModule = null
      setTimeout(() => sh('pactl', ['unload-module', mod]), 300)
    }
    bridges = []
  }

  const startBridge = (args: string[]): void => {
    const p = spawn('gst-launch-1.0', ['-q', ...args], { stdio: 'ignore' })
    p.on('error', () => {})
    bridges.push(p)
  }

  const toPc = async (): Promise<boolean> => {
    // make sure the phone's hands-free call link is open (phones don't always open it themselves)
    const addr = await phoneAddress()
    if (addr && !(await callLinkUp(addr))) {
      const r = await fixCallLink(ctx, [ctx.hub.session?.device.name || ''])
      if (!r.ok) {
        lastError = r.message
        return false
      }
    }
    await setPwProfile('audio-gateway')
    // Android keeps a live call on its earpiece/speaker unless its own call screen moves it:
    // ask the phone to pick this PC in its Audio menu (needs screen control on the phone)
    ctx.hub.send('call.route.bt', {})
    const alias = /Alias:\s*(.+)/.exec(await sh('bluetoothctl', ['show']))?.[1]?.trim()
    const r: any = await ctx.hub.request('call.control', { action: 'audio-pc', target: alias }, 8000).catch(() => null)
    controlOff = r?.ok === false
    phoneWantedUntil = 0
    let n: { source?: PwObject; sink?: PwObject } = {}
    for (let i = 0; i < 40 && !(n.source || n.sink); i++) {
      n = await pwPhone()
      if (!(n.source || n.sink)) await wait(250)
    }
    if (!n.source && !n.sink) {
      lastError = controlOff
        ? 'Turn on Screen control on the phone (phone app → Settings → Screen control). Android only lets its own call screen move a call to the laptop.'
        : "The phone didn't move the call to the laptop. On the phone's call screen, tap Audio → choose this PC."
      return false
    }
    nodesNow = n
    if (!bridges.length) await startCallBridges()
    return true
  }

  // PipeWire only links the phone's call streams to a speaker/mic *device*, and it has none
  // (PulseAudio owns the sound card). PipeWire's PulseAudio tunnel gives it two real ones:
  //  - "dconnect-call-speaker": a PipeWire sink whose audio plays on a PulseAudio speaker
  //  - "dconnect-call-mic":     a PipeWire source fed by a PulseAudio microphone
  // WirePlumber links the call to them by itself. Each tunnel lives in its own pw-cli process,
  // so stopping the bridge is just killing those. (A GStreamer pipewiresink into PipeWire sent
  // only silence on this PipeWire version, and two independent clocks made audio lag.)
  const tunnel = (mode: 'playback' | 'capture', name: string, desc: string, cls: string, target: string | null): void => {
    const sock = `/run/user/${process.getuid?.() ?? 1000}/pulse/native`
    const args = [
      `tunnel.mode=${mode}`,
      `pulse.server.address="${sock}"`,
      `pulse.latency=${mode === 'playback' ? 90 : 60}`,
      'audio.rate=16000',
      'audio.channels=1',
      'audio.position=[ MONO ]',
      target ? `node.target="${target}"` : '',
      `stream.props={ node.name=${name} node.description="${desc}" media.class=${cls} priority.driver=1 priority.session=1 }`
    ].filter(Boolean).join(' ')
    const p = spawn('pw-cli', [], { stdio: ['pipe', 'ignore', 'ignore'] })
    p.on('error', () => {})
    p.stdin.write(`load-module libpipewire-module-pulse-tunnel { ${args} }\n`) // stdin stays open: the module lives while pw-cli runs
    bridges.push(p)
  }

  // PulseAudio's WebRTC voice processing (as in video-call apps): background noise suppressed,
  // the caller's own voice coming out of the laptop speakers cancelled, level kept steady.
  // The call plays into its speaker side and the mic is taken from its cleaned output.
  let ecModule: string | null = null
  const startVoiceProcessing = async (): Promise<{ sink: string; source: string } | null> => {
    await stopVoiceProcessing()
    const sinkMaster = outDev || (await sh('pactl', ['get-default-sink'])).trim()
    const sourceMaster = inDev || (await sh('pactl', ['get-default-source'])).trim()
    if (!sinkMaster || !sourceMaster) return null
    const id = (
      await sh('pactl', [
        'load-module',
        'module-echo-cancel',
        'aec_method=webrtc',
        'aec_args="noise_suppression=1 analog_gain_control=0 digital_gain_control=1 high_pass_filter=1 extended_filter=1"',
        `source_master=${sourceMaster}`,
        `sink_master=${sinkMaster}`,
        'source_name=dconnect_call_mic_clean',
        'sink_name=dconnect_call_speaker_ec',
        'source_properties=device.description="D-Connect call mic (noise suppressed)"',
        'sink_properties=device.description="D-Connect call speaker"'
      ])
    ).trim()
    if (!/^\d+$/.test(id)) return null
    ecModule = id
    return { sink: 'dconnect_call_speaker_ec', source: 'dconnect_call_mic_clean' }
  }
  const stopVoiceProcessing = async (): Promise<void> => {
    if (ecModule) await sh('pactl', ['unload-module', ecModule])
    ecModule = null
  }

  const startCallBridges = async (): Promise<void> => {
    stopBridges()
    const vp = await startVoiceProcessing() // falls back to the plain devices if unavailable
    // drop the virtual speaker left from older versions so WirePlumber picks the tunnel
    const old = (await pwDump()).find((o) => o.info?.props?.['node.name'] === 'dconnect-call-speaker' && o.info?.props?.['factory.name'] === 'support.null-audio-sink')
    if (old) await sh('pw-cli', ['destroy', String(old.id)])
    tunnel('playback', 'dconnect-call-speaker', 'D-Connect call speaker', 'Audio/Sink', vp?.sink || outDev)
    tunnel('capture', 'dconnect-call-mic', 'D-Connect call mic', 'Audio/Source', vp?.source || inDev)
    if (muted) setTimeout(() => applyMute(), 1200)
  }

  const ensureMicLinked = async (): Promise<void> => {
    const links = await sh('pw-link', ['-l'])
    if (/dconnect-call-mic:\S+\s*\n\s*\|->\s*bluez_output/.test(links)) return
    const outs = (await sh('pw-link', ['-o'])).split('\n').filter((l) => l.startsWith('dconnect-call-mic:'))
    const ins = (await sh('pw-link', ['-i'])).split('\n').filter((l) => l.startsWith('bluez_output.'))
    if (!outs.length || !ins.length) return
    // pair ports in order; a mono end feeds every port on the other side
    for (let i = 0; i < Math.max(outs.length, ins.length); i++) await sh('pw-link', [outs[Math.min(i, outs.length - 1)].trim(), ins[Math.min(i, ins.length - 1)].trim()])
  }

  const toPhone = async (speaker = false): Promise<void> => {
    stopBridges()
    phoneWantedUntil = Date.now() + 6000 // don't re-bridge while the phone moves the audio away
    const r: any = await ctx.hub.request('call.control', { action: speaker ? 'audio-speaker' : 'audio-phone' }, 8000).catch(() => null)
    // no screen control: dropping the hands-free audio link puts the call back on the phone
    if (r?.ok !== true) await setPwProfile('off')
  }

  const restore = async (): Promise<void> => {
    stopBridges()
    await setPwProfile('audio-gateway')
  }

  const setRoute = (r: CallRoute | null): Promise<void> =>
    (busy = busy.then(async () => {
      if (r === route) return
      if (r === 'pc') {
        const ok = await toPc()
        route = ok ? 'pc' : null
        if (!ok) ctx.toast({ kind: 'info', title: 'Call audio stays on the phone', body: lastError || 'Pair the phone over Bluetooth in Settings → Take calls on this PC.', ttl: 15000 })
      } else if (r === 'phone' || r === 'speaker') {
        await toPhone(r === 'speaker')
        route = r
      } else {
        await restore()
        route = null
      }
      ctx.emit('call.route', route)
    }))

  // The phone reports where the call's audio really is; the card follows that.
  let pcAddr: string | null = null
  ctx.hub.on('message', async (type, data) => {
    if (type !== 'call.audio' || !data) return
    pcAddr = pcAddr || /Controller\s+([0-9A-F:]{17})/i.exec(await sh('bluetoothctl', ['show']))?.[1] || null
    let r: CallRoute
    if (data.route === 'speaker') r = 'speaker'
    else if (data.route === 'bluetooth' && (!data.address || !pcAddr || String(data.address).toUpperCase() === pcAddr.toUpperCase())) r = 'pc'
    else r = 'phone' // receiver, a wired headset, or another Bluetooth headset on the phone
    if (r !== route) {
      route = r
      ctx.emit('call.route', route)
    }
  })

  ctx.hub.on('message', (type, data) => {
    if (type !== 'call.state') return
    const prev = state
    state = (data as CallState).state
    if (state === 'idle') {
      here = false
      setRoute(null)
    } else if (state === 'offhook' || state === 'dialing') {
      // a call that was already going when the PC connected: leave its audio where it is (the
      // watcher bridges it if it's on this PC)
      if ((data as any).existing) return
      if (prev === 'ringing' || prev === 'idle' || route === null) setRoute(here ? 'pc' : 'phone')
    }
  })
  ctx.hub.on('disconnected', () => {
    here = false
    state = 'idle'
    setRoute(null)
  })

  let watching = false
  setInterval(async () => {
    // any time the phone sends call audio here (phone calls, and app calls like Teams that use
    // this PC as their Bluetooth headset), bridge it
    if (watching || !ctx.hub.session) return
    watching = true
    try {
      const n = await pwPhone()
      const audioHere = !!(n.source || n.sink)
      if (audioHere && !bridges.length && Date.now() > phoneWantedUntil) {
        nodesNow = n
        await startCallBridges()
        if (route !== 'pc') {
          route = 'pc'
          ctx.emit('call.route', route)
        }
      } else if (!audioHere && bridges.length) {
        stopBridges()
        if (route === 'pc') {
          route = 'phone'
          ctx.emit('call.route', route)
        }
      } else if (audioHere && bridges.length && route !== 'pc') {
        route = 'pc'
        ctx.emit('call.route', route)
      }
    } finally {
      watching = false
    }
  }, 1000)

  // The phone's media (Spotify, YouTube...) over Bluetooth: with "Play phone audio on this PC"
  // on, keep its music link active and play it on this PC's speaker (a plain loopback, music
  // role, so nothing else gets paused). Off: keep that link off so stray phone sounds never play here.
  // One loopback only, even after restarts (the module outlives the app). While the music plays
  // here the phone's own media volume goes to full (Android scales the sound before Bluetooth,
  // so a low phone volume made it quiet here); loudness is then set on this PC, up to 200%.
  let mediaLoop: string | null = null
  let phoneVolBefore: number | null = null
  const loopsFor = async (src: string): Promise<string[]> =>
    (await sh('pactl', ['list', 'short', 'modules'])).split('\n').filter((l) => /\tmodule-loopback\t/.test(l) && l.includes(`source=${src} `)).map((l) => l.split('\t')[0])
  const applyPhoneVolume = async (): Promise<void> => {
    if (!mediaLoop) return
    const list = await sh('pactl', ['list', 'short', 'sink-inputs'])
    const pct = Math.max(0, Math.min(200, Number(ctx.store.get('phoneAudioVolume') ?? 100)))
    for (const l of list.split('\n')) {
      const [idx, , mod] = l.split('\t')
      if (mod === mediaLoop) await sh('pactl', ['set-sink-input-volume', idx, `${pct}%`])
    }
  }
  const phoneFullVolume = async (on: boolean): Promise<void> => {
    if (!ctx.hub.session) return
    if (on) {
      const r: any = await ctx.hub.request('phone.volume', {}, 4000).catch(() => null)
      if (r && typeof r.pct === 'number' && r.pct < 100) {
        phoneVolBefore = r.pct
        await ctx.hub.request('phone.volume', { pct: 100 }, 4000).catch(() => null)
      }
    } else if (phoneVolBefore != null) {
      await ctx.hub.request('phone.volume', { pct: phoneVolBefore }, 4000).catch(() => null)
      phoneVolBefore = null
    }
  }
  let mediaBusy = false
  const phoneMedia = async (): Promise<void> => {
    if (mediaBusy) return
    mediaBusy = true
    try {
      const addr = (await phoneAddress())?.replace(/:/g, '_')
      if (!addr) return
      const card = `bluez_card.${addr}`
      const info = (await sh('pactl', ['list', 'cards'])).split('Name: ').find((b) => b.startsWith(card))
      if (!info) return
      const want = !!ctx.store.get('phoneAudioOnPc')
      const active = /Active Profile: (\S+)/.exec(info)?.[1]
      const src = `bluez_source.${addr}.a2dp_source`
      const loops = await loopsFor(src)
      if (!want) {
        for (const m of loops) await sh('pactl', ['unload-module', m])
        if (mediaLoop) await phoneFullVolume(false)
        mediaLoop = null
        if (active !== 'off') await sh('pactl', ['set-card-profile', card, 'off'])
        return
      }
      if (active !== 'a2dp_source' && /a2dp_source:/.test(info)) await sh('pactl', ['set-card-profile', card, 'a2dp_source'])
      // keep exactly one
      for (const m of loops.slice(1)) await sh('pactl', ['unload-module', m])
      if (loops[0]) {
        if (mediaLoop !== loops[0]) {
          mediaLoop = loops[0]
          await applyPhoneVolume()
          await phoneFullVolume(true)
        }
        return
      }
      const sink = (await sh('pactl', ['get-default-sink'])).trim()
      const id = (await sh('pactl', ['load-module', 'module-loopback', `source=${src}`, `sink=${sink}`, 'latency_msec=120', 'source_dont_move=true', "sink_input_properties='media.role=music application.name=dconnect-phone'"])).trim()
      mediaLoop = /^\d+$/.test(id) ? id : null
      if (mediaLoop) {
        await wait(300)
        await applyPhoneVolume()
        await phoneFullVolume(true)
      }
    } finally {
      mediaBusy = false
    }
  }
  setInterval(() => ctx.hub.session && phoneMedia(), 4000)
  ctx.store.on('change', (k: string) => {
    if (k === 'phoneAudioOnPc') phoneMedia()
    if (k === 'phoneAudioVolume') applyPhoneVolume()
  })
  ctx.hub.on('disconnected', async () => {
    if (mediaLoop) await sh('pactl', ['unload-module', mediaLoop])
    mediaLoop = null
  })

  // speakers/headsets and mics on this PC (never the phone itself)
  ctx.handle('callDevices', async () => {
    const list = async (kind: 'sinks' | 'sources'): Promise<{ name: string; label: string }[]> => {
      const out = await sh('pactl', ['list', kind])
      return out
        .split(kind === 'sinks' ? 'Sink #' : 'Source #')
        .slice(1)
        .map((b) => ({ name: /Name:\s*(\S+)/.exec(b)?.[1] || '', label: /Description:\s*(.+)/.exec(b)?.[1]?.trim() || '' }))
        .filter((d) => d.name && !d.name.endsWith('.monitor') && !d.name.includes('bluez_card') && !/2C_A7|18_AB/.test(d.name))
        .filter((d) => !(d.name.startsWith('bluez_') && /a2dp_source|headset_audio_gateway|handsfree_audio_gateway/.test(d.name)))
    }
    return { outputs: await list('sinks'), inputs: await list('sources'), out: outDev, in: inDev }
  })
  ctx.handle('setCallDevices', (out: string | null, inp: string | null) => {
    outDev = out || null
    inDev = inp || null
    if (route === 'pc' || bridges.length) startCallBridges()
  })
  ctx.handle('callRoute', () => route)
  ctx.handle('setCallRoute', (r: CallRoute) => setRoute(r))

  // Mute while the call is on the laptop: silence the laptop-mic stream that feeds the call.
  let muted = false
  const applyMute = async (): Promise<void> => {
    const mic = (await pwDump()).find((o) => o.info?.props?.['node.name'] === 'dconnect-call-mic')
    if (mic) await sh('pw-cli', ['set-param', String(mic.id), 'Props', `{ mute: ${muted ? 'true' : 'false'} }`])
  }
  const setMuted = (m: boolean): void => {
    muted = m
    applyMute()
  }
  // a new call (or a fresh bridge) starts unmuted unless the user muted it
  ctx.hub.on('message', (type, data) => {
    if (type === 'call.state' && (data as CallState).state === 'idle') muted = false
  })
  setInterval(() => route === 'pc' && muted && applyMute(), 2000)

  return { answeredHere: () => (here = true), setMuted }
}
