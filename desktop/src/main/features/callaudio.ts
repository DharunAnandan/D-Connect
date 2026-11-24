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
  // (PulseAudio owns the sound card). So D-Connect gives it two virtual ones:
  //  - "dconnect-call-speaker": a null sink (it also drives the timing); its monitor is read by
  //    GStreamer and played on PulseAudio (the laptop speaker or the chosen headset)
  //  - "dconnect-call-mic": GStreamer takes PulseAudio's mic and provides it as a PipeWire source
  // WirePlumber links the call to them by itself.
  const virtualSpeaker = async (): Promise<number | null> => {
    const find = async (): Promise<number | null> => (await pwDump()).find((o) => o.info?.props?.['node.name'] === 'dconnect-call-speaker')?.id ?? null
    let id = await find()
    if (id === null) {
      // priority.driver 1: the phone's Bluetooth stream (2010) drives the timing, so the two
      // clocks never fight (that made the call audio choppy)
      await sh('pw-cli', ['create-node', 'adapter', '{ factory.name=support.null-audio-sink node.name=dconnect-call-speaker node.description="D-Connect call speaker" media.class=Audio/Sink object.linger=true audio.position=[ MONO ] audio.rate=16000 priority.driver=1 priority.session=1 }'])
      for (let i = 0; i < 10 && id === null; i++) {
        await wait(200)
        id = await find()
      }
    }
    return id
  }

  const startCallBridges = async (): Promise<void> => {
    stopBridges()
    const out = outDev ? [`device=${outDev}`] : []
    const inp = inDev ? [`device=${inDev}`] : []
    const spk = await virtualSpeaker()
    const callCaps = 'audio/x-raw,rate=16000,channels=1'
    if (spk !== null) startBridge(['pipewiresrc', `path=${spk}`, 'stream-properties=props,stream.capture.sink=true,node.name=dconnect-call-speaker-reader,node.latency=320/16000', 'do-timestamp=true', '!', 'audioconvert', '!', 'audioresample', '!', callCaps, '!', 'queue', 'max-size-time=200000000', 'leaky=downstream', '!', 'pulsesink', ...out, 'client-name=D-Connect call', 'latency-time=20000', 'buffer-time=120000', 'provide-clock=false'])
    // the mic as it worked on a live call: stereo, so WirePlumber links both of the phone's
    // call inputs (FL/FR); a mono source didn't get linked and the caller heard nothing
    startBridge(['pulsesrc', ...inp, 'client-name=D-Connect call mic', 'latency-time=20000', 'buffer-time=120000', '!', 'audioconvert', '!', 'audioresample', '!', 'queue', 'max-size-time=200000000', 'leaky=downstream', '!', 'pipewiresink', 'mode=provide', 'stream-properties=props,media.class=Audio/Source,node.name=dconnect-call-mic'])
    // and check it really is linked; if not, link it by hand
    setTimeout(() => ensureMicLinked(), 2500)
    if (muted) setTimeout(() => applyMute(), 800)
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
    if (watching || !(state === 'offhook' || state === 'dialing')) return
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

  // PulseAudio also sees the phone (as a music source). Keep that off so the phone's media
  // and notification sounds never start playing on the laptop by themselves.
  const quietPulseCard = async (): Promise<void> => {
    const addr = (await phoneAddress())?.replace(/:/g, '_')
    if (!addr) return
    const card = `bluez_card.${addr}`
    const info = (await sh('pactl', ['list', 'cards'])).split('Name: ').find((b) => b.startsWith(card))
    if (info && !/Active Profile: off/.test(info)) await sh('pactl', ['set-card-profile', card, 'off'])
  }
  setInterval(() => ctx.hub.session && quietPulseCard(), 5000)

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
    const out = await sh('pactl', ['list', 'source-outputs'])
    for (const block of out.split('Source Output #').slice(1)) {
      if (!/D-Connect call mic/.test(block)) continue
      const id = block.split('\n')[0].trim()
      await sh('pactl', ['set-source-output-mute', id, muted ? '1' : '0'])
    }
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
