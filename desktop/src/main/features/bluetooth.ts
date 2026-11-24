// Take calls on the laptop: the PC becomes a Bluetooth hands-free unit (HFP HF) for the phone,
// so call audio plays through the laptop's speakers and mic. Needs PipeWire with the hfp_hf
// role (Ubuntu 22.04 ships PulseAudio, which can't do it without oFono). This module reports
// what's there, pairs/connects through BlueZ and writes the WirePlumber config.
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Ctx } from '../context'

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
  phone: { name: string; address?: string; paired: boolean; connected: boolean } | null // the phone linked to D-Connect
  canAutoSetup: boolean
  ready: boolean
}

const WP_04 = path.join(os.homedir(), '.config/wireplumber/bluetooth.lua.d/90-enable-all.lua')
const WP_04_ALSA = path.join(os.homedir(), '.config/wireplumber/main.lua.d/90-enable-all.lua')
const WP_05 = path.join(os.homedir(), '.config/wireplumber/wireplumber.conf.d/51-dconnect-hfp.conf')

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
  const phone = wanted.length ? (match ? { ...match } : { name: phoneNames.find(Boolean)!, paired: false, connected: false }) : null
  const canAutoSetup = !!(await sh('which', ['pkexec'])).trim()
  return { platform: 'linux', adapter, powered, audioServer, wireplumber: wpv, hfpConfigured, devices, phone, canAutoSetup, ready: adapter && powered && hfpConfigured && !!match?.connected }
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
  return 'Done. Call audio is ready, and PulseAudio stays your sound system.'
}

export const PIPEWIRE_STEPS = [
  'sudo apt install pipewire wireplumber libspa-0.2-bluetooth gstreamer1.0-pipewire gstreamer1.0-pulseaudio',
  'Then press "Set up call audio": PulseAudio stays your sound system; PipeWire only carries phone calls.'
]

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
    ctx.hub.send('bt.pair', { address })
    ctx.emit('bt.progress', 'Confirm the pairing code on your phone and on this PC…')
    return { ok: true }
  })
  const finishPairing = async (): Promise<void> => {
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
  ctx.hub.on('message', async (type, data) => {
    if (type !== 'bt.info' || !ctx.hub.session) return
    phoneBtName = data?.name || ''
    // connect call audio to this phone (and only this phone) when it's already paired
    const s = await status(names())
    if (s.phone?.address && s.phone.paired && !s.phone.connected && s.hfpConfigured) {
      sh('bluetoothctl', ['connect', s.phone.address], 20000)
    }
  })
}
