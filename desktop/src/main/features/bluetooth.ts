// Take calls on the laptop: the PC becomes a Bluetooth hands-free unit (HFP HF) for the phone,
// so call audio plays through the laptop's speakers and mic. Needs PipeWire with the hfp_hf
// role (Ubuntu 22.04 ships PulseAudio, which can't do it without oFono). This module reports
// what's there, pairs/connects through BlueZ and writes the WirePlumber config.
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Ctx } from '../context'
import { adbPath } from '../adb'

function sh(cmd: string, args: string[], timeout = 6000): Promise<string> {
  return new Promise((resolve) => execFile(cmd, args, { timeout }, (err, out, errOut) => resolve(err ? '' : out + errOut)))
}

export interface BtStatus {
  platform: string
  adapter: boolean
  powered: boolean
  audioServer: 'pipewire' | 'pulseaudio' | 'unknown'
  wireplumber: string | null
  hfpConfigured: boolean
  devices: { address: string; name: string; paired: boolean; connected: boolean }[]
  phone: { name: string; address?: string; paired: boolean; connected: boolean; callLink: boolean } | null // the phone linked to D-Connect
  canAutoSetup: boolean
  ready: boolean
}

const WP_04 = path.join(os.homedir(), '.config/wireplumber/bluetooth.lua.d/90-enable-all.lua')
const WP_04_ALSA = path.join(os.homedir(), '.config/wireplumber/main.lua.d/90-enable-all.lua')
const WP_05 = path.join(os.homedir(), '.config/wireplumber/wireplumber.conf.d/51-dconnect-hfp.conf')

// Is the phone's hands-free control link up in PipeWire (not just its music link)?
export async function callLinkUp(address: string): Promise<boolean> {
  try {
    const all = JSON.parse((await sh('pw-dump', [], 8000)) || '[]')
    // PipeWire shows a device for the phone once a call's audio codec is chosen...
    const dev = all.find((o: any) => o.type === 'PipeWire:Interface:Device' && o.info?.props?.['api.bluez5.address'] === address)
    if (dev && (dev.info?.params?.EnumProfile || []).some((p: any) => p.name === 'audio-gateway')) return true
  } catch {}
  // ...but between calls PipeWire 0.3.x waits for that codec choice (the phone only makes it
  // when a call starts), so the link is up whenever WirePlumber holds a hands-free connection.
  return wirePlumberHoldsCallLink()
}

function wirePlumberHoldsCallLink(): boolean {
  try {
    const inodes = new Set(
      fs.readFileSync('/proc/net/rfcomm', 'utf8').split('\n').slice(1).map((l) => l.trim().split(/\s+/)[5]).filter(Boolean)
    )
    if (!inodes.size) return false
    for (const pid of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pid)) continue
      let comm = ''
      try { comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim() } catch { continue }
      if (comm !== 'wireplumber') continue
      for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
        try {
          const m = /^socket:\[(\d+)\]$/.exec(fs.readlinkSync(`/proc/${pid}/fd/${fd}`))
          if (m && inodes.has(m[1])) return true
        } catch {}
      }
    }
  } catch {}
  return false
}

export async function pcBtAddress(): Promise<string | null> {
  return /Controller\s+([0-9A-F:]{17})/i.exec(await sh('bluetoothctl', ['show']))?.[1] || null
}

const norm = (n: string): string => n.toLowerCase().replace(/[^a-z0-9]/g, '')

