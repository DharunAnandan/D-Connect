import { openUrlSafely } from './safety'
// Every window D-Connect opens: the app, the toast stack, the call card and the eye break.
import path from 'path'
import { BrowserWindow, ipcMain, screen, shell } from 'electron'
import type { EyeResult } from '@shared/protocol'

const PRELOAD = path.join(__dirname, '../preload/index.js')
const isDev = !!process.env.ELECTRON_RENDERER_URL

export function pageUrl(page: 'index' | 'eyebreak', hash = '', query = ''): string {
  if (isDev) return `${process.env.ELECTRON_RENDERER_URL}/${page}.html${query}${hash ? '#' + hash : ''}`
  return `file://${path.join(__dirname, '../renderer', page + '.html')}${query}${hash ? '#' + hash : ''}`
}

function load(win: BrowserWindow, page: 'index' | 'eyebreak', hash = '', query = ''): void {
  win.loadURL(pageUrl(page, hash, query))
}

export function createMain(icon: Electron.NativeImage, show: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 1220,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#070A14',
    icon,
    title: 'D-Connect',
    // throttled when hidden in the tray: no animation work while nobody is looking
    webPreferences: { preload: PRELOAD, sandbox: false, backgroundThrottling: true }
  })
  win.once('ready-to-show', () => show && win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    openUrlSafely(url)
    return { action: 'deny' }
  })
  load(win, 'index', '/')
  return win
}

// The toast stack lives in one transparent window in the corner. It lets clicks through
// unless the pointer is over a toast (the renderer tells us).
export function createToastWindow(): BrowserWindow {
  const wa = screen.getPrimaryDisplay().workArea
  const W = 420
  const H = Math.min(760, wa.height)
  const win = new BrowserWindow({
    x: wa.x + wa.width - W - 8,
    y: wa.y + wa.height - H - 8,
    width: W,
    height: H,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    webPreferences: { preload: PRELOAD, sandbox: false, backgroundThrottling: false }
  })
  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Click-through with mouse forwarding doesn't exist on Linux, so there the window is sized to
  // exactly the toasts on screen (see fitToastWindow) and stays clickable.
  if (process.platform !== 'linux') win.setIgnoreMouseEvents(true, { forward: true })
  load(win, 'index', '/toast')
  return win
}

// Size the toast window to its toasts, anchored bottom-right of the work area.
export function fitToastWindow(win: BrowserWindow, height: number): void {
  if (win.isDestroyed()) return
  if (height <= 0) {
    win.hide()
    return
  }
  const wa = screen.getPrimaryDisplay().workArea
  const W = 420
  const H = Math.min(Math.ceil(height), wa.height - 16)
  win.setBounds({ x: wa.x + wa.width - W - 8, y: wa.y + wa.height - H - 8, width: W, height: H })
  if (!win.isVisible()) {
    // appear only once the first frame is on screen (a just-shown transparent window can flash black)
    win.setOpacity(0)
    win.showInactive()
    setTimeout(() => !win.isDestroyed() && win.setOpacity(1), 90)
  }
}

export function createCallWindow(): BrowserWindow {
  const wa = screen.getPrimaryDisplay().workArea
  const W = 380
  const H = 780 // room for a waiting call and a call on hold
  const win = new BrowserWindow({
    x: wa.x + wa.width - W - 24,
    y: wa.y + 24,
    width: W,
    height: H,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  load(win, 'index', '/call')
  return win
}

// The small sound mixer opened from the tray, top-right like a quick-settings panel.
export function createMixerWindow(): BrowserWindow {
  const wa = screen.getPrimaryDisplay().workArea
  const W = 340
  const H = 440
  const win = new BrowserWindow({
    x: wa.x + wa.width - W - 16,
    y: wa.y + 8,
    width: W,
    height: H,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload: PRELOAD, sandbox: false }
  })
  load(win, 'index', '/mixer')
  return win
}

// The eye break on every screen (from side-eye's showEyeBreak). Resolves with whichever ends it.
// `external` lets the phone end it too.
export function showEyeBreak(
  { seconds, sound }: { seconds: number; sound: boolean },
  external: (end: (r: EyeResult) => void) => void,
  onShown?: () => void // the break is on screen here (start the phone's at the same moment)
): Promise<EyeResult> {
  return new Promise((resolve) => {
    const primary = screen.getPrimaryDisplay().id
    let wins: BrowserWindow[] = []
    let settled = false
    const end = (result: EyeResult): void => {
      if (settled) return
      settled = true
      ipcMain.removeListener('eyebreak:done', onDone)
      for (const w of wins) if (!w.isDestroyed()) w.webContents.send('eyebreak:end')
      setTimeout(() => {
        for (const w of wins) if (!w.isDestroyed()) w.destroy()
        wins = []
      }, 1000)
      resolve(result)
    }
    const onDone = (_e: unknown, result: EyeResult): void => end(['done', 'skip', 'snooze'].includes(result) ? result : 'done')
    ipcMain.on('eyebreak:done', onDone)
    external(end)
    wins = screen.getAllDisplays().map((d) => {
      const { x, y, width, height } = d.bounds
      const w = new BrowserWindow({
        x, y, width, height,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        enableLargerThanScreen: true,
        webPreferences: { preload: PRELOAD, sandbox: false, autoplayPolicy: 'no-user-gesture-required' }
      })
      w.setAlwaysOnTop(true, 'screen-saver')
      w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      const isPrimary = d.id === primary
      load(w, 'eyebreak', '', `?s=${seconds}&sound=${sound ? 1 : 0}&primary=${isPrimary ? 1 : 0}`)
      w.once('ready-to-show', () => {
        w.showInactive()
        if (isPrimary) {
          w.focus() // so Esc works
          onShown?.()
        }
      })
      w.on('closed', () => !settled && end('skip'))
      return w
    })
    setTimeout(() => end('done'), (seconds + 15) * 1000) // never left on screen
  })
}
