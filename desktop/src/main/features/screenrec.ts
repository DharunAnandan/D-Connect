// Full-screen recording without any desktop tool (used on Windows): a hidden window captures the
// screen with Chromium's screen capture and MediaRecorder, and the video is written to
// Videos/D-Connect as it records.
import { app, BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import fs from 'fs'
import path from 'path'

let win: BrowserWindow | null = null
let out: fs.WriteStream | null = null
let file = ''
let done: ((f: string) => void) | null = null

ipcMain.on('dc-rec-chunk', (_e, buf: ArrayBuffer) => out?.write(Buffer.from(buf)))
ipcMain.on('dc-rec-end', () => {
  const f = file
  out?.end(() => done?.(f))
  out = null
  win?.destroy()
  win = null
})

const PAGE = `<script>
const { ipcRenderer } = require('electron')
let rec
ipcRenderer.on('start', async (_e, id, w, h) => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: w, maxHeight: h, maxFrameRate: 30 } } })
  rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8000000 })
  rec.ondataavailable = async (e) => { if (e.data.size) ipcRenderer.send('dc-rec-chunk', await e.data.arrayBuffer()) }
  rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setTimeout(() => ipcRenderer.send('dc-rec-end'), 300) }
  rec.start(1000)
})
ipcRenderer.on('stop', () => rec && rec.state !== 'inactive' && rec.stop())
</script>`

export const screenRecorder = {
  async start(): Promise<void> {
    if (win) return
    const d = screen.getPrimaryDisplay()
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
    const src = sources.find((s) => s.display_id === String(d.id)) || sources[0]
    if (!src) throw new Error('no screen')
    const dir = path.join(app.getPath('videos'), 'D-Connect')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
    file = path.join(dir, `Screen recording ${stamp}.webm`)
    out = fs.createWriteStream(file)
    win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } })
    await win.loadURL('data:text/html,' + encodeURIComponent(PAGE))
    const scale = d.scaleFactor || 1
    win.webContents.send('start', src.id, Math.round(d.size.width * scale), Math.round(d.size.height * scale))
  },
  stop(): Promise<string> {
    return new Promise((resolve) => {
      if (!win) return resolve('')
      done = resolve
      win.webContents.send('stop')
      setTimeout(() => resolve(file), 8000) // never hang
    })
  }
}
