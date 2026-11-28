// The extras: find my phone / find my PC, proximity lock, quick commands, link and text
// sharing, battery alerts, DND sync, phone status.
import { exec, execFile } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import { app, shell, powerSaveBlocker } from 'electron'
import path from 'path'
import type { PhoneStatus, QuickCommand } from '@shared/protocol'
import type { Ctx } from '../context'
import { pressKeys } from './input'
import { openUrlSafely } from '../safety'
import { screenRecorder } from './screenrec'

export const BUILTIN: QuickCommand[] = [
  { id: 'lock', name: 'Lock PC', icon: 'lock', builtin: true },
  { id: 'sleep', name: 'Sleep', icon: 'moon', builtin: true },
  { id: 'mute', name: 'Mute audio', icon: 'volume-x', builtin: true, toggle: true },
  { id: 'screenshot', name: 'Screenshot', icon: 'camera', builtin: true },
  { id: 'shotarea', name: 'Screenshot area', icon: 'crop', builtin: true },
  { id: 'record', name: 'Screen record', icon: 'video', builtin: true, toggle: true },
  { id: 'recarea', name: 'Record area', icon: 'video-area', builtin: true },
  { id: 'awake', name: 'Keep awake', icon: 'coffee', builtin: true, toggle: true }
]

export function lockPc(): void {
  if (process.platform === 'win32') execFile('rundll32.exe', ['user32.dll,LockWorkStation'])
  else execFile('loginctl', ['lock-session'], (err) => err && execFile('xdg-screensaver', ['lock']))
}

let phoneRinging = false

