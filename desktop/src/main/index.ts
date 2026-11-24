// D-Connect desktop: the main process. Starts the phone link, the features, the windows and the tray.
import os from 'os'
import path from 'path'
import fs from 'fs'
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, powerMonitor, screen, session, shell, Tray } from 'electron'
import QRCode from 'qrcode'
import { pairUri, type CallState, type EyeResult } from '@shared/protocol'
import { loadIdentity } from './cert'
import type { Ctx, Toast } from './context'
import { Discovery } from './discovery'
import { EyeBreak } from './eyebreak'
import { Hub, Session } from './hub'
import { Store, type SettingKey } from './store'
import { Usb } from './adb'
import { devControl } from './devcontrol'
import { createCallWindow, createMain, createMixerWindow, createToastWindow, fitToastWindow, showEyeBreak } from './windows'
import { notifications, sendReply } from './features/notifications'
import { messages } from './features/messages'
import { clipboardSync } from './features/clipboard'
import { files } from './features/files'
import { photos } from './features/photos'
import { mirror } from './features/mirror'
import { media } from './features/media'
import { remoteInput } from './features/input'
import { system } from './features/system'
import { bluetooth } from './features/bluetooth'
import { appWindows } from './features/appwindows'
import { callAudio } from './features/callaudio'
import { sound } from './features/sound'

const isLinux = process.platform === 'linux'
// Transparent always-on-top windows that can place themselves (toasts, call card, eye break)
// need X11 on GNOME; under Wayland they can't choose where they appear. (Same as side-eye.)
if (isLinux) app.commandLine.appendSwitch('ozone-platform', 'x11')
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')

// Only one D-Connect: a second launch (e.g. clicking the dock icon while it sits in the tray)
// hands over to the running one, which comes forward, and exits before starting anything.
const firstInstance = app.requestSingleInstanceLock()
if (!firstInstance) {
  app.quit()
  process.exit(0)
}

let main: BrowserWindow | null = null
let toastWin: BrowserWindow | null = null
let callWin: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function icon(size = 256): Electron.NativeImage {
  const base = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources') : path.join(app.getAppPath(), 'resources')
  return nativeImage.createFromPath(path.join(base, size <= 32 ? 'tray.png' : 'icon.png'))
}

function allWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
}

