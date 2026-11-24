// 20-20-20 eye care, ported from side-eye (src/main/eyebreak.js) and taken across devices.
// After every 20 minutes of screen time, 20 seconds looking at something 20 feet away.
// Only screen-on time counts; five minutes or more with the screen off is a rest.
// New in D-Connect: the phone's screen counts too (looking at the phone is not a rest),
// the break shows on the phone at the same moment, and every break is kept for stats.
import { execFile } from 'child_process'
import type { EyeResult, EyeStats, EyeStatus } from '@shared/protocol'

export const TICK_MS = 5000
export const REST_MS = 5 * 60000 // screen off this long = the eyes already had a break
export const IDLE_OFF_S = 15 * 60 // no input this long and no other way to ask: count it off
export const SNOOZE_MS = 5 * 60000

export interface EyeSettings {
  get(k: 'eyeBreaks' | 'eyeBreakSound' | 'eyePhoneCounts'): boolean
  get(k: 'eyeBreakMinutes' | 'eyeBreakSeconds'): number
  get(k: 'eyeStats'): Record<string, { done: number; skip: number; snooze: number }>
  set(k: 'eyeStats', v: Record<string, { done: number; skip: number; snooze: number }>): void
}

export interface PowerLike {
  on(e: string, l: () => void): void
  getSystemIdleState(t: number): string
  getSystemIdleTime(): number
}

// GNOME: is the screen blanked/locked? null when it can't be asked (not GNOME, Windows).
function gnomeBlanked(): Promise<boolean | null> {
  if (process.platform !== 'linux') return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile(
      'gdbus',
      ['call', '--session', '--dest', 'org.gnome.ScreenSaver', '--object-path', '/org/gnome/ScreenSaver', '--method', 'org.gnome.ScreenSaver.GetActive'],
      { timeout: 2000 },
      (err, out) => resolve(err ? null : /true/.test(out))
    )
  })
}

export function dayKey(t = Date.now()): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface EyeBreakOptions {
  settings: EyeSettings
  power: PowerLike
  show: (o: { seconds: number; sound: boolean }) => Promise<EyeResult>
  busy?: () => boolean
  onChange?: (s: EyeStatus) => void
  now?: () => number
  pcScreenOn?: () => Promise<boolean> // for tests
}

export class EyeBreak {
  activeMs = 0
  offSince = 0
  lastTick: number
  suspended = false
  locked = false
  showing = false
  snoozeUntil = 0
  phoneScreenOn = false
  private gnome = true
  private timer: NodeJS.Timeout | null = null
  private now: () => number

  constructor(private o: EyeBreakOptions) {
    this.now = o.now || Date.now
    this.lastTick = this.now()
  }

