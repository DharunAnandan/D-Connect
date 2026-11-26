// Phone notifications: mirrored into the feed and as toasts; dismiss, reply and actions go back.
import type { PhoneNotification } from '@shared/protocol'
import type { Ctx } from '../context'

export function notifications(ctx: Ctx, appCall: (n: PhoneNotification | null) => void = () => {}): void {
  const list = new Map<string, PhoneNotification>()
  const push = (): void => ctx.emit('notifs', [...list.values()].sort((a, b) => b.time - a.time))

  ctx.hub.on('message', (type, data) => {
    if (type === 'notif.posted') {
      const n = data as PhoneNotification
      // WhatsApp & co. reuse one notification per chat: a new message changes its text/time
      const prev = list.get(n.key)
      // a chat whose newest message is your own reply: update it, no alert
      const lastThread = (x?: PhoneNotification): string => JSON.stringify(x?.thread?.slice(-1) || x?.text || '')
      const isNew = !n.fromMe && (!prev || ((n.text !== prev.text || lastThread(n) !== lastThread(prev)) && n.time >= prev.time))
      list.set(n.key, n)
      push()
      // Teams / WhatsApp / ... calls: the call card, not a toast
      if (n.category === 'call' && (n.actions || []).some((a) => /answer|accept|pick up|join/i.test(a))) {
        appCall(n)
        return
      }
      if (isNew && ctx.store.get('notifyToasts') && !ctx.store.get('mutedApps').includes(n.pkg)) {
        ctx.toast({
          id: 'n:' + n.key,
          kind: 'notification',
          app: n.app,
          title: n.title || n.app,
          // a chat: its last few lines, your replies marked
          body: n.thread && n.thread.length > 1 ? n.thread.slice(-3).map((m) => `${m.me ? 'You' : m.from && m.from !== n.title ? m.from : ''}${m.me || (m.from && m.from !== n.title) ? ': ' : ''}${m.text}`).join('\n') : n.text,
          icon: n.icon ? `data:image/png;base64,${n.icon}` : undefined,
          image: n.picture ? `data:image/jpeg;base64,${n.picture}` : undefined,
          reply: n.canReply ? { kind: 'notif', key: n.key } : undefined,
          meta: { key: n.key, pkg: n.pkg, app: n.app },
          actions: (n.actions || []).slice(0, 2).map((label, i) => ({ id: `notif-action:${n.key}:${i}`, label }))
        })
      }
    } else if (type === 'notif.removed') {
      if (list.get(data.key)?.category === 'call') appCall({ key: data.key } as PhoneNotification)
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
  ctx.handle('notifReply', (key: string, text: string) => sendReply(ctx, key, text))
  ctx.handle('notifAction', (key: string, index: number) => ctx.hub.send('notif.action', { key, index }))
  ctx.handle('muteApp', (pkg: string, muted: boolean) => {
    const set = new Set(ctx.store.get('mutedApps'))
    if (muted) set.add(pkg)
    else set.delete(pkg)
    ctx.store.set('mutedApps', [...set])
  })
}

const REPLY_ERRORS: Record<string, string> = {
  'no-access': 'Turn on Notification access for D-Connect on the phone.',
  gone: 'That notification is gone from the phone, so it can no longer be answered.',
  'no-reply-action': "This app's notification has no reply box.",
}

// Send a reply and tell the user if the phone couldn't deliver it.
export async function sendReply(ctx: Ctx, key: string, text: string): Promise<boolean> {
  const r: any = await ctx.hub.request('notif.reply', { key, text }, 10000).catch(() => null)
  const result = r?.result as string | undefined
  if (result === 'ok') return true
  ctx.toast({ kind: 'info', title: 'Reply not sent', body: (result && REPLY_ERRORS[result]) || `The phone couldn't send it${result ? ` (${result})` : ''}.`, ttl: 9000 })
  return false
}
