// Files both ways. Chunks go as binary frames; the sender waits on the socket buffer so a
// 4 GB video never sits in memory. Incoming files land in ~/Downloads/D-Connect.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app, shell } from 'electron'
import { Channel, FileOffer } from '@shared/protocol'
import type { Ctx } from '../context'
import { openFileSafely } from '../safety'

const CHUNK = 256 * 1024
const HIGH_WATER = 4 * 1024 * 1024

export interface Transfer {
  fid: string
  name: string
  size: number
  done: number
  dir: 'in' | 'out'
  state: 'waiting' | 'active' | 'done' | 'failed' | 'cancelled'
  path?: string
  speed: number
  started: number
  tag?: string
}

export function files(ctx: Ctx): { onPhoto: (fn: (t: Transfer) => void) => void } {
  const transfers = new Map<string, Transfer>()
  const incoming = new Map<string, fs.WriteStream>()
  const accepted = new Map<string, () => void>()
  let photoListeners: ((t: Transfer) => void)[] = []
  let lastEmit = 0

  const dir = (): string => {
    const d = ctx.store.get('downloadDir') || path.join(app.getPath('downloads'), 'D-Connect')
    fs.mkdirSync(d, { recursive: true })
    return d
  }
  const push = (force = false): void => {
    if (!force && Date.now() - lastEmit < 120) return
    lastEmit = Date.now()
    ctx.emit('transfers', [...transfers.values()].reverse())
  }
  const uniquePath = (name: string): string => {
    const safe = path.basename(name).replace(/[\\/:*?"<>|]/g, '_') || 'file'
    const ext = path.extname(safe)
    const base = safe.slice(0, safe.length - ext.length)
    let p = path.join(dir(), safe)
    for (let i = 1; fs.existsSync(p); i++) p = path.join(dir(), `${base} (${i})${ext}`)
    return p
  }

  // ---------------------------------------------------------------- incoming
  const accept = (offer: FileOffer): void => {
    const t = transfers.get(offer.fid)!
    t.path = uniquePath(offer.name)
    t.state = 'active'
    t.started = Date.now()
    incoming.set(offer.fid, fs.createWriteStream(t.path))
    ctx.hub.send('file.accept', { fid: offer.fid })
    push(true)
  }

  ctx.hub.on('message', (type, data) => {
    if (type === 'file.offer') {
      const o = data as FileOffer
      transfers.set(o.fid, { fid: o.fid, name: o.name, size: o.size, done: 0, dir: 'in', state: 'waiting', speed: 0, started: Date.now(), tag: o.tag })
      if (ctx.store.get('autoAcceptFiles') || o.tag === 'photo') accept(o)
      else {
        ctx.toast({ id: 'f:' + o.fid, kind: 'file', title: 'Incoming file', body: `${o.name} · ${fmtSize(o.size)}`, actions: [{ id: `file-accept:${o.fid}`, label: 'Accept' }, { id: `file-reject:${o.fid}`, label: 'Decline' }], ttl: 60000, meta: o })
        push(true)
      }
    } else if (type === 'file.done') {
      const t = transfers.get(data.fid)
      const w = incoming.get(data.fid)
      if (!t || !w) return
      w.end(() => {
        t.state = 'done'
        t.done = t.size
        incoming.delete(data.fid)
        push(true)
        if (t.tag === 'photo') photoListeners.forEach((f) => f(t))
        else ctx.toast({ id: 'f:' + t.fid, kind: 'file', title: 'File received', body: t.name, actions: [{ id: `file-open:${t.fid}`, label: 'Open' }, { id: `file-show:${t.fid}`, label: 'Show in folder' }] })
      })
    } else if (type === 'file.ack') {
      // phone -> PC flow control is ours to send; acks from the phone need nothing here
    } else if (type === 'file.accept') {
      accepted.get(data.fid)?.()
    } else if (type === 'file.reject' || type === 'file.cancel') {
      const t = transfers.get(data.fid)
      if (t) t.state = 'cancelled'
      incoming.get(data.fid)?.destroy()
      incoming.delete(data.fid)
      push(true)
    }
  })

  ctx.hub.on('binary', (channel, header, payload) => {
    if (channel !== Channel.File) return
    const w = incoming.get(header.fid)
    const t = transfers.get(header.fid)
    if (!w || !t) return
    w.write(payload)
    const before = t.done
    t.done += payload.length
    // the phone keeps at most a window of bytes in flight: tell it what has landed
    if (Math.floor(t.done / 4194304) !== Math.floor(before / 4194304)) ctx.hub.send('file.ack', { fid: t.fid, done: t.done })
    t.speed = t.done / Math.max(0.001, (Date.now() - t.started) / 1000)
    push()
  })

  ctx.hub.on('disconnected', () => {
    for (const t of transfers.values()) if (t.state === 'active' || t.state === 'waiting') t.state = 'failed'
    for (const w of incoming.values()) w.destroy()
    incoming.clear()
    push(true)
  })

  // ---------------------------------------------------------------- outgoing
  const sendFile = async (p: string): Promise<void> => {
    const stat = fs.statSync(p)
    if (!stat.isFile()) return
    const fid = crypto.randomUUID()
    const t: Transfer = { fid, name: path.basename(p), size: stat.size, done: 0, dir: 'out', state: 'waiting', path: p, speed: 0, started: Date.now() }
    transfers.set(fid, t)
    push(true)
    const ok = await new Promise<boolean>((resolve) => {
      accepted.set(fid, () => resolve(true))
      ctx.hub.send('file.offer', { fid, name: t.name, size: t.size, mime: mimeOf(p) })
      setTimeout(() => resolve(false), 120000)
    })
    accepted.delete(fid)
    if (!ok || t.state === 'cancelled') {
      if (t.state !== 'cancelled') t.state = 'failed'
      return push(true)
    }
    t.state = 'active'
    t.started = Date.now()
    const fd = fs.openSync(p, 'r')
    const buf = Buffer.alloc(CHUNK)
    try {
      let seq = 0
      while (t.done < t.size) {
        if (t.state !== 'active' || !ctx.hub.session) throw new Error('stopped')
        while (ctx.hub.buffered > HIGH_WATER) await new Promise((r) => setTimeout(r, 10))
        const n = fs.readSync(fd, buf, 0, CHUNK, t.done)
        if (n <= 0) break
        ctx.hub.sendBinary(Channel.File, { fid, seq: seq++ }, buf.subarray(0, n))
        t.done += n
        t.speed = t.done / Math.max(0.001, (Date.now() - t.started) / 1000)
        push()
      }
      ctx.hub.send('file.done', { fid })
      t.state = 'done'
    } catch {
      if (t.state === 'active') t.state = 'failed'
    } finally {
      fs.closeSync(fd)
      push(true)
    }
  }

  ctx.handle('transfers', () => [...transfers.values()].reverse())
  ctx.handle('sendFiles', async (paths: string[]) => {
    for (const p of paths) await sendFile(p)
  })
  ctx.handle('fileAction', (action: string, fid: string) => {
    const t = transfers.get(fid)
    if (action === 'accept') {
      const toastMeta = t && { fid, name: t.name, size: t.size }
      if (toastMeta) accept(toastMeta)
    } else if (action === 'reject') {
      ctx.hub.send('file.reject', { fid })
      if (t) t.state = 'cancelled'
      push(true)
    } else if (action === 'cancel') {
      if (t) t.state = 'cancelled'
      ctx.hub.send('file.cancel', { fid })
      push(true)
    } else if (action === 'open' && t?.path) openFileSafely(t.path) // apps/scripts: shown, not run
    else if (action === 'show' && t?.path) shell.showItemInFolder(t.path)
    else if (action === 'delete' && t) {
      // delete a received file from disk (never a file you sent from this PC)
      if (t.dir === 'in' && t.path && fs.existsSync(t.path)) fs.rmSync(t.path, { force: true })
      transfers.delete(fid)
      push(true)
    } else if (action === 'remove' && t) {
      transfers.delete(fid)
      push(true)
    }
  })
  ctx.handle('clearTransfers', () => {
    for (const [fid, t] of transfers) if (t.state !== 'active' && t.state !== 'waiting') transfers.delete(fid)
    push(true)
  })
  ctx.handle('downloadDir', () => dir())
  ctx.handle('openDownloads', () => shell.openPath(dir()))

  return { onPhoto: (fn) => (photoListeners = [...photoListeners, fn]) }
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function mimeOf(p: string): string {
  const ext = path.extname(p).toLowerCase().slice(1)
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', mkv: 'video/x-matroska', mp3: 'audio/mpeg', pdf: 'application/pdf',
    apk: 'application/vnd.android.package-archive', zip: 'application/zip', txt: 'text/plain'
  }
  return map[ext] || 'application/octet-stream'
}