async function status(phoneNames: string[] = []): Promise<BtStatus> {
  if (process.platform !== 'linux') {
    return { platform: process.platform, adapter: false, powered: false, audioServer: 'unknown', wireplumber: null, hfpConfigured: false, devices: [], phone: null, canAutoSetup: false, ready: false }
  }
  const show = await sh('bluetoothctl', ['show'])
  const info = await sh('pactl', ['info'])
  const wpv = (await sh('dpkg-query', ['-W', '-f', '${Version}', 'wireplumber'])).trim() || null
  const devicesOut = await sh('bluetoothctl', ['devices'])
  const devices: BtStatus['devices'] = []
  for (const line of devicesOut.split('\n')) {
    const m = /^Device\s+([0-9A-F:]{17})\s+(.*)$/i.exec(line.trim())
    if (!m) continue
    const di = await sh('bluetoothctl', ['info', m[1]])
    if (!/Icon: phone/.test(di) && !/UUID: Handsfree Audio Gateway/i.test(di)) continue
    devices.push({ address: m[1], name: m[2], paired: /Paired: yes/.test(di), connected: /Connected: yes/.test(di) })
  }
  const audioServer = /PipeWire/i.test(info) ? 'pipewire' : /pulseaudio/i.test(info) ? 'pulseaudio' : 'unknown'
  const cfg = fs.existsSync(WP_04) ? fs.readFileSync(WP_04, 'utf8') : fs.existsSync(WP_05) ? fs.readFileSync(WP_05, 'utf8') : ''
  const running = (await sh('systemctl', ['--user', 'is-active', 'pipewire', 'wireplumber'])).split('\n').filter((l) => l.trim() === 'active').length === 2
  const hfpConfigured = /hfp_hf/.test(cfg) && running
  const adapter = /Controller/.test(show)
  const powered = /Powered: yes/.test(show)
  // only the phone that is linked to D-Connect, never some other paired phone
  const wanted = phoneNames.filter(Boolean).map(norm)
  const match = devices.find((d) => wanted.includes(norm(d.name)))
  const phone = wanted.length ? (match ? { ...match, callLink: await callLinkUp(match.address) } : { name: phoneNames.find(Boolean)!, paired: false, connected: false, callLink: false }) : null
  const canAutoSetup = !!(await sh('which', ['pkexec'])).trim()
  return { platform: 'linux', adapter, powered, audioServer, wireplumber: wpv, hfpConfigured, devices, phone, canAutoSetup, ready: adapter && powered && hfpConfigured && !!phone?.callLink }
}

// Snaps that can play/record through "pulseaudio" but have no "audio-record" connection.
async function snapsNeedingMic(): Promise<string[]> {
  const list = (await sh('snap', ['list'])).split('\n').slice(1).map((l) => l.split(/\s+/)[0]).filter(Boolean)
  const out: string[] = []
  for (const name of list) {
    const c = await sh('snap', ['connections', name])
    const pulse = /^pulseaudio\s+\S+\s+:pulseaudio/m.test(c)
    const recordPlug = /^audio-record\s+(\S+)\s+(\S+)/m.exec(c)
    if (pulse && recordPlug && recordPlug[2] === '-') out.push(name)
  }
  return out.filter((n) => /^[a-z0-9-]+$/.test(n))
}

// One click instead of a terminal: apt through the system password prompt (pkexec), the
// rest as the user. PipeWire takes over from PulseAudio right away.
async function setupAudio(progress: (step: string) => void): Promise<{ ok: boolean; message: string }> {
  const run = (cmd: string, args: string[], timeout = 600000): Promise<{ code: number; out: string }> =>
    new Promise((resolve) => execFile(cmd, args, { timeout }, (err, out, errOut) => resolve({ code: err ? (typeof (err as any).code === 'number' ? (err as any).code : 1) : 0, out: out + errOut })))
  const need = ['pipewire', 'wireplumber', 'libspa-0.2-bluetooth', 'gstreamer1.0-pipewire', 'gstreamer1.0-pulseaudio']
  const missing: string[] = []
  for (const p of need) if (!/^ii/m.test(await sh('dpkg-query', ['-W', '-f', '${db:Status-Abbrev}', p]))) missing.push(p)
  if (missing.length) {
    progress('Installing call-audio support (enter your password in the system prompt)…')
    const apt = await run('pkexec', ['env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', 'install', '-y', ...missing])
    if (apt.code === 126 || apt.code === 127) return { ok: false, message: 'Cancelled: the password prompt was closed.' }
    if (apt.code !== 0) return { ok: false, message: 'Installing failed: ' + apt.out.split('\n').filter(Boolean).slice(-2).join(' ') }
  }
  // PulseAudio stays the sound system: undo an earlier full switch to PipeWire if there was one
  progress('Keeping PulseAudio as your sound system…')
  await run('systemctl', ['--user', 'unmask', 'pulseaudio'], 30000)
  await run('systemctl', ['--user', '--now', 'disable', 'pipewire-pulse.service', 'pipewire-pulse.socket'], 30000)
  // installing pipewire-pulse enables it system-wide; only a user mask stops it taking over
  // PulseAudio's place at the next login (that leaves just "Dummy Output")
  await run('systemctl', ['--user', 'mask', 'pipewire-pulse.service', 'pipewire-pulse.socket'], 30000)
  await run('systemctl', ['--user', '--now', 'enable', 'pulseaudio.service', 'pulseaudio.socket'], 30000)
  progress('Turning on the hands-free role for phone calls…')
  const msg = await configureHfp()
  await run('systemctl', ['--user', 'restart', 'pulseaudio'], 30000)
  return { ok: true, message: msg }
}

