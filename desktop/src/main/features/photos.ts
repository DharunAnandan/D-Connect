// Recent photos: thumbnails come in pages; a full photo comes as a file tagged "photo".
import { shell } from 'electron'
import type { Ctx } from '../context'
import type { Transfer } from './files'

export function photos(ctx: Ctx, onPhoto: (fn: (t: Transfer) => void) => void): void {
  const waiting = new Map<string, (path: string) => void>()
  onPhoto((t) => {
    ctx.emit('photo.saved', { name: t.name, path: t.path })
    for (const [id, fn] of waiting) {
      fn(t.path!)
      waiting.delete(id)
      break
    }
  })
  ctx.handle('photos', (offset = 0, limit = 60) => ctx.hub.request('photos.get', { offset, limit }, 30000))
  ctx.handle('photoFetch', (id: string, open = true) =>
    new Promise<string>((resolve) => {
      waiting.set(id, (p) => {
        if (open) shell.openPath(p)
        resolve(p)
      })
      ctx.hub.send('photos.fetch', { id })
    })
  )
}
