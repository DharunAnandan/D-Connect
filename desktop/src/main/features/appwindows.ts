// Phone apps in their own laptop windows (like Phone Link's "Apps"). Each app runs on its own
// virtual display on the phone, so the phone's screen stays free. This uses the scrcpy server
// (Apache-2.0, bundled in resources/scrcpy) started through adb, which is the only way Android
// lets another device create a display and launch apps on it.
//
// Per window: adb forward tcp:PORT -> localabstract:scrcpy_<scid>; the first socket carries
// H.264 video (12-byte codec meta, then 12-byte packet headers), the second carries control
// messages (touch, keys, text, scroll) in scrcpy's v3 binary format.
import { ChildProcess, execFile, spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import net from 'net'
import path from 'path'
import { app, BrowserWindow, screen } from 'electron'
import type { Ctx } from '../context'

const SERVER_VERSION = '3.3.4'
const REMOTE_JAR = '/data/local/tmp/dconnect-scrcpy.jar'
const PRELOAD = path.join(__dirname, '../preload/index.js')

function resource(name: string): string {
  const base = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources') : path.join(app.getAppPath(), 'resources')
  return path.join(base, name)
}

function adbBin(): string {
  const cands = [process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'), path.join(app.getPath('home'), 'Android', 'Sdk', 'platform-tools', 'adb'), '/usr/bin/adb']
  for (const c of cands) if (c && fs.existsSync(c)) return c
  return 'adb'
}

function run(args: string[], timeout = 15000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) =>
    execFile(adbBin(), args, { timeout }, (err, out, errOut) => resolve({ code: err ? 1 : 0, out: (out || '') + (errOut || '') }))
  )
}

interface AppWin {
  id: string
  pkg: string
  label: string
  win: BrowserWindow
  server: ChildProcess | null
  video: net.Socket | null
  control: net.Socket | null
  port: number
  serial: string
  width: number
  height: number
}