// WirePlumber 0.4 reads Lua config (bluetooth.lua.d), 0.5 reads .conf fragments.
async function wireplumberFlavor(): Promise<'lua' | 'conf' | null> {
  const v = (await sh('dpkg-query', ['-W', '-f', '${Version}', 'wireplumber'])).match(/(\d+)\.(\d+)/)
  if (v) return +v[1] === 0 && +v[2] < 5 ? 'lua' : 'conf'
  if (fs.existsSync('/usr/share/wireplumber/bluetooth.lua.d')) return 'lua'
  if (fs.existsSync('/usr/share/wireplumber/wireplumber.conf.d') || fs.existsSync('/usr/share/wireplumber/wireplumber.conf')) return 'conf'
  return null
}

// Side-by-side mode: PulseAudio keeps the sound card, earbuds and A2DP; PipeWire only takes the
// phone's hands-free call link (this PC = hands-free unit), which D-Connect bridges into PulseAudio.
async function configureHfp(): Promise<string> {
  const flavor = await wireplumberFlavor()
  if (!flavor) return 'WirePlumber is not installed. Press "Set up call audio" to install it.'
  if (flavor === 'lua') {
    fs.mkdirSync(path.dirname(WP_04_ALSA), { recursive: true })
    const sys = fs.existsSync('/usr/share/wireplumber/main.lua.d/90-enable-all.lua') ? fs.readFileSync('/usr/share/wireplumber/main.lua.d/90-enable-all.lua', 'utf8') : ''
    fs.writeFileSync(WP_04_ALSA, '-- D-Connect: PulseAudio owns the sound card; PipeWire only handles phone calls over Bluetooth\n' + sys.replace(/^alsa_monitor\.enable\(\)/m, '-- alsa_monitor.enable()'))
    fs.mkdirSync(path.dirname(WP_04), { recursive: true })
    fs.writeFileSync(
      WP_04,
      `-- D-Connect: WirePlumber only takes the phone's hands-free call link (HFP, this PC = hands-free
-- unit). PulseAudio keeps the sound card, earbuds and A2DP (it already holds those, so PipeWire's
-- music side simply doesn't register); D-Connect bridges calls into PulseAudio.
-- (Don't empty "bluez5.codecs": PipeWire then treats itself as broken and makes no devices.)
bluez_monitor.properties["bluez5.headset-roles"] = "[ hfp_hf ]"
bluez_monitor.properties["bluez5.hfphsp-backend"] = "native"
bluez_monitor.enable()
`
    )
  } else {
    fs.mkdirSync(path.dirname(WP_05), { recursive: true })
    fs.writeFileSync(
      WP_05,
      `# D-Connect: PipeWire only handles the phone's hands-free call link; PulseAudio keeps the rest
wireplumber.profiles = { main = { monitor.alsa = disabled } }
monitor.bluez.properties = {
  bluez5.roles = [ hfp_hf ]
  bluez5.hfphsp-backend = "native"
}
`
    )
  }
  // start WirePlumber after PulseAudio, so PulseAudio's Bluetooth music endpoints come first
  // and earbuds keep going to PulseAudio; WirePlumber then only takes phone calls
  const dropIn = path.join(os.homedir(), '.config/systemd/user/wireplumber.service.d/dconnect-order.conf')
  fs.mkdirSync(path.dirname(dropIn), { recursive: true })
  fs.writeFileSync(dropIn, '[Unit]\n# D-Connect: PulseAudio first (earbuds), WirePlumber only for phone calls\nAfter=pulseaudio.service pulseaudio.socket\nWants=pulseaudio.service\n')
  await sh('systemctl', ['--user', 'daemon-reload'], 15000)
  await sh('systemctl', ['--user', 'enable', '--now', 'pipewire.socket', 'pipewire', 'wireplumber'], 15000)
  await sh('systemctl', ['--user', 'restart', 'wireplumber'], 15000)
  await quietPhonesInPulse()
  return 'Done. Call audio is ready, and PulseAudio stays your sound system.'
}

