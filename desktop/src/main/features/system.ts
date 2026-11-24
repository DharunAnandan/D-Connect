// The extras: find my phone / find my PC, proximity lock, quick commands, link and text
// sharing, battery alerts, DND sync, phone status.
import { exec, execFile } from 'child_process'
import crypto from 'crypto'
import { shell, powerSaveBlocker } from 'electron'
import type { PhoneStatus, QuickCommand } from '@shared/protocol'
import type { Ctx } from '../context'

export const BUILTIN: QuickCommand[] = [
  { id: 'lock', name: 'Lock PC', icon: 'lock', builtin: true },
  { id: 'sleep', name: 'Sleep', icon: 'moon', builtin: true },
  { id: 'mute', name: 'Mute audio', icon: 'volume-x', builtin: true },
  { id: 'screenshot', name: 'Screenshot', icon: 'camera', builtin: true },
  { id: 'awake', name: 'Keep awake', icon: 'coffee', builtin: true }
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

  const commands = (): QuickCommand[] => [...BUILTIN, ...ctx.store.get('commands').map((c) => ({ ...c, builtin: false }))]

  const run = (id: string): void => {
    if (id === 'lock') return lockPc()
    if (id === 'sleep') {
      if (process.platform === 'win32') exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0')
      else execFile('systemctl', ['suspend'])
      return
    }
    if (id === 'mute') {
      if (process.platform === 'linux') execFile('pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'])
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

  ctx.hub.on('message', (type, data) => {
    if (type === 'phone.status') {
      const prev = status
      status = data
      ctx.emit('status', status)
      const low = ctx.store.get('lowBatteryAlert')
      if (low && data.battery <= low && !data.charging && !lowAlerted) {
        lowAlerted = true
        ctx.toast({ kind: 'battery', title: `Phone battery low · ${data.battery}%`, body: 'Time to plug it in.' })
      }
      if (data.charging || data.battery > low + 5) lowAlerted = false
      if (data.charging && data.battery >= 100 && !fullAlerted && prev?.battery !== undefined && prev.battery < 100) {
        fullAlerted = true
        ctx.toast({ kind: 'battery', title: 'Phone fully charged', body: 'You can unplug it now.' })
      }
      if (!data.charging) fullAlerted = false
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
