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

export type CallRoute = 'pc' | 'phone'

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
      source: all.find((o) => o.type === 'PipeWire:Interface:Node' && props(o)['media.class'] === 'Audio/Source' && String(props(o)['node.name'] || '').startsWith('bluez_input') && match(o)),
      sink: all.find((o) => o.type === 'PipeWire:Interface:Node' && props(o)['media.class'] === 'Audio/Sink' && String(props(o)['node.name'] || '').startsWith('bluez_output') && match(o))
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
    // if the call was moved to the phone earlier, Android won't move it back on its own: ask it
    ctx.hub.send('call.route.bt', {})
    let n: { source?: PwObject; sink?: PwObject } = {}
    for (let i = 0; i < 40 && !(n.source && n.sink); i++) {
      n = await pwPhone()
      if (!(n.source && n.sink)) await wait(250)
    }
    if (!n.source && !n.sink) return false
    stopBridges()
    if (n.source) startBridge(['pipewiresrc', `path=${n.source.id}`, 'do-timestamp=true', '!', 'audioconvert', '!', 'audioresample', '!', 'pulsesink', 'client-name=D-Connect call', 'latency-time=20000', 'buffer-time=80000'])
    if (n.sink) startBridge(['pulsesrc', 'client-name=D-Connect call mic', 'latency-time=20000', 'buffer-time=80000', '!', 'audioconvert', '!', 'audioresample', '!', 'pipewiresink', `path=${n.sink.id}`])
    return true
  }

  const toPhone = async (): Promise<void> => {
    stopBridges()
    // with the hands-free audio link dropped, Android puts the call back on the phone
    await setPwProfile('off')
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
      } else if (r === 'phone') {
        await toPhone()
        route = 'phone'
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
      if (prev === 'ringing' || prev === 'idle' || route === null) setRoute(here ? 'pc' : 'phone')
    }
  })
  ctx.hub.on('disconnected', () => {
    here = false
    state = 'idle'
    setRoute(null)
  })

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