export const PIPEWIRE_STEPS = [
  'sudo apt install pipewire wireplumber libspa-0.2-bluetooth gstreamer1.0-pipewire gstreamer1.0-pulseaudio',
  'Then press "Set up call audio": PulseAudio stays your sound system; PipeWire only carries phone calls.'
]

// PulseAudio must never auto-play a phone's own audio through the laptop: when it did, its
// cork rule paused/ducked Spotify and Teams for a moment every time the phone made a sound.
async function quietPhonesInPulse(): Promise<void> {
  const file = path.join(os.homedir(), '.config/pulse/default.pa')
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      `# Your normal PulseAudio setup...
.include /etc/pulse/default.pa

# D-Connect: never auto-play a phone's own audio (music/notifications, or its call audio as an
# old-style headset) through the laptop; earbuds and headsets are unaffected.
.ifexists module-bluetooth-policy.so
unload-module module-bluetooth-policy
load-module module-bluetooth-policy a2dp_source=false ag=false
.endif
`
    )
  }
  const mods = await sh('pactl', ['list', 'modules'])
  if (/Name: module-bluetooth-policy\s+Argument: \n/.test(mods) || !/a2dp_source=false/.test(mods)) {
    await sh('pactl', ['unload-module', 'module-bluetooth-policy'])
    await sh('pactl', ['load-module', 'module-bluetooth-policy', 'a2dp_source=false', 'ag=false'])
  }
}

export async function fixCallLink(ctx: Ctx, phoneNames: string[]): Promise<{ ok: boolean; message: string }> {
  const s = await status(phoneNames)
  if (!s.phone?.address || !s.phone.paired) return { ok: false, message: 'Pair the phone first.' }
  if (s.phone.callLink) return { ok: true, message: 'The call link is open.' }
  const pc = await pcBtAddress()
  if (pc && ctx.hub.session) await ctx.hub.request('bt.refresh', { address: pc }, 8000).catch(() => null)
  const path = `/org/bluez/hci0/dev_${s.phone.address.replace(/:/g, '_')}`
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    await sh('busctl', ['call', 'org.bluez', path, 'org.bluez.Device1', 'ConnectProfile', 's', '0000111f-0000-1000-8000-00805f9b34fb'], 12000)
    await new Promise((r) => setTimeout(r, 1500))
    if (await callLinkUp(s.phone.address)) {
      ctx.emit('bt.changed', true)
      return { ok: true, message: 'Call link is open. Calls you take on this PC will play here.' }
    }
  }
  return {
    ok: false,
    message: `Couldn't open the call link to ${s.phone.name}. Check the phone's Bluetooth is on and near the laptop, and that “Phone calls” is on for “${os.hostname()}” in its Bluetooth settings.`
  }
}

