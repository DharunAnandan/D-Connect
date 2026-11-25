// Clipboard both ways, with a history that remembers where each item was copied (this PC or the
// phone). Copying an older item again only puts it on that device's clipboard: it isn't
// re-labelled or sent across. Polls the PC clipboard (Electron has no change event).
import { clipboard } from 'electron'
import type { Ctx } from '../context'

export interface ClipItem {
  text: string
  from: 'pc' | 'phone'
  time: number
}

export function clipboardSync(ctx: Ctx): void {
  let last = ''
  let busy = false
  clipboard.readText().then((t) => (last = t))
  const history: ClipItem[] = []
  const publish = (): void => {
    ctx.emit('clips', history)
    if (ctx.hub.session) ctx.hub.send('clip.history', { items: history.slice(0, 40) })
  }
  const add = (text: string, from: ClipItem['from']): void => {
    if (!text.trim()) return
    const i = history.findIndex((h) => h.text === text && h.from === from)
    if (i >= 0) history.splice(i, 1)
    history.unshift({ text, from, time: Date.now() })
    if (history.length > 80) history.length = 80
    publish()
  }
  // put text on this PC's clipboard without treating it as a new copy
  const writeQuietly = (text: string): void => {
    last = text
    clipboard.writeText(text)
  }

  setInterval(async () => {
    if (busy) return
    busy = true
    const now = await clipboard.readText().catch(() => last)
    busy = false
    if (now === last) return
    last = now
    add(now, 'pc')
    if (ctx.store.get('clipboardSync') && now.length < 1_000_000) ctx.hub.send('clip.set', { text: now })
  }, 700)

  ctx.hub.on('message', (type, data) => {
    if (type !== 'clip.set' || typeof data?.text !== 'string') return
    // something copied on the phone: always in the "From phone" list; on this PC's clipboard
    // too when the shared clipboard is on
    add(data.text, 'phone')
    if (ctx.store.get('clipboardSync')) writeQuietly(data.text)
  })
  ctx.hub.on('connected', () => setTimeout(publish, 1500))

  ctx.handle('clips', () => history)
  ctx.handle('clipCopy', (text: string) => writeQuietly(text)) // take an item onto this PC
  ctx.handle('clipToPhone', (text: string) => ctx.hub.send('clip.put', { text })) // put an item on the phone
  ctx.handle('clipRemove', (text: string, from: ClipItem['from']) => {
    const i = history.findIndex((h) => h.text === text && h.from === from)
    if (i >= 0) history.splice(i, 1)
    publish()
  })
  ctx.handle('clipClear', () => {
    history.length = 0
    publish()
  })
  ctx.handle('clipSendNow', async () => ctx.hub.send('clip.set', { text: await clipboard.readText() }))
}
