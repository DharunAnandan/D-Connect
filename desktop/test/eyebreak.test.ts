import { describe, expect, it, vi } from 'vitest'
import { computeStats, dayKey, EyeBreak, REST_MS, SNOOZE_MS, TICK_MS } from '../src/main/eyebreak'

function setup(over: Partial<Record<string, any>> = {}) {
  const data: Record<string, any> = { eyeBreaks: true, eyeBreakMinutes: 1, eyeBreakSeconds: 20, eyeBreakSound: false, eyePhoneCounts: true, eyeStats: {}, ...over }
  let now = new Date('2026-11-24T10:00:00').getTime()
  let pcOn = true
  const show = vi.fn(async () => 'done' as const)
  const eye = new EyeBreak({
    settings: { get: (k: string) => data[k], set: (k: string, v: any) => (data[k] = v) } as any,
    power: { on: () => {}, getSystemIdleState: () => 'active', getSystemIdleTime: () => 0 },
    show,
    now: () => now,
    pcScreenOn: async () => pcOn
  })
  const advance = async (ms: number) => {
    for (let t = 0; t < ms; t += TICK_MS) {
      now += TICK_MS
      await eye.tick()
    }
  }
  return { eye, show, data, advance, setPc: (v: boolean) => (pcOn = v), jump: (ms: number) => (now += ms) }
}

describe('EyeBreak (20-20-20)', () => {
  it('takes a break after the interval of screen time', async () => {
    const { show, advance } = setup()
    await advance(55_000)
    expect(show).not.toHaveBeenCalled()
    await advance(10_000)
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('never counts a sleep gap as screen time', async () => {
    const { eye, jump } = setup()
    jump(10 * 60_000)
    await eye.tick()
    expect(eye.activeMs).toBe(TICK_MS * 3)
  })

  it('resets after five minutes with every screen off', async () => {
    const { eye, advance, setPc } = setup({ eyePhoneCounts: false })
    await advance(30_000)
    expect(eye.activeMs).toBeGreaterThan(0)
    setPc(false)
    await advance(REST_MS + TICK_MS * 2)
    expect(eye.activeMs).toBe(0)
  })

  it('keeps counting while the phone screen is on (new in D-Connect)', async () => {
    const { eye, advance, setPc, show } = setup()
    setPc(false)
    eye.phoneScreenOn = true
    await advance(65_000)
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('snooze makes the break due again right after the snooze', async () => {
    const { eye, show, advance } = setup()
    show.mockResolvedValueOnce('snooze' as any)
    await advance(65_000)
    expect(show).toHaveBeenCalledTimes(1)
    await advance(SNOOZE_MS - 10_000)
    expect(show).toHaveBeenCalledTimes(1)
    await advance(15_000)
    expect(show).toHaveBeenCalledTimes(2)
    expect(eye.activeMs).toBeLessThan(15_000) // the clock restarted after the break
  })

  it('records results per day', async () => {
    const { eye, data } = setup()
    await eye.take()
    expect(data.eyeStats[dayKey(new Date('2026-11-24T10:00:00').getTime())].done).toBe(1)
  })
})

describe('streaks', () => {
  it('counts consecutive good days, today not breaking it', () => {
    const now = new Date('2026-11-24T10:00:00').getTime()
    const all = {
      '2026-11-21': { done: 3, skip: 0, snooze: 0 },
      '2026-11-22': { done: 2, skip: 1, snooze: 0 },
      '2026-11-23': { done: 5, skip: 0, snooze: 1 }
    }
    const s = computeStats(all, 7, now)
    expect(s.streak).toBe(3)
    expect(s.best).toBe(3)
    expect(s.days).toHaveLength(7)
  })
  it('a day with more skips than breaks breaks the streak', () => {
    const now = new Date('2026-11-24T10:00:00').getTime()
    const s = computeStats({ '2026-11-22': { done: 3, skip: 0, snooze: 0 }, '2026-11-23': { done: 1, skip: 4, snooze: 0 } }, 7, now)
    expect(s.streak).toBe(0)
    expect(s.best).toBe(1)
  })
})
