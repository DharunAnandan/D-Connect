// Volume booster: this PC's speaker and every app playing sound (Chrome, Spotify, the phone's
// music...), each settable 0-300%. Above 100% PulseAudio amplifies in software, which is how
// a quiet video in Chrome gets loud enough. Linux (PulseAudio / pipewire-pulse) only.
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { app } from 'electron'
import path from 'path'
import type { Ctx } from '../context'

function pactl(args: string[]): Promise<string> {
  return new Promise((resolve) =>
    execFile('pactl', args, { timeout: 5000, env: { ...process.env, LC_ALL: 'C' }, maxBuffer: 8 * 1024 * 1024 }, (err, out) => resolve(err ? '' : out))
  )
}

export interface MixerApp {
  id: string
  name: string
  icon?: string
  volume: number
  muted: boolean
  phone?: boolean
}
export interface Mixer {
  supported: boolean
  max?: number // highest volume allowed here (Linux 300, Windows 100)
  output: { name: string; label: string; volume: number; muted: boolean } | null
  apps: MixerApp[]
}

const pctOf = (s: string): number => Number(/(\d+)%/.exec(s)?.[1] ?? 100)
// every regex special character in the key is escaped, not only the dots
const reEscape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const prop = (block: string, key: string): string | undefined => new RegExp(`${reEscape(key)} = "([^"]*)"`).exec(block)?.[1]

// ---------------------------------------------------------------- Windows
// A PowerShell helper (resources/win/mixer.ps1) that stays running and answers one JSON line
// per command, using Windows' own Core Audio volume controls.
let win: ChildProcessWithoutNullStreams | null = null
let winBuf = ''
const winWaiting: ((line: string) => void)[] = []
function winCmd(cmd: string): Promise<any> {
  return new Promise((resolve) => {
    if (!win || win.killed) {
      const base = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources') : path.join(app.getAppPath(), 'resources')
      win = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(base, 'win', 'mixer.ps1')], { windowsHide: true })
      winBuf = ''
      win.stdout.on('data', (d) => {
        winBuf += d.toString()
        let i
        while ((i = winBuf.indexOf('\n')) >= 0) {
          const line = winBuf.slice(0, i).trim()
          winBuf = winBuf.slice(i + 1)
          if (!line || line.startsWith('{"ready"')) continue
          winWaiting.shift()?.(line)
        }
      })
      win.on('exit', () => {
        win = null
        while (winWaiting.length) winWaiting.shift()?.('{}')
      })
    }
    const t = setTimeout(() => resolve({}), 8000)
    winWaiting.push((line) => {
      clearTimeout(t)
      try { resolve(JSON.parse(line)) } catch { resolve({}) }
    })
    win.stdin.write(cmd + '\n')
  })
}

async function readWindows(): Promise<Mixer> {
  const r = await winCmd('list')
  if (!r?.output) return { supported: false, output: null, apps: [] }
  const nice = (n: string): string => ({ chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', spotify: 'Spotify', ms_teams: 'Teams', teams: 'Teams', vlc: 'VLC', zoom: 'Zoom', discord: 'Discord' } as Record<string, string>)[n.toLowerCase()] || n
  return { supported: true, max: 100, output: r.output, apps: (r.apps || []).map((a: any) => ({ id: a.id, name: nice(a.name), volume: a.volume, muted: a.muted })) }
}

async function read(): Promise<Mixer> {
  if (process.platform === 'win32') return readWindows()
  if (process.platform !== 'linux') return { supported: false, output: null, apps: [] }
  const def = (await pactl(['get-default-sink'])).trim()
  if (!def) return { supported: false, output: null, apps: [] }
  const sinks = (await pactl(['list', 'sinks'])).split(/^Sink #/m)
  const sb = sinks.find((b) => b.includes(`Name: ${def}\n`)) || ''
  const output = {
    name: def,
    label: /Description: (.*)/.exec(sb)?.[1] || 'Speaker',
    volume: pctOf(/^\s*Volume: (.*)$/m.exec(sb)?.[1] || ''),
    muted: /Mute: yes/.test(sb)
  }
  const apps: MixerApp[] = []
  for (const b of (await pactl(['list', 'sink-inputs'])).split(/^Sink Input #/m).slice(1)) {
    const id = b.split('\n')[0].trim()
    const app = prop(b, 'application.name') || ''
    const media = prop(b, 'media.name') || ''
    // skip our own call/ringer plumbing and event sounds
    if (/^(D-Connect|Electron)$/i.test(app) && !/dconnect-phone/.test(app)) continue
    if (prop(b, 'media.role') === 'event') continue
    const phone = app === 'dconnect-phone' || /^Loopback from /.test(media)
    if (/^Loopback /.test(media) && !phone) continue
    apps.push({
      id,
      name: phone ? 'Phone audio' : prop(b, 'application.process.binary') === 'chrome' ? 'Chrome' : app || media || 'App',
      icon: phone ? 'phone' : prop(b, 'application.icon_name'),
      volume: pctOf(/^\s*Volume: (.*)$/m.exec(b)?.[1] || ''),
      muted: /Mute: yes/.test(b),
      phone
    })
  }
  return { supported: true, max: 300, output, apps }
}

export function sound(ctx: Ctx): void {
  const clamp = (n: number): number => Math.max(0, Math.min(300, Math.round(n)))
  ctx.handle('mixer', () => read())
  ctx.handle('mixerSet', async (kind: 'output' | 'app', id: string, pct: number, phone?: boolean) => {
    if (process.platform === 'win32') {
      const p = Math.min(100, clamp(pct))
      await winCmd(kind === 'output' ? `master ${p}` : `app ${Number(id)} ${p}`)
      return read()
    }
    const v = `${clamp(pct)}%`
    if (kind === 'output') await pactl(['set-sink-volume', '@DEFAULT_SINK@', v])
    else if (phone) ctx.store.set('phoneAudioVolume', clamp(pct)) // kept across restarts
    else await pactl(['set-sink-input-volume', id, v])
    return read()
  })
  ctx.handle('mixerMute', async (kind: 'output' | 'app', id: string, muted: boolean) => {
    if (process.platform === 'win32') {
      await winCmd(kind === 'output' ? `mutemaster ${muted ? 1 : 0}` : `muteapp ${Number(id)} ${muted ? 1 : 0}`)
      return read()
    }
    if (kind === 'output') await pactl(['set-sink-mute', '@DEFAULT_SINK@', muted ? '1' : '0'])
    else await pactl(['set-sink-input-mute', id, muted ? '1' : '0'])
    return read()
  })
}