  start(): void {
    const p = this.o.power
    p.on('suspend', () => (this.suspended = true))
    p.on('resume', () => {
      this.suspended = false
      this.reset() // the laptop slept: a rest
    })
    p.on('lock-screen', () => (this.locked = true))
    p.on('unlock-screen', () => (this.locked = false))
    this.timer = setInterval(() => this.tick().catch(() => {}), TICK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  reset(): void {
    this.activeMs = 0
    this.offSince = 0
    this.lastTick = this.now()
    this.emit()
  }

  get everyMs(): number {
    return Math.max(1, +this.o.settings.get('eyeBreakMinutes') || 20) * 60000
  }

  get seconds(): number {
    return Math.max(5, +this.o.settings.get('eyeBreakSeconds') || 20)
  }

  status(): EyeStatus {
    const on = !!this.o.settings.get('eyeBreaks')
    return {
      on,
      nextInMs: on ? Math.max(0, this.everyMs - this.activeMs) : null,
      everyMs: this.everyMs,
      seconds: this.seconds,
      screenOn: !this.offSince,
      showing: this.showing,
      phoneCounts: !!this.o.settings.get('eyePhoneCounts')
    }
  }

  private emit(): void {
    this.o.onChange?.(this.status())
  }

  async pcScreenOn(): Promise<boolean> {
    if (this.o.pcScreenOn) return this.o.pcScreenOn()
    if (this.suspended || this.locked) return false
    if (this.o.power.getSystemIdleState(60) === 'locked') return false
    if (this.gnome) {
      const blanked = await gnomeBlanked()
      if (blanked === null) this.gnome = false
      else if (blanked) return false
    }
    return this.o.power.getSystemIdleTime() < IDLE_OFF_S
  }

  // Any screen in front of the eyes: the PC's, or the phone's when that is allowed to count.
  async screenOn(): Promise<boolean> {
    if (await this.pcScreenOn()) return true
    return this.phoneScreenOn && !!this.o.settings.get('eyePhoneCounts')
  }

  async tick(): Promise<void> {
    const now = this.now()
    const dt = Math.min(now - this.lastTick, TICK_MS * 3) // a long gap (sleep) never counts as screen time
    this.lastTick = now
    if (!this.o.settings.get('eyeBreaks') || this.showing) return
    if (!(await this.screenOn())) {
      if (!this.offSince) this.offSince = now
      else if (now - this.offSince >= REST_MS && this.activeMs) this.reset()
      return
    }
    if (this.offSince) {
      if (now - this.offSince >= REST_MS) this.activeMs = 0
      this.offSince = 0
    }
    this.activeMs += dt
    if (this.activeMs < this.everyMs || now < this.snoozeUntil || this.o.busy?.()) return
    await this.take()
  }

  // A break now (also from the tray, the app, or the phone).
  async take(): Promise<EyeResult | null> {
    if (this.showing) return null
    this.showing = true
    this.emit()
    let result: EyeResult = 'done'
    try {
      result = await this.o.show({ seconds: this.seconds, sound: this.o.settings.get('eyeBreakSound') !== false })
    } catch {
      // the window failed: try again next round
    }
    this.showing = false
    if (result === 'snooze') {
      this.snoozeUntil = this.now() + SNOOZE_MS
      this.activeMs = this.everyMs // due again as soon as the snooze ends
    } else {
      this.snoozeUntil = 0
      this.activeMs = 0
    }
    this.lastTick = this.now()
    this.record(result)
    this.emit()
    return result
  }

  // ---------------------------------------------------------------- stats
  record(result: EyeResult): void {
    const all = { ...this.o.settings.get('eyeStats') }
    const k = dayKey(this.now())
    const day = Object.assign({ done: 0, skip: 0, snooze: 0 }, all[k])
    day[result]++
    all[k] = day
    // keep a year
    const keys = Object.keys(all).sort()
    while (keys.length > 366) delete all[keys.shift()!]
    this.o.settings.set('eyeStats', all)
  }

  stats(days = 7): EyeStats {
    return computeStats(this.o.settings.get('eyeStats'), days, this.now())
  }
}

// A day "counts" for the streak when at least one break was taken and no more were skipped than taken.
export function computeStats(all: Record<string, { done: number; skip: number; snooze: number }>, days: number, now: number): EyeStats {
  const out: EyeStats['days'] = []
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(now - i * 86400000)
    out.push(Object.assign({ date: k, done: 0, skip: 0, snooze: 0 }, all[k]))
  }
  const good = (k: string): boolean => !!all[k] && all[k].done > 0 && all[k].done >= all[k].skip
  let streak = 0
  // today still in progress: it doesn't break the streak until it is over
  let i = good(dayKey(now)) ? 0 : 1
  while (good(dayKey(now - i * 86400000))) {
    streak++
    i++
  }
  let best = 0
  let run = 0
  let prev = 0
  for (const k of Object.keys(all).sort()) {
    const t = new Date(k + 'T12:00:00').getTime()
    if (good(k)) {
      run = prev && Math.round((t - prev) / 86400000) === 1 && run ? run + 1 : 1
      best = Math.max(best, run)
    } else run = 0
    prev = t
  }
  return { days: out, streak, best: Math.max(best, streak) }
}