export function appWindows(ctx: Ctx): void {
  const wins = new Map<string, AppWin>()

  // the adb serial of the phone that's linked now (several may be plugged in)
  const serialForPhone = async (): Promise<{ serial?: string; error?: string }> => {
    const out = (await run(['devices', '-l'])).out
    const devices = out
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => /\sdevice\s/.test(l + ' '))
      .map((l) => ({ serial: l.split(/\s+/)[0], model: /model:(\S+)/.exec(l)?.[1] || '' }))
    if (!devices.length) {
      const unauthorized = /unauthorized|no permissions/.test(out)
      return { error: unauthorized ? 'Allow USB debugging on the phone (a prompt is waiting on its screen).' : 'Connect the phone by USB with USB debugging on (or turn on Wireless debugging) to open apps here.' }
    }
    const model = (ctx.hub.session?.device.model || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const match = devices.find((d) => model && model.includes(d.model.toLowerCase().replace(/[^a-z0-9]/g, '')))
    return { serial: (match || devices[0]).serial }
  }

  const freePort = (): Promise<number> =>
    new Promise((resolve) => {
      const s = net.createServer()
      s.listen(0, '127.0.0.1', () => {
        const p = (s.address() as net.AddressInfo).port
        s.close(() => resolve(p))
      })
    })

  const connect = async (port: number, tries = 40): Promise<net.Socket> => {
    for (let i = 0; i < tries; i++) {
      try {
        const sock = await new Promise<net.Socket>((resolve, reject) => {
          const so = net.connect(port, '127.0.0.1', () => resolve(so))
          so.once('error', reject)
        })
        return sock
      } catch {
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    throw new Error('server did not start')
  }

  // adb forward accepts a connection even before the phone-side server listens, then drops it.
  // The server's first byte on the video socket (the "dummy byte") proves it's really there.
  const connectVideo = async (port: number, tries = 60): Promise<net.Socket> => {
    for (let i = 0; i < tries; i++) {
      const sock = await connect(port, 5).catch(() => null)
      if (sock) {
        const ok = await new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(false), 700)
          sock.once('data', (d: Buffer) => {
            clearTimeout(t)
            if (d.length > 1) sock.unshift(d.subarray(1)) // keep anything after the dummy byte
            resolve(true)
          })
          sock.once('close', () => {
            clearTimeout(t)
            resolve(false)
          })
        })
        if (ok) return sock
        sock.destroy()
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error('server did not start')
  }

  const close = (id: string): void => {
    const w = wins.get(id)
    if (!w) return
    wins.delete(id)
    w.video?.destroy()
    w.control?.destroy()
    w.server?.kill()
    run(['-s', w.serial, 'forward', '--remove', `tcp:${w.port}`])
    if (!w.win.isDestroyed()) w.win.destroy()
  }

  const open = async (pkg: string, label: string): Promise<{ ok: boolean; message?: string; reused?: boolean }> => {
    // already open: bring that window to the front
    for (const w of wins.values()) {
      if (w.pkg === pkg && !w.win.isDestroyed()) {
        w.win.show()
        w.win.focus()
        return { ok: true, reused: true }
      }
    }
    const { serial, error } = await serialForPhone()
    if (!serial) return { ok: false, message: error }
    // the server deletes its own file when it exits (cleanup), so copy it every time (90 KB)
    const pushed = await run(['-s', serial, 'push', resource('scrcpy/scrcpy-server'), REMOTE_JAR], 30000)
    if (pushed.code !== 0) return { ok: false, message: 'Could not copy the app-window helper to the phone.' }
    const id = crypto.randomUUID()
    const scid = (crypto.randomBytes(4).readUInt32BE(0) & 0x7fffffff).toString(16).padStart(8, '0')
    const port = await freePort()
    await run(['-s', serial, 'forward', `tcp:${port}`, `localabstract:scrcpy_${scid}`])

    // a phone-shaped window; the virtual display matches it
    const W = 400
    const H = 820
    const win = new BrowserWindow({
      width: W,
      height: H,
      minWidth: 300,
      minHeight: 520,
      title: label,
      frame: false,
      resizable: true,
      backgroundColor: '#05070f',
      webPreferences: { preload: PRELOAD, sandbox: false }
    })
    const url = process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/index.html#/appwin?id=${id}` : `file://${path.join(__dirname, '../renderer/index.html')}#/appwin?id=${id}`
    // the stream's header and first decoder setup are sent once: only connect when the page can receive them
    const loaded = new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()))
    win.loadURL(url)
    const w: AppWin = { id, pkg, label, win, server: null, video: null, control: null, port, serial, width: 0, height: 0 }
    wins.set(id, w)
    win.on('closed', () => close(id))
    // keep the phone's proportions when resizing (plus the 40 px title bar)
    win.setAspectRatio(720 / 1520, { width: 0, height: 40 })

    const server = spawn(adbBin(), [
      '-s', serial, 'shell',
      `CLASSPATH=${REMOTE_JAR}`, 'app_process', '/', 'com.genymobile.scrcpy.Server', SERVER_VERSION,
      `scid=${scid}`, 'log_level=warn', 'tunnel_forward=true', 'audio=false', 'control=true',
      'video_codec=h264', 'video_bit_rate=6000000', 'max_fps=60',
      'new_display=720x1520/280',
      'send_device_meta=false', 'send_dummy_byte=true', 'clipboard_autosync=false', 'cleanup=true'
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    w.server = server
    let serverLog = ''
    server.stdout?.on('data', (d) => (serverLog += d.toString()))
    server.stderr?.on('data', (d) => (serverLog += d.toString()))
    server.on('exit', (code) => {
      console.log(`[appwin] server for ${pkg} exited (${code}):\n${serverLog.slice(-1500)}`)
      if (!wins.has(id)) return
      if (!win.isDestroyed()) win.webContents.send('evt', 'appwin.state', { state: 'ended', message: serverLog.split('\n').filter((l) => /ERROR|Exception/.test(l)).slice(-1)[0] || '' })
    })

    try {
      await loaded
      // video first (it gets the dummy byte), then control
      const video = await connectVideo(port)
      w.video = video
      w.control = await connect(port)
      // launch the app on its virtual display (START_APP: type 16, 1-byte length, package name)
      const name = Buffer.from(pkg, 'utf8').subarray(0, 255)
      setTimeout(() => w.control?.write(Buffer.concat([Buffer.from([16, name.length]), name])), 400)
      let buf = Buffer.alloc(0)
      let gotDummy = true // already read by connectVideo
      let gotMeta = false
      let need = 0
      let header: { config: boolean; key: boolean; pts: number } | null = null
      video.on("data", (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk])
        for (;;) {
          if (!gotDummy) {
            if (buf.length < 1) return
            buf = buf.subarray(1)
            gotDummy = true
          }
          if (!gotMeta) {
            if (buf.length < 12) return
            w.width = buf.readUInt32BE(4)
            w.height = buf.readUInt32BE(8)
            buf = buf.subarray(12)
            gotMeta = true
            if (!win.isDestroyed()) win.webContents.send('evt', 'appwin.state', { state: 'on', width: w.width, height: w.height, label })
            continue
          }
          if (!header) {
            if (buf.length < 12) return
            const hi = buf.readUInt32BE(0)
            const lo = buf.readUInt32BE(4)
            const config = (hi & 0x80000000) !== 0
            const key = (hi & 0x40000000) !== 0
            const pts = (hi & 0x3fffffff) * 4294967296 + lo
            need = buf.readUInt32BE(8)
            header = { config, key, pts }
            buf = buf.subarray(12)
          }
          if (buf.length < need) return
          const payload = buf.subarray(0, need)
          buf = buf.subarray(need)
          if (!win.isDestroyed()) win.webContents.send('appvideo', header, new Uint8Array(payload))
          header = null
        }
      })
      video.on('close', () => wins.has(id) && !win.isDestroyed() && win.webContents.send('evt', 'appwin.state', { state: 'ended' }))
    } catch {
      close(id)
      return { ok: false, message: 'The app window could not start. Is USB debugging still allowed?' }
    }
    return { ok: true }
  }

  // ---------------------------------------------------------------- control messages (scrcpy v3)
  const touch = (w: AppWin, action: number, x: number, y: number): Buffer => {
    const b = Buffer.alloc(32)
    b.writeUInt8(2, 0) // INJECT_TOUCH_EVENT
    b.writeUInt8(action, 1) // 0 down, 1 up, 2 move
    b.writeBigUInt64BE(0xfffffffffffffffen, 2) // a virtual finger
    b.writeInt32BE(Math.round(x * w.width), 10)
    b.writeInt32BE(Math.round(y * w.height), 14)
    b.writeUInt16BE(w.width, 18)
    b.writeUInt16BE(w.height, 20)
    b.writeUInt16BE(action === 1 ? 0 : 0xffff, 22) // pressure
    b.writeUInt32BE(0, 24) // action button
    b.writeUInt32BE(0, 28) // buttons
    return b
  }
  const scroll = (w: AppWin, x: number, y: number, dy: number): Buffer => {
    const b = Buffer.alloc(21)
    b.writeUInt8(3, 0) // INJECT_SCROLL_EVENT
    b.writeInt32BE(Math.round(x * w.width), 1)
    b.writeInt32BE(Math.round(y * w.height), 5)
    b.writeUInt16BE(w.width, 9)
    b.writeUInt16BE(w.height, 11)
    b.writeInt16BE(0, 13) // horizontal
    const v = Math.max(-1, Math.min(1, -dy / 240))
    b.writeInt16BE(Math.round(v * 0x7fff), 15)
    b.writeUInt32BE(0, 17)
    return b
  }
  const key = (code: number, action: number): Buffer => {
    const b = Buffer.alloc(14)
    b.writeUInt8(0, 0) // INJECT_KEYCODE
    b.writeUInt8(action, 1)
    b.writeInt32BE(code, 2)
    b.writeInt32BE(0, 6)
    b.writeInt32BE(0, 10)
    return b
  }
  const text = (t: string): Buffer => {
    const bytes = Buffer.from(t, 'utf8').subarray(0, 300)
    const b = Buffer.alloc(5 + bytes.length)
    b.writeUInt8(1, 0) // INJECT_TEXT
    b.writeUInt32BE(bytes.length, 1)
    bytes.copy(b, 5)
    return b
  }
  const back = (action: number): Buffer => Buffer.from([4, action]) // BACK_OR_SCREEN_ON

  const KEYCODES: Record<string, number> = { home: 3, back: 4, recents: 187, enter: 66, backspace: 67, del: 112, tab: 61, up: 19, down: 20, left: 21, right: 22, escape: 111 }

  ctx.handle('appwinInput', (id: string, m: any) => {
    const w = wins.get(id)
    if (!w?.control || !w.width) return
    const c = w.control
    if (m.t === 'touch') c.write(touch(w, m.action === 'down' ? 0 : m.action === 'up' ? 1 : 2, m.x, m.y))
    else if (m.t === 'scroll') c.write(scroll(w, m.x, m.y, m.dy))
    else if (m.t === 'text') c.write(text(m.text))
    else if (m.t === 'key') {
      if (m.key === 'back') {
        c.write(back(0))
        c.write(back(1))
        return
      }
      const code = KEYCODES[m.key]
      if (code === undefined) return
      c.write(key(code, 0))
      c.write(key(code, 1))
    }
  })
  ctx.handle('appwinClose', (id: string) => close(id))
  ctx.handle('appwinMinimize', (id: string) => wins.get(id)?.win.minimize())
  // Small / Medium / Large, keeping the phone's shape
  ctx.handle('appwinSize', (id: string, size: 's' | 'm' | 'l') => {
    const w = wins.get(id)
    if (!w) return
    const h = { s: 640, m: 820, l: 1000 }[size]
    const area = screen.getDisplayMatching(w.win.getBounds()).workArea
    const H = Math.min(h, area.height - 20)
    const W = Math.round((H - 40) * (720 / 1520))
    const b = w.win.getBounds()
    w.win.setBounds({ x: Math.max(area.x, Math.min(b.x, area.x + area.width - W)), y: Math.max(area.y, Math.min(b.y, area.y + area.height - H)), width: W, height: H }, true)
  })
  ctx.handle('appwinInfo', (id: string) => {
    const w = wins.get(id)
    return w ? { label: w.label, pkg: w.pkg, width: w.width, height: w.height, state: w.width ? 'on' : 'starting' } : null
  })
  ctx.handle('openPhoneApp', (pkg: string, label: string) => open(pkg, label))
  ctx.handle('phoneApps', async () => ((await ctx.hub.request('apps.list', {}, 20000).catch(() => null)) as any)?.apps || [])

  app.on('before-quit', () => {
    for (const id of [...wins.keys()]) close(id)
  })
}