export function bluetooth(ctx: Ctx): void {
  // after the switch, offer to fix snaps that lost the mic (e.g. Teams)
  ctx.handle('snapsNeedingMic', () => (process.platform === 'linux' ? snapsNeedingMic() : []))
  ctx.handle('fixSnapMics', async () => {
    const snaps = await snapsNeedingMic()
    if (!snaps.length) return { ok: true, message: 'All apps already have microphone access.' }
    const code = await new Promise<number>((resolve) => execFile('pkexec', ['sh', '-c', snaps.map((n) => `snap connect ${n}:audio-record`).join(' && ')], { timeout: 120000 }, (err) => resolve(err ? 1 : 0)))
    return code === 0 ? { ok: true, message: `Microphone access restored for ${snaps.join(', ')}. Restart those apps.` } : { ok: false, message: 'Cancelled.' }
  })
  let phoneBtName = ''
  const names = (): string[] => [phoneBtName, ctx.hub.session?.device.name || ''].filter(Boolean)
  ctx.handle('btStatus', () => status(names()))
  ctx.handle('btSetupAudio', () => setupAudio((step) => ctx.emit('bt.progress', step)))
  // Pair without touching Bluetooth settings: the PC tells the phone its address, the phone
  // starts bonding (both show a confirm prompt), then the PC trusts and connects it for calls.
  ctx.handle('btPairPhone', async () => {
    await sh('bluetoothctl', ['power', 'on'])
    await sh('bluetoothctl', ['pairable', 'on'])
    await sh('bluetoothctl', ['discoverable', 'on'])
    const address = /Controller\s+([0-9A-F:]{17})/i.exec(await sh('bluetoothctl', ['show']))?.[1]
    if (!address) return { ok: false, message: 'No Bluetooth adapter on this PC.' }
    // Accept the pairing on this side ourselves (no desktop dialog to miss): a temporary
    // Bluetooth agent that says yes, for the next 90 seconds only.
    startAgent()
    ctx.hub.send('bt.pair', { address })
    ctx.emit('bt.progress', 'Confirm the pairing on your phone…')
    return { ok: true }
  })
  let agent: import('child_process').ChildProcessWithoutNullStreams | null = null
  let agentTimer: NodeJS.Timeout | null = null
  const stopAgent = (): void => {
    if (agentTimer) clearTimeout(agentTimer)
    agent?.stdin.write('quit\n')
    setTimeout(() => agent?.kill(), 500)
    agent = null
  }
  const startAgent = (): void => {
    stopAgent()
    const p = spawn('bluetoothctl', [], { stdio: 'pipe' })
    agent = p
    p.on('error', () => {})
    p.stdout.on('data', (d: Buffer) => {
      const t = d.toString()
      // "Confirm passkey 123456 (yes/no):", "Authorize service ... (yes/no):", "Accept pairing (yes/no):"
      if (/\(yes\/no\)/i.test(t)) p.stdin.write('yes\n')
    })
    p.stdin.write('power on\nagent NoInputNoOutput\ndefault-agent\npairable on\ndiscoverable on\n')
    agentTimer = setTimeout(stopAgent, 90000)
  }

  const finishPairing = async (): Promise<void> => {
    stopAgent()
    for (let i = 0; i < 10; i++) {
      const s = await status(names())
      if (s.phone?.address && s.phone.paired) {
        await sh('bluetoothctl', ['trust', s.phone.address]) // reconnects by itself from now on
        await sh('bluetoothctl', ['discoverable', 'off'])
        ctx.emit('bt.progress', 'Paired. Connecting call audio…')
        const out = await sh('bluetoothctl', ['connect', s.phone.address], 20000)
        ctx.emit('bt.progress', /successful/i.test(out) ? 'Connected for calls.' : 'Paired. Connect again if calls don\'t come through yet.')
        ctx.emit('bt.changed', true)
        return
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
    ctx.emit('bt.progress', 'Paired on the phone, but this PC hasn\'t seen it yet. Press Pair again.')
  }
  ctx.handle('btConfigure', () => configureHfp())
  ctx.handle('btSteps', () => PIPEWIRE_STEPS)
  ctx.hub.on('disconnected', () => (phoneBtName = ''))
  // Open the call link: the phone re-reads this PC's capabilities, then the PC connects.
  ctx.handle('btFixCallLink', async () => {
    const r = await fixCallLink(ctx, names())
    void pollLink()
    if (!r.ok) ctx.toast({ kind: 'info', title: 'Call link not connected', body: r.message, ttl: 12000 })
    return r
  })
  let link = { connected: false, callLink: false }
  const pollLink = async (): Promise<void> => {
    if (!ctx.hub.session) return
    const st = await status(names()).catch(() => null)
    const next = { connected: !!st?.phone?.connected, callLink: !!st?.phone?.callLink }
    if (next.connected !== link.connected || next.callLink !== link.callLink) {
      link = next
      ctx.emit('btlink', link)
    }
  }
  setInterval(pollLink, 12000)
  ctx.hub.on('connected', () => setTimeout(pollLink, 2000))

  ctx.hub.on('disconnected', () => {
    link = { connected: false, callLink: false }
    ctx.emit('btlink', link)
  })
  ctx.handle('btLink', () => link)
  ctx.handle('btConnect', async (address: string) => {
    await sh('bluetoothctl', ['power', 'on'])
    const out = await sh('bluetoothctl', ['connect', address], 20000)
    return /Connection successful/i.test(out)
  })
  ctx.handle('btDiscoverable', async () => {
    await sh('bluetoothctl', ['power', 'on'])
    await sh('bluetoothctl', ['discoverable', 'on'])
    await sh('bluetoothctl', ['pairable', 'on'])
    return true
  })
  // the phone tells us its Bluetooth MAC so we can connect to it for calls
  ctx.hub.on('message', (type, data) => {
    if (type !== 'bt.bond') return
    if (data?.state === 'bonded') finishPairing()
    else if (data?.state === 'failed') ctx.emit('bt.progress', data.message || 'Pairing was cancelled.')
    else if (data?.state === 'bonding') ctx.emit('bt.progress', 'Pairing… confirm the code on both screens.')
  })
  // ---------------------------------------------------------------- automatic call link
  // When the phone connects (or its Bluetooth comes on), make sure its Bluetooth is on and open
  // the hands-free call link, quietly. No buttons unless it keeps failing.
  let autoBusy = false
  let autoFails = 0
  // adb from the Android SDK when it isn't on PATH (apps started from the menu often lack it)
  const ADB = adbPath()
  const adbSerial = async (): Promise<string | null> => {
    const out = await sh(ADB, ['devices', '-l'])
    const model = (ctx.hub.session?.device.model || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const lines = out.split('\n').slice(1).filter((l) => /\sdevice\s/.test(l + ' '))
    const hit = lines.find((l) => model && model.includes((/model:(\S+)/.exec(l)?.[1] || '#').toLowerCase().replace(/[^a-z0-9]/g, '')))
    return hit ? hit.split(/\s+/)[0] : null
  }
  const turnPhoneBtOn = async (): Promise<boolean> => {
    // on USB with debugging allowed: switch it on directly, no taps
    const serial = await adbSerial()
    if (serial) {
      await sh(ADB, ['-s', serial, 'shell', 'svc', 'bluetooth', 'enable'], 8000)
      await sh(ADB, ['-s', serial, 'shell', 'cmd', 'bluetooth_manager', 'enable'], 8000)
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 800))
        const info: any = await ctx.hub.request('bt.ensure', {}, 4000).catch(() => null)
        if (info?.enabled) return true
      }
    }
    // otherwise Android's one-tap "turn on Bluetooth" prompt on the phone
    const r: any = await ctx.hub.request('bt.ensure', {}, 6000).catch(() => null)
    return !!r?.enabled
  }
  const autoCallLink = async (phoneBtOn?: boolean): Promise<void> => {
    if (autoBusy || !ctx.hub.session) return
    autoBusy = true
    try {
      const s = await status(names())
      if (!s.hfpConfigured || !s.adapter) return
      if (phoneBtOn === false && !(await turnPhoneBtOn())) return
      if (!s.phone?.paired) return // pairing needs the user once (Settings → Pair)
      if (s.phone.callLink) {
        autoFails = 0
        return
      }
      await new Promise((r) => setTimeout(r, 2500)) // let the phone's Bluetooth settle
      const r = await fixCallLink(ctx, names())
      autoFails = r.ok ? 0 : autoFails + 1
      ctx.emit('bt.changed', true)
    } finally {
      autoBusy = false
    }
  }
  ctx.hub.on('message', async (type, data) => {
    if (type === 'bt.state') {
      if (data?.on) setTimeout(() => autoCallLink(true), 1500)
      return
    }
    if (type !== 'bt.info' || !ctx.hub.session) return
    phoneBtName = data?.name || ''
    autoCallLink(data?.enabled !== false)
  })
  // keep trying now and then while linked (phone walked away and came back, etc.)
  let autoTick = 0
  setInterval(() => {
    autoTick++
    // every minute at first, then every 5 minutes after repeated failures (never give up)
    if (ctx.hub.session && (autoFails < 5 || autoTick % 5 === 0)) autoCallLink()
  }, 60000)
}