export function system(ctx: Ctx, findPc: (on: boolean) => void): void {
  let status: PhoneStatus | null = null
  let lockTimer: NodeJS.Timeout | null = null
  let lowAlerted = false
  let fullAlerted = false
  let awakeId: number | null = null

  // the switches' current state, so the phone shows ON / OFF
  let pcMuted = false
  const readMute = (): Promise<boolean> =>
    new Promise((resolve) => {
      if (process.platform !== 'linux') return resolve(false)
      execFile('pactl', ['get-sink-mute', '@DEFAULT_SINK@'], { env: { ...process.env, LC_ALL: 'C' } }, (err, out) => resolve(!err && /yes/i.test(out)))
    })
  let recording = false
  const stateOf = (id: string): boolean | undefined => (id === 'mute' ? pcMuted : id === 'awake' ? awakeId !== null : id === 'record' ? recording : undefined)
  // Full-screen recording. Linux: GNOME's own recorder service, started and stopped over one
  // D-Bus connection that stays open (the service ends a recording when its caller goes away).
  // Windows: the Xbox Game Bar shortcut.
  let castBus: any = null
  const castIface = async (): Promise<any> => {
    const dbus = await import('dbus-next')
    castBus = castBus || dbus.sessionBus()
    const obj = await castBus.getProxyObject('org.gnome.Shell.Screencast', '/org/gnome/Shell/Screencast')
    return obj.getInterface('org.gnome.Shell.Screencast')
  }
  let castFile = ''
  const toggleRecording = async (): Promise<void> => {
    if (process.platform === 'win32') {
      try {
        if (!recording) {
          await screenRecorder.start()
          recording = true
          ctx.toast({ kind: 'info', title: 'Screen recording started', body: 'The whole screen. Tap Screen record again to stop.', ttl: 5000 })
        } else {
          const file = await screenRecorder.stop()
          recording = false
          ctx.toast({ kind: 'info', title: 'Screen recording saved', body: file ? path.basename(file) + ' in Videos → D-Connect' : 'Saved in Videos → D-Connect.', ttl: 8000, actions: file ? [{ id: `open-path:${path.dirname(file)}`, label: 'Show folder' }] : undefined })
        }
      } catch {
        recording = false
        ctx.toast({ kind: 'info', title: "Couldn't record the screen", body: 'Windows refused the screen capture.' })
      }
      return sendCommands()
    }
    try {
      const iface = await castIface()
      if (!recording) {
        const dir = path.join(app.getPath('videos'), 'Screencasts')
        fs.mkdirSync(dir, { recursive: true })
        const dbus = await import('dbus-next')
        const [ok, file] = await iface.Screencast(path.join(dir, 'D-Connect %d %t.webm'), { 'draw-cursor': new dbus.Variant('b', true) })
        if (!ok) throw new Error('refused')
        castFile = file
        recording = true
        ctx.toast({ kind: 'info', title: 'Screen recording started', body: 'The whole screen. Tap Screen record again to stop.', ttl: 5000 })
      } else {
        await iface.StopScreencast()
        recording = false
        ctx.toast({ kind: 'info', title: 'Screen recording saved', body: castFile ? path.basename(castFile) + ' in Videos → Screencasts' : 'Saved in Videos → Screencasts.', ttl: 8000, actions: castFile ? [{ id: `open-path:${path.dirname(castFile)}`, label: 'Show folder' }] : undefined })
      }
    } catch {
      recording = false
      ctx.toast({ kind: 'info', title: "Couldn't record the screen", body: 'This desktop has no GNOME screen recorder. Use Record area instead.' })
    }
    sendCommands()
  }
  const commands = (): QuickCommand[] => [...BUILTIN.map((c) => (c.toggle ? { ...c, on: stateOf(c.id) } : c)), ...ctx.store.get('commands').map((c) => ({ ...c, builtin: false }))]
  const sendCommands = (): void => {
    if (ctx.hub.session) ctx.hub.send('commands.list', { commands: commands().map(({ cmd, ...c }) => c) })
  }
  // mute can change from the keyboard or the top bar too: keep the phone's tile honest
  setInterval(async () => {
    if (!ctx.hub.session) return
    const m = await readMute()
    if (m !== pcMuted) {
      pcMuted = m
      sendCommands()
    }
  }, 4000)

  const run = (id: string): void => {
    if (id === 'lock') return lockPc()
    if (id === 'sleep') {
      if (process.platform === 'win32') exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0')
      else execFile('systemctl', ['suspend'])
      return
    }
    if (id === 'mute') {
      if (process.platform === 'linux')
        execFile('pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'], async () => {
          pcMuted = await readMute()
          sendCommands()
        })
      return
    }
    // Screenshot and screen recording go through the desktop's own shortcuts (GNOME on Wayland
    // doesn't let other apps take them directly): pressed on the virtual keyboard.
    if (id === 'screenshot') {
      const ok = pressKeys(process.platform === 'win32' ? ['leftmeta', 'print'] : ['leftshift', 'print'])
      ctx.toast(ok
        ? { kind: 'info', title: 'Screenshot taken', body: process.platform === 'win32' ? 'Saved in Pictures → Screenshots.' : 'Saved in Pictures → Screenshots, and copied to the clipboard.', ttl: 5000 }
        : { kind: 'info', title: "Couldn't take a screenshot", body: 'Allow D-Connect to use the virtual keyboard: Settings → Phone as remote.' })
      return
    }
    if (id === 'shotarea') {
      // the desktop's own screenshot panel: drag the area you want (Linux: GNOME's Print key)
      const ok = pressKeys(process.platform === 'win32' ? ['leftmeta', 'leftshift', 's'] : ['print'])
      if (!ok) ctx.toast({ kind: 'info', title: "Couldn't open the screenshot panel", body: 'Allow D-Connect to use the virtual keyboard: Settings → Phone as remote.' })
      return
    }
    if (id === 'recarea') {
      // GNOME's recording panel: pick an area or a window, then press its record button
      if (process.platform === 'win32') return void ctx.toast({ kind: 'info', title: 'Record area', body: 'Use Screen record on Windows (records the whole screen).' })
      pressKeys(['leftctrl', 'leftshift', 'leftalt', 'r'])
      return
    }
    if (id === 'record') {
      void toggleRecording()
      return
    }
    if (id === 'awake') {
      if (awakeId !== null) {
        powerSaveBlocker.stop(awakeId)
        awakeId = null
      } else awakeId = powerSaveBlocker.start('prevent-display-sleep')
      ctx.toast({ kind: 'info', title: awakeId !== null ? 'PC will stay awake' : 'Keep awake is off' })
      sendCommands()
      return
    }
    const c = ctx.store.get('commands').find((x) => x.id === id)
    if (c) exec(c.cmd, { timeout: 60000 })
  }

  ctx.hub.on('connected', () => {
    if (lockTimer) clearTimeout(lockTimer)
    lockTimer = null
    ctx.hub.send('commands.list', { commands: commands().map(({ cmd, ...c }) => c) })
  })
  ctx.hub.on('disconnected', () => {
    status = null
    ctx.emit('status', null)
    if (ctx.store.get('proximityLock')) {
      lockTimer = setTimeout(() => {
        if (!ctx.hub.session) lockPc()
      }, ctx.store.get('proximityGraceSec') * 1000)
    }
  })

  // this laptop's own battery (Linux): the same low-battery level as the phone
  let pcLowAlerted = false
  // Windows: read through PowerShell every minute (Win32_Battery: 2 = on mains)
  let winBattery: { level: number; charging: boolean } | null = null
  if (process.platform === 'win32') {
    const readWin = (): void => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress'], { timeout: 15000, windowsHide: true }, (err, out) => {
        try {
          const b = JSON.parse(out)
          winBattery = !err && b && Number.isFinite(b.EstimatedChargeRemaining) ? { level: b.EstimatedChargeRemaining, charging: b.BatteryStatus !== 1 } : null
        } catch {
          winBattery = null
        }
      })
    }
    readWin()
    setInterval(readWin, 60000)
  }
  const pcBattery = (): { level: number; charging: boolean } | null => {
    if (process.platform === 'win32') return winBattery
    try {
      const dir = fs.readdirSync('/sys/class/power_supply').find((d) => /^BAT/.test(d))
      if (!dir) return null
      const level = Number(fs.readFileSync(`/sys/class/power_supply/${dir}/capacity`, 'utf8').trim())
      const st = fs.readFileSync(`/sys/class/power_supply/${dir}/status`, 'utf8').trim()
      return Number.isFinite(level) ? { level, charging: /charging|full/i.test(st) && !/discharging/i.test(st) } : null
    } catch {
      return null
    }
  }
  let pcFullAlerted = false
  let pcPrev: number | null = null
  // the laptop's battery alerts: on this PC, and on the phone too when that's on
  const pcAlert = (tag: string, title: string, body: string): void => {
    ctx.toast({ kind: 'battery', title, body, ttl: 12000 })
    if (ctx.store.get('pcAlertsToPhone') !== false && ctx.hub.session) ctx.hub.send('pc.alert', { tag, title, body })
  }
  if (process.platform === 'linux' || process.platform === 'win32') {
    setInterval(() => {
      if (ctx.store.get('pcBatteryAlert') === false) return
      const b = pcBattery()
      if (!b) return
      const low = Number(ctx.store.get('pcLowAlert') ?? 20)
      if (low && b.level <= low && !b.charging && !pcLowAlerted) {
        pcLowAlerted = true
        pcAlert('pc-low', `Laptop battery low · ${b.level}%`, 'Plug in the laptop charger.')
      }
      if (b.charging || b.level > low + 3) pcLowAlerted = false
      const target = Number(ctx.store.get('pcChargeAlert') ?? 0)
      if (target && b.charging && b.level >= target && !pcFullAlerted && pcPrev !== null && pcPrev < target) {
        pcFullAlerted = true
        pcAlert('pc-full', target >= 100 ? 'Laptop fully charged' : `Laptop charged to ${b.level}%`, target >= 100 ? 'You can unplug the charger.' : `It reached your ${target}% limit. Unplug it to go easy on the battery.`)
      }
      if (!b.charging || b.level < target - 3) pcFullAlerted = false
      pcPrev = b.level
    }, 60000)
  }

  ctx.hub.on('message', (type, data) => {
    if (type === 'phone.status') {
      const prev = status
      status = data
      ctx.emit('status', status)
      // battery alerts at the levels chosen in Settings
      const low = Number(ctx.store.get('lowBatteryAlert') ?? 20)
      if (low && data.battery <= low && !data.charging && !lowAlerted) {
        lowAlerted = true
        ctx.toast({ kind: 'battery', title: `Phone battery low · ${data.battery}%`, body: data.battery <= 10 ? 'Plug it in soon, it may switch off.' : 'Time to plug it in.', ttl: 12000 })
      }
      if (data.charging || data.battery > low + 3) lowAlerted = false
      const target = Number(ctx.store.get('chargeAlert') ?? 100)
      if (target && data.charging && data.battery >= target && !fullAlerted && prev?.battery !== undefined && prev.battery < target) {
        fullAlerted = true
        ctx.toast({ kind: 'battery', title: target >= 100 ? 'Phone fully charged' : `Phone charged to ${data.battery}%`, body: target >= 100 ? 'You can unplug it now.' : `It reached your ${target}% limit. Unplug it to go easy on the battery.`, ttl: 12000 })
      }
      if (!data.charging || data.battery < target - 3) fullAlerted = false
      if (ctx.store.get('dndSync') && prev && prev.dnd !== data.dnd) ctx.emit('dnd', data.dnd)
    } else if (type === 'commands.run') run(data.id)
    else if (type === 'find.pc') findPc(data.on !== false)
    else if (type === 'find.ring.state') {
      phoneRinging = data.on === true
      ctx.emit('findphone', phoneRinging)
    }
    else if (type === 'share.url') {
      ctx.toast({ kind: 'link', title: 'Link from your phone', body: data.url, actions: [{ id: `open-url:${data.url}`, label: 'Open' }, { id: `copy:${data.url}`, label: 'Copy' }] })
      if (data.open) openUrlSafely(data.url) // web links only
    } else if (type === 'share.text') {
      ctx.toast({ kind: 'clip', title: 'Text from your phone', body: data.text, actions: [{ id: `copy:${data.text}`, label: 'Copy' }] })
    }
  })

  ctx.handle('status', () => status)
  ctx.handle('findPhone', (on: boolean) => ctx.hub.send('find.ring', { on }))
  ctx.handle('phoneRinging', () => phoneRinging)
  // "Found it" on this PC: tell the phone the PC stopped ringing
  ctx.handle('findPcDone', () => ctx.hub.send('find.pc.state', { on: false }))
  ctx.hub.on('disconnected', () => {
    phoneRinging = false
    ctx.emit('findphone', false)
  })
  ctx.handle('shareUrl', (url: string) => ctx.hub.send('share.url', { url }))
  ctx.handle('shareText', (text: string) => ctx.hub.send('share.text', { text }))
  ctx.handle('setPhoneDnd', (on: boolean) => ctx.hub.send('dnd.set', { on }))
  ctx.handle('pcBattery', () => pcBattery())
  ctx.handle('commands', () => commands())
  ctx.handle('runCommand', (id: string) => run(id))
  ctx.handle('saveCommand', (c: { id?: string; name: string; icon: string; cmd: string }) => {
    const list = [...ctx.store.get('commands')]
    const id = c.id || crypto.randomUUID()
    const i = list.findIndex((x) => x.id === id)
    if (i >= 0) list[i] = { ...c, id }
    else list.push({ ...c, id })
    ctx.store.set('commands', list)
    ctx.hub.send('commands.list', { commands: commands().map(({ cmd, ...x }) => x) })
  })
  ctx.handle('deleteCommand', (id: string) => {
    ctx.store.set('commands', ctx.store.get('commands').filter((c) => c.id !== id))
    ctx.hub.send('commands.list', { commands: commands().map(({ cmd, ...x }) => x) })
  })
}
