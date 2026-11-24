// Clipboard both ways, with a history. Polls the PC clipboard (Electron has no change event).
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
  const add = (text: string, from: ClipItem['from']): void => {
    if (!text.trim()) return
    const i = history.findIndex((h) => h.text === text)
    if (i >= 0) history.splice(i, 1)
    history.unshift({ text, from, time: Date.now() })
    history.length = Math.min(history.length, 40)
    ctx.emit('clips', history)
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
    if (type !== 'clip.set' || !ctx.store.get('clipboardSync')) return
    last = data.text
    clipboard.writeText(data.text)
    add(data.text, 'phone')
  })

  ctx.handle('clips', () => history)
  ctx.handle('clipCopy', (text: string) => {
    clipboard.writeText(text)
  })
  ctx.handle('clipSendNow', async () => ctx.hub.send('clip.set', { text: await clipboard.readText() }))
}