app.whenReady().then(async () => {
  if (!firstInstance) return
  const store = new Store(app.getPath('userData'))
  const hostname = os.hostname()
  if (!store.get('deviceName')) store.set('deviceName', hostname)
  const identity = loadIdentity(app.getPath('userData'), hostname)
  const hub = new Hub(store, identity, store.get('deviceName'))

  // ---------------------------------------------------------------- rpc + events
  const handlers = new Map<string, (...a: any[]) => any>()
  ipcMain.handle('rpc', async (_e, name: string, ...args: any[]) => {
    const fn = handlers.get(name)
    if (!fn) throw new Error(`no handler: ${name}`)
    return fn(...args)
  })
  const emit = (channel: string, data: any): void => {
    for (const w of allWindows()) w.webContents.send('evt', channel, data)
  }

  const toasts: Toast[] = []
  const toast = (t: Toast): void => {
    const full = { ...t, id: t.id || Math.random().toString(36).slice(2), time: Date.now() }
    toasts.push(full)
    if (toasts.length > 30) toasts.shift()
    if (!toastWin || toastWin.isDestroyed()) toastWin = createToastWindow()
    const send = (): void => {
      toastWin!.webContents.send('evt', 'toast', full)
      toastWin!.showInactive()
    }
    if (toastWin.webContents.isLoading()) toastWin.webContents.once('did-finish-load', send)
    else send()
  }

  const focusMain = (route?: string): void => {
    if (!main || main.isDestroyed()) main = createMain(icon(), true)
    main.show()
    main.focus()
    if (route) main.webContents.send('evt', 'navigate', route)
  }

  const ctx: Ctx = { hub, store, emit, toast, handle: (n, fn) => handlers.set(n, fn), focusMain }

  // ---------------------------------------------------------------- core rpc
  const connState = (s: Session | null = hub.session): any =>
    s ? { connected: true, device: { ...s.device, key: undefined }, via: s.via, address: s.address, since: s.since, rtt: s.rtt } : { connected: false }

  ctx.handle('conn', () => connState())
  ctx.handle('pairInfo', async () => {
    const p = hub.pairPayload()
    const uri = pairUri(p)
    return { ...p, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#0b1020', light: '#ffffff' } }) }
  })
  ctx.handle('rotateToken', () => hub.rotateToken())
  const deviceList = (): any[] =>
    Object.values(store.get('trusted')).map((d) => ({
      ...d,
      key: undefined,
      online: hub.onlineIds().includes(d.deviceId),
      active: hub.session?.device.deviceId === d.deviceId,
      preferred: store.get('activeDevice') === d.deviceId
    }))
  ctx.handle('devices', () => deviceList())
  ctx.handle('activateDevice', (id: string) => hub.activate(id))
  hub.on('online', () => emit('devices', deviceList()))
  ctx.handle('forget', (id: string) => hub.forget(id))
  ctx.handle('settings', () => store.all())
  ctx.handle('setSetting', (k: SettingKey, v: any) => store.set(k, v))
  ctx.handle('info', () => ({ name: store.get('deviceName'), hostname, platform: process.platform, version: app.getVersion(), fingerprint: identity.fingerprint, port: hub.port, session: process.env.XDG_SESSION_TYPE || '' }))
  ctx.handle('window', (action: string) => {
    if (!main) return
    if (action === 'min') main.minimize()
    else if (action === 'max') main.isMaximized() ? main.unmaximize() : main.maximize()
    else if (action === 'close') main.hide()
  })
  ctx.handle('openExternal', (url: string) => shell.openExternal(url))
  ctx.handle('toastHover', (over: boolean) => {
    if (process.platform !== 'linux') toastWin?.setIgnoreMouseEvents(!over, { forward: true })
  })
  ctx.handle('toastSize', (h: number) => {
    if (toastWin && process.platform === 'linux') fitToastWindow(toastWin, h)
  })
  ctx.handle('toastFocus', () => {
    toastWin?.setFocusable(true)
    toastWin?.focus()
  })
  ctx.handle('toastsEmpty', () => toastWin?.hide())
  ctx.handle('toastOpen', (t: Toast) => {
    const route = t.kind === 'sms' ? '/messages' : t.kind === 'notification' ? '/notifications' : t.kind === 'file' ? '/files' : '/'
    focusMain(route)
  })
  ctx.handle('toastReply', (t: Toast, text: string) => {
    if (t.reply?.kind === 'notif' && t.reply.key) sendReply(ctx, t.reply.key, text)
    else if (t.reply?.kind === 'sms') hub.send('sms.send', { address: t.reply.address, body: text })
  })
  ctx.handle('toastAction', (id: string) => {
    const [kind, ...rest] = id.split(':')
    const arg = rest.join(':')
    if (kind === 'notif-action') {
      const i = arg.lastIndexOf(':')
      hub.send('notif.action', { key: arg.slice(0, i), index: +arg.slice(i + 1) })
    } else if (kind.startsWith('file-')) handlers.get('fileAction')!(kind.slice(5), arg)
    else if (kind === 'open-url') shell.openExternal(arg)
    else if (kind === 'open-path') shell.openPath(arg)
    else if (kind === 'copy') clipboard.writeText(arg)
  })

  // ---------------------------------------------------------------- call card
  let lastCall: CallState = { state: 'idle' }
  const openCall = (c: CallState): void => {
    lastCall = c
    if (!callWin || callWin.isDestroyed()) {
      callWin = createCallWindow()
      callWin.once('ready-to-show', () => callWin?.showInactive())
    } else callWin.showInactive()
  }
  const closeCall = (): void => {
    lastCall = { state: 'idle' }
    const w = callWin
    if (!w || w.isDestroyed()) return
    w.webContents.send('evt', 'call', lastCall)
    setTimeout(() => !w.isDestroyed() && lastCall.state === 'idle' && w.destroy(), 700)
  }
  ctx.handle('lastCall', () => lastCall)
  // the call card can shrink to a small bar in the corner and grow back
  ctx.handle('callCompact', (on: boolean) => {
    if (!callWin || callWin.isDestroyed()) return
    const wa = screen.getPrimaryDisplay().workArea
    const [W, H] = on ? [340, 84] : [380, 660]
    callWin.setBounds({ x: wa.x + wa.width - W - 24, y: wa.y + 24, width: W, height: H })
  })

  // ---------------------------------------------------------------- features
  // App calls (Teams, WhatsApp...) ring as notifications: show them on the call card and answer
  // or decline with the notification's own buttons.
  let appCallKey: string | null = null
  let appCallActions: string[] = []
  notifications(ctx, (n) => {
    if (!n || !n.actions) {
      if (n && n.key === appCallKey) {
        appCallKey = null
        closeCall()
      }
      return
    }
    appCallKey = n.key
    appCallActions = n.actions
    openCall({ state: 'ringing', name: n.title, number: n.app, app: n.app, key: n.key })
    for (const w of allWindows()) w.webContents.send('evt', 'call', lastCall)
  })
  const pressAppCall = (re: RegExp): boolean => {
    if (!appCallKey) return false
    const i = appCallActions.findIndex((a) => re.test(a))
    if (i < 0) return false
    hub.send('notif.action', { key: appCallKey, index: i })
    return true
  }
  const audio = callAudio(ctx)
  messages(ctx, openCall, closeCall, audio.answeredHere, audio.setMuted)
  {
    const answer = handlers.get('callAnswer')!
    const reject = handlers.get('callReject')!
    ctx.handle('callAnswer', () => {
      if (pressAppCall(/answer|accept|pick up|join/i)) {
        audio.answeredHere()
        lastCall = { ...lastCall, state: 'offhook', since: Date.now() }
        for (const w of allWindows()) w.webContents.send('evt', 'call', lastCall)
        return
      }
      return answer()
    })
    ctx.handle('callReject', () => {
      if (pressAppCall(/decline|reject|dismiss|ignore/i)) {
        appCallKey = null
        closeCall()
        return
      }
      return reject()
    })
    ctx.handle('callEnd', () => {
      if (appCallKey && pressAppCall(/hang up|end|leave/i)) {
        appCallKey = null
        closeCall()
        return
      }
      return hub.send('call.end')
    })
  }
  clipboardSync(ctx)
  const f = files(ctx)
  photos(ctx, f.onPhoto)
  mirror(ctx, (header, payload) => main?.webContents.send('video', header, payload))
  media(ctx)
  remoteInput(ctx)
  system(ctx, (on) => {
    focusMain('/')
    emit('findpc', on)
  })
  bluetooth(ctx)
  appWindows(ctx)
  sound(ctx)

  // ---------------------------------------------------------------- eye care (20-20-20)
  let phoneEnd: ((r: EyeResult) => void) | null = null
  const eye = new EyeBreak({
    settings: store as any,
    power: powerMonitor,
    busy: () => lastCall.state === 'offhook',
    show: async ({ seconds, sound }) => {
      const sync = store.get('eyePhoneSync') && !!hub.session
      if (sync) hub.send('eye.start', { seconds })
      const result = await showEyeBreak({ seconds, sound }, (end) => (phoneEnd = end))
      phoneEnd = null
      if (sync) hub.send('eye.end', { result })
      return result
    },
    onChange: (s) => {
      emit('eye', s)
      hub.send('eye.status', s)
      updateTray()
    }
  })
  eye.start()
  const sendEyeStats = (): void => {
    const s = eye.stats(7)
    emit('eye.stats', s)
    hub.send('eye.stats', s)
  }
  store.on('change', (k: string) => {
    if (k === 'eyeStats') sendEyeStats()
    if (k === 'eyeBreaks' || k === 'eyeBreakMinutes') eye.reset()
    if (k.startsWith('eye')) {
      emit('eye', eye.status())
      hub.send('eye.status', eye.status())
    }
    if (k === 'trusted' || k === 'activeDevice') emit('devices', deviceList())
    emit('settings', store.all())
  })
  hub.on('message', (type, data) => {
    if (type === 'eye.result') phoneEnd?.(data.result)
    else if (type === 'eye.screen') eye.phoneScreenOn = !!data.on
    else if (type === 'eye.take') eye.take()
    else if (type === 'eye.reset') eye.reset()
    else if (type === 'eye.config') {
      if (typeof data.on === 'boolean') store.set('eyeBreaks', data.on)
      if (data.minutes) store.set('eyeBreakMinutes', +data.minutes)
      if (data.seconds) store.set('eyeBreakSeconds', +data.seconds)
      if (typeof data.phoneCounts === 'boolean') store.set('eyePhoneCounts', data.phoneCounts)
      if (typeof data.sync === 'boolean') store.set('eyePhoneSync', data.sync)
    } else if (type === 'eye.stats.get') sendEyeStats()
  })
  // the phone stopped answering (OnePlus/Oppo freeze apps when locked): say how to fix it
  let lastAsleepHint = 0
  hub.on('unanswered', () => {
    if (Date.now() - lastAsleepHint < 30 * 60000) return
    lastAsleepHint = Date.now()
    toast({ id: 'phone-asleep', kind: 'info', title: 'Your phone isn\'t answering', body: 'Its battery saver froze D-Connect while locked. On the phone: D-Connect → Settings → “Work when locked” (Allow background activity). Unlocking the phone wakes it now.', ttl: 15000 })
  })

  // tray sound mixer
  let mixerWin: BrowserWindow | null = null
  const showMixer = (on: boolean): void => {
    if (!on) return mixerWin?.hide()
    if (!mixerWin || mixerWin.isDestroyed()) {
      mixerWin = createMixerWindow()
      mixerWin.on('blur', () => mixerWin?.hide()) // closes like a popup when you click elsewhere
      mixerWin.once('ready-to-show', () => { mixerWin?.show(); mixerWin?.focus() })
    } else {
      mixerWin.show()
      mixerWin.focus()
    }
  }
  ctx.handle('mixerWindow', (on: boolean) => showMixer(on))
  const setPcVolume = (pct: number): void => {
    handlers.get('mixerSet')?.('output', '', pct)
  }
  ctx.handle('eyeStatus', () => eye.status())
  ctx.handle('eyeTake', () => eye.take())
  ctx.handle('eyeReset', () => eye.reset())
  ctx.handle('eyeStats', (days = 7) => eye.stats(days))

  // ---------------------------------------------------------------- connection events
  hub.on('connected', (s) => {
    emit('conn', connState(s))
    hub.send('eye.status', eye.status())
    sendEyeStats()
    hub.send('settings.sync', { clipboardSync: store.get('clipboardSync'), dndSync: store.get('dndSync') })
    updateTray()
  })
  hub.on('disconnected', () => {
    eye.phoneScreenOn = false
    emit('conn', connState(null))
    updateTray()
  })
  hub.on('paired', (d) => {
    emit('paired', { ...d, key: undefined })
    toast({ kind: 'info', title: `Paired with ${d.name}`, body: 'Your phone is now linked to this PC.' })
  })
  hub.on('token', async (p) => emit('pairInfo', { ...p, uri: pairUri(p), qr: await QRCode.toDataURL(pairUri(p), { margin: 1, width: 360, color: { dark: '#0b1020', light: '#ffffff' } }) }))
  setInterval(() => hub.session && emit('rtt', hub.session.rtt), 5000)

  // ---------------------------------------------------------------- start the link
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await hub.start()
      break
    } catch {
      store.set('port', store.get('port') + 1)
    }
  }
  const discovery = new Discovery()
  discovery.start(store.get('deviceName'), hub.port, identity.id, identity.fingerprint)
  const usb = new Usb()
  usb.start(hub.port, () => store.get('usbAuto'))
  usb.on('change', (list) => emit('usb', list))
  ctx.handle('usb', () => ({ devices: usb.devices, available: usb.available }))

  // screenshots and recordings from the mirror save straight to Downloads/D-Connect
  session.defaultSession.on('will-download', (_e, item) => {
    const dir = store.get('downloadDir') || path.join(app.getPath('downloads'), 'D-Connect')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, item.getFilename())
    item.setSavePath(file)
    item.once('done', (_ev, state) => state === 'completed' && toast({ kind: 'file', title: 'Saved', body: item.getFilename(), actions: [{ id: `open-path:${file}`, label: 'Open' }] }))
  })

  // ---------------------------------------------------------------- windows + tray
  main = createMain(icon(), !store.get('launchHidden'))
  main.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    main?.hide()
  })
  toastWin = createToastWindow()

  tray = new Tray(icon(24))
  tray.setToolTip('D-Connect')
  tray.on('click', () => focusMain())
  function updateTray(): void {
    if (!tray) return
    const s = hub.session
    const es = eye.status()
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: s ? `● Connected · ${s.device.name} (${s.via === 'usb' ? 'USB' : 'Wi-Fi'})` : '○ Not connected', enabled: false },
        { type: 'separator' },
        { label: 'Open D-Connect', click: () => focusMain() },
        { label: 'Find my phone', enabled: !!s, click: () => hub.send('find.ring', { on: true }) },
        { label: 'Send clipboard to phone', enabled: !!s, click: async () => hub.send('clip.set', { text: await clipboard.readText() }) },
        { type: 'separator' },
        { label: 'Sound mixer…', click: () => showMixer(true) },
        {
          label: 'PC volume',
          submenu: [25, 50, 75, 100, 150, 200, 250, 300].map((p) => ({ label: p > 100 ? `${p}% (boost)` : `${p}%`, click: () => setPcVolume(p) }))
        },
        { type: 'separator' },
        { label: 'Eye breaks (20-20-20)', type: 'checkbox', checked: es.on, click: (i) => store.set('eyeBreaks', i.checked) },
        { label: es.on && es.nextInMs !== null ? `Next break in ${Math.ceil(es.nextInMs / 60000)} min` : 'Eye breaks are off', enabled: false },
        { label: 'Take an eye break now', click: () => eye.take() },
        { type: 'separator' },
        { label: 'Quit', click: () => { quitting = true; app.quit() } }
      ])
    )
  }
  updateTray()
  setInterval(updateTray, 60000)

  devControl(() => main, (name, ...a) => handlers.get(name)?.(...a))

  app.on('second-instance', () => focusMain())
  app.on('before-quit', () => {
    quitting = true
    hub.stop()
    discovery.stop()
    usb.stop()
    eye.stop()
  })
})

app.on('window-all-closed', () => {
  // keep running in the tray
})
