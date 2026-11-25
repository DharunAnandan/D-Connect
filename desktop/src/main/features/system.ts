// The extras: find my phone / find my PC, proximity lock, quick commands, link and text
// sharing, battery alerts, DND sync, phone status.
import { exec, execFile } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import { shell, powerSaveBlocker } from 'electron'
import type { PhoneStatus, QuickCommand } from '@shared/protocol'
import type { Ctx } from '../context'

export const BUILTIN: QuickCommand[] = [
  { id: 'lock', name: 'Lock PC', icon: 'lock', builtin: true },
  { id: 'sleep', name: 'Sleep', icon: 'moon', builtin: true },
  { id: 'mute', name: 'Mute audio', icon: 'volume-x', builtin: true, toggle: true },
  { id: 'screenshot', name: 'Screenshot', icon: 'camera', builtin: true },
  { id: 'awake', name: 'Keep awake', icon: 'coffee', builtin: true, toggle: true }
]

export function lockPc(): void {
  if (process.platform === 'win32') execFile('rundll32.exe', ['user32.dll,LockWorkStation'])
  else execFile('loginctl', ['lock-session'], (err) => err && execFile('xdg-screensaver', ['lock']))
}

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
  const stateOf = (id: string): boolean | undefined => (id === 'mute' ? pcMuted : id === 'awake' ? awakeId !== null : undefined)
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
    if (id === 'screenshot') {
      if (process.platform === 'linux') execFile('gnome-screenshot', [], (e) => e && execFile('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell.Screenshot', '--object-path', '/org/gnome/Shell/Screenshot', '--method', 'org.gnome.Shell.Screenshot.Screenshot', 'false', 'true', '']))
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
  const pcBattery = (): { level: number; charging: boolean } | null => {
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
  if (process.platform === 'linux') {
    setInterval(() => {
      const low = Number(ctx.store.get('lowBatteryAlert') ?? 20)
      const b = ctx.store.get('pcBatteryAlert') !== false && low ? pcBattery() : null
      if (!b) return
      if (b.level <= low && !b.charging && !pcLowAlerted) {
        pcLowAlerted = true
        ctx.toast({ kind: 'battery', title: `Laptop battery low · ${b.level}%`, body: 'Plug in the charger.', ttl: 12000 })
      }
      if (b.charging || b.level > low + 3) pcLowAlerted = false
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
    else if (type === 'share.url') {
      ctx.toast({ kind: 'link', title: 'Link from your phone', body: data.url, actions: [{ id: `open-url:${data.url}`, label: 'Open' }, { id: `copy:${data.url}`, label: 'Copy' }] })
      if (data.open) shell.openExternal(data.url)
    } else if (type === 'share.text') {
      ctx.toast({ kind: 'clip', title: 'Text from your phone', body: data.text, actions: [{ id: `copy:${data.text}`, label: 'Copy' }] })
    }
  })

  ctx.handle('status', () => status)
  ctx.handle('findPhone', (on: boolean) => ctx.hub.send('find.ring', { on }))
  ctx.handle('shareUrl', (url: string) => ctx.hub.send('share.url', { url }))
  ctx.handle('shareText', (text: string) => ctx.hub.send('share.text', { text }))
  ctx.handle('setPhoneDnd', (on: boolean) => ctx.hub.send('dnd.set', { on }))
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
