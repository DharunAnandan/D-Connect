// Calls and phone music on Windows.
//
// Calls: with the phone paired, Windows shows its call link as two "Hands-Free AG Audio" sound
// devices (the caller's voice coming in, and a way to send your voice out). A hidden window joins
// them to this PC: caller -> your speaker, your mic (echo cancellation + noise suppression) ->
// the phone. Opening them also asks the phone to move the call's audio to the PC; the phone's
// call screen is pressed too, as on Linux, in case it doesn't.
//
// Music: Windows 10 2004+ can be a Bluetooth speaker for the phone (AudioPlaybackConnection),
// through a small PowerShell helper (resources/win/phone-audio.ps1).
import { app, BrowserWindow, ipcMain, session } from 'electron'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import os from 'os'
import path from 'path'
import type { CallState } from '@shared/protocol'
import type { Ctx } from '../context'

type CallRoute = 'pc' | 'phone' | 'speaker'

const resource = (...p: string[]): string => path.join(app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources') : path.join(app.getAppPath(), 'resources'), ...p)

// the hidden window that joins the call's sound devices to this PC's speaker and mic
const BRIDGE = `<script>
const { ipcRenderer } = require('electron')
const isAG = (l) => /hands-?free|AG Audio/i.test(l || '')
let streams = [], players = []
async function unlock() { try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()) } catch (e) {} }
async function list() { await unlock(); return (await navigator.mediaDevices.enumerateDevices()).map((d) => ({ kind: d.kind, id: d.deviceId, label: d.label })) }
function stop() { players.forEach((p) => { p.pause(); p.srcObject = null }); streams.forEach((s) => s.getTracks().forEach((t) => t.stop())); players = []; streams = [] }
ipcRenderer.on('devices', async () => ipcRenderer.send('cb-devices', await list()))
ipcRenderer.on('stop', () => stop())
ipcRenderer.on('mute', (_e, on) => streams[1] && streams[1].getAudioTracks().forEach((t) => (t.enabled = !on)))
ipcRenderer.on('start', async (_e, o) => {
  stop()
  try {
    const d = await list()
    const want = (kind) => d.filter((x) => x.kind === kind && isAG(x.label))
    const pick = (kind) => want(kind).find((x) => o.phone && x.label.toLowerCase().includes(o.phone)) || want(kind)[0]
    const agIn = pick('audioinput'), agOut = pick('audiooutput')
    if (!agIn || !agOut) return ipcRenderer.send('cb-status', { ok: false, reason: 'no-link' })
    const caller = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: agIn.id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    const a1 = new Audio(); a1.srcObject = caller; if (o.out) await a1.setSinkId(o.out); await a1.play()
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: o.in ? { exact: o.in } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    if (o.muted) mic.getAudioTracks().forEach((t) => (t.enabled = false))
    const a2 = new Audio(); a2.srcObject = mic; await a2.setSinkId(agOut.id); await a2.play()
    streams = [caller, mic]; players = [a1, a2]
    ipcRenderer.send('cb-status', { ok: true })
  } catch (e) { stop(); ipcRenderer.send('cb-status', { ok: false, reason: String(e) }) }
})
</script>`

export function winCallAudio(ctx: Ctx): { answeredHere: () => void; setMuted: (m: boolean) => void } {
  // the hidden window may use the microphone and sound devices
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media' || perm === 'notifications' || perm === 'clipboard-read' || perm === 'clipboard-sanitized-write'))

  let bridge: BrowserWindow | null = null
  const getBridge = async (): Promise<BrowserWindow> => {
    if (bridge && !bridge.isDestroyed()) return bridge
    bridge = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } })
    await bridge.loadURL('data:text/html,' + encodeURIComponent(BRIDGE))
    return bridge
  }
  const once = <T>(channel: string, ms: number): Promise<T | null> =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        ipcMain.removeListener(channel, h)
        resolve(null)
      }, ms)
      const h = (_e: unknown, v: T): void => {
        clearTimeout(t)
        ipcMain.removeListener(channel, h)
        resolve(v)
      }
      ipcMain.on(channel, h)
    })

  let route: CallRoute | null = null
  let phoneSaid: CallRoute | null = null
  let state = 'idle'
  let here = false
  let muted = false
  let outDev: string | null = null
  let inDev: string | null = null
  let bridged = false
  let busy = Promise.resolve()
  const phoneName = (): string => (ctx.hub.session?.device.name || '').toLowerCase().split(' ')[0]
  const emitRoute = (): void => ctx.emit('call.route', route)

  const startBridge = async (): Promise<boolean> => {
    const w = await getBridge()
    const status = once<{ ok: boolean; reason?: string }>('cb-status', 12000)
    w.webContents.send('start', { phone: phoneName(), out: outDev, in: inDev, muted })
    const r = await status
    bridged = !!r?.ok
    return bridged
  }
  const stopBridge = (): void => {
    bridged = false
    if (bridge && !bridge.isDestroyed()) bridge.webContents.send('stop')
  }

  const setRoute = (r: CallRoute | null): Promise<void> =>
    (busy = busy.then(async () => {
      if (r === route) return
      if (r === 'pc') {
        // ask the phone's call screen too (needs screen control), then open the call's sound devices
        await ctx.hub.request('call.control', { action: 'audio-pc', target: os.hostname() }, 8000).catch(() => null)
        const ok = await startBridge()
        route = ok ? 'pc' : phoneSaid || 'phone'
        if (!ok)
          ctx.toast({ kind: 'info', title: 'Call audio stays on the phone', body: 'The phone\'s call link isn\'t connected to this PC. Pair the phone in Windows Bluetooth settings, and turn on "Phone calls" for this PC on the phone.', ttl: 15000 })
      } else if (r === 'phone' || r === 'speaker') {
        stopBridge()
        await ctx.hub.request('call.control', { action: r === 'speaker' ? 'audio-speaker' : 'audio-phone' }, 8000).catch(() => null)
        route = r
      } else {
        stopBridge()
        route = null
      }
      emitRoute()
    }))

  ctx.hub.on('message', (type, data) => {
    if (type === 'call.audio' && data) {
      const r: CallRoute = data.route === 'speaker' ? 'speaker' : data.route === 'bluetooth' || bridged ? 'pc' : 'phone'
      phoneSaid = r
      if (r !== route && !(bridged && r !== 'speaker')) {
        route = r
        emitRoute()
      }
      return
    }
    if (type !== 'call.state') return
    const prev = state
    state = (data as CallState).state
    if (state === 'idle') {
      here = false
      muted = false
      phoneSaid = null
      void setRoute(null)
    } else if ((state === 'offhook' || state === 'dialing') && !(data as any).existing) {
      if (prev === 'ringing' || prev === 'idle' || route === null) void setRoute(here ? 'pc' : 'phone')
    }
  })
  ctx.hub.on('disconnected', () => {
    here = false
    state = 'idle'
    void setRoute(null)
  })

  ctx.handle('callRoute', () => route)
  ctx.handle('setCallRoute', (r: CallRoute) => setRoute(r))
  ctx.handle('callDevices', async () => {
    const w = await getBridge()
    const got = once<{ kind: string; id: string; label: string }[]>('cb-devices', 8000)
    w.webContents.send('devices')
    const all = ((await got) || []).filter((d) => d.id !== 'default' && d.id !== 'communications' && !/hands-?free|AG Audio/i.test(d.label))
    const outputs = all.filter((d) => d.kind === 'audiooutput').map((d) => ({ name: d.id, label: d.label || 'Speaker' }))
    const inputs = all.filter((d) => d.kind === 'audioinput').map((d) => ({ name: d.id, label: d.label || 'Microphone' }))
    return { outputs, inputs, out: outDev || outputs[0]?.name || null, in: inDev || inputs[0]?.name || null }
  })
  ctx.handle('setCallDevices', async (out: string | null, inp: string | null) => {
    outDev = out || null
    inDev = inp || null
    if (bridged) await startBridge()
  })
  ctx.handle('phoneControl', async () => ((await ctx.hub.request('control.status', {}, 5000).catch(() => null)) as any)?.on !== false)
  ctx.handle('openPhoneSetting', (which: string) => ctx.hub.send('open.setting', { which }))

  // ---------------------------------------------------------------- phone music on this PC
  let music: ChildProcessWithoutNullStreams | null = null
  let musicFor = ''
  const stopMusic = (): void => {
    if (music) {
      try {
        music.stdin.write('stop\n')
      } catch {}
      setTimeout(() => music?.kill(), 1500)
    }
    music = null
    musicFor = ''
  }
  const phoneMusic = (): void => {
    const want = !!ctx.store.get('phoneAudioOnPc') && !!ctx.hub.session
    const name = ctx.hub.session?.device.name || ''
    if (!want) return stopMusic()
    if (music && musicFor === name) return
    stopMusic()
    musicFor = name
    music = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resource('win', 'phone-audio.ps1'), '-Phone', name.split(' ')[0]], { windowsHide: true })
    music.on('exit', () => {
      music = null
      musicFor = ''
    })
  }
  ctx.store.on('change', (k: string) => k === 'phoneAudioOnPc' && phoneMusic())
  ctx.hub.on('connected', () => setTimeout(phoneMusic, 3000))
  ctx.hub.on('disconnected', stopMusic)
  app.on('before-quit', stopMusic)

  return {
    answeredHere: () => (here = true),
    setMuted: (m: boolean) => {
      muted = m
      if (bridge && !bridge.isDestroyed()) bridge.webContents.send('mute', m)
    }
  }
}
