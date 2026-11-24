// Volume booster: this PC's speaker and every app playing sound (Chrome, Spotify, the phone's
// music...), each settable 0-200%. Above 100% PulseAudio amplifies in software, which is how
// a quiet video in Chrome gets loud enough. Linux (PulseAudio / pipewire-pulse) only.
import { execFile } from 'child_process'
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
  output: { name: string; label: string; volume: number; muted: boolean } | null
  apps: MixerApp[]
}

const pctOf = (s: string): number => Number(/(\d+)%/.exec(s)?.[1] ?? 100)
const prop = (block: string, key: string): string | undefined => new RegExp(`${key.replace(/\./g, '\\.')} = "([^"]*)"`).exec(block)?.[1]

async function read(): Promise<Mixer> {
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
  return { supported: true, output, apps }
}

export function sound(ctx: Ctx): void {
  const clamp = (n: number): number => Math.max(0, Math.min(200, Math.round(n)))
  ctx.handle('mixer', () => read())
  ctx.handle('mixerSet', async (kind: 'output' | 'app', id: string, pct: number, phone?: boolean) => {
    const v = `${clamp(pct)}%`
    if (kind === 'output') await pactl(['set-sink-volume', '@DEFAULT_SINK@', v])
    else if (phone) ctx.store.set('phoneAudioVolume', clamp(pct)) // kept across restarts
    else await pactl(['set-sink-input-volume', id, v])
    return read()
  })
  ctx.handle('mixerMute', async (kind: 'output' | 'app', id: string, muted: boolean) => {
    if (kind === 'output') await pactl(['set-sink-mute', '@DEFAULT_SINK@', muted ? '1' : '0'])
    else await pactl(['set-sink-input-mute', id, muted ? '1' : '0'])
    return read()
  })
}
