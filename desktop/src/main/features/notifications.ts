// Phone notifications: mirrored into the feed and as toasts; dismiss, reply and actions go back.
import type { PhoneNotification } from '@shared/protocol'
import type { Ctx } from '../context'

export function notifications(ctx: Ctx): void {
  const list = new Map<string, PhoneNotification>()
  const push = (): void => ctx.emit('notifs', [...list.values()].sort((a, b) => b.time - a.time))

  ctx.hub.on('message', (type, data) => {
    if (type === 'notif.posted') {
      const n = data as PhoneNotification
      const isNew = !list.has(n.key)
      list.set(n.key, n)
      push()
      if (isNew && ctx.store.get('notifyToasts') && !ctx.store.get('mutedApps').includes(n.pkg)) {
        ctx.toast({
          id: 'n:' + n.key,
          kind: 'notification',
          app: n.app,
          title: n.title || n.app,
          body: n.text,
          icon: n.icon ? `data:image/png;base64,${n.icon}` : undefined,
          reply: n.canReply ? { kind: 'notif', key: n.key } : undefined,
          actions: (n.actions || []).slice(0, 2).map((label, i) => ({ id: `notif-action:${n.key}:${i}`, label }))
        })
      }
    } else if (type === 'notif.removed') {
      list.delete(data.key)
      push()
    } else if (type === 'notif.all') {
      list.clear()
      for (const n of data.items as PhoneNotification[]) list.set(n.key, n)
      push()
    }
  })
  ctx.hub.on('disconnected', () => {
    list.clear()
    push()
  })

  ctx.handle('notifs', () => [...list.values()].sort((a, b) => b.time - a.time))
  ctx.handle('notifDismiss', (key: string) => {
    list.delete(key)
    push()
    ctx.hub.send('notif.dismiss', { key })
  })
  ctx.handle('notifClear', () => {
    for (const key of list.keys()) ctx.hub.send('notif.dismiss', { key })
    list.clear()
    push()
  })
  ctx.handle('notifReply', (key: string, text: string) => ctx.hub.send('notif.reply', { key, text }))
  ctx.handle('notifAction', (key: string, index: number) => ctx.hub.send('notif.action', { key, index }))
  ctx.handle('muteApp', (pkg: string, muted: boolean) => {
    const set = new Set(ctx.store.get('mutedApps'))
    if (muted) set.add(pkg)
    else set.delete(pkg)
    ctx.store.set('mutedApps', [...set])
  })
}
