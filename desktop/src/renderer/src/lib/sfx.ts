// Sounds made from oscillators, no files (the side-eye approach): soft sine notes with a
// couple of harmonics and an exponential tail.
let ctx: AudioContext | null = null

function tone(freqs: number[], gap: number, level: number, tail = 1.6, type: OscillatorType = 'sine'): void {
  try {
    ctx = ctx || new AudioContext()
    const t0 = ctx.currentTime + 0.02
    const out = ctx.createGain()
    out.gain.value = level
    out.connect(ctx.destination)
    freqs.forEach((f, i) => {
      const t = t0 + i * gap
      for (const [mult, amp] of [[1, 1], [2, 0.16], [3, 0.05]] as const) {
        const o = ctx!.createOscillator()
        const g = ctx!.createGain()
        o.type = type
        o.frequency.value = f * mult
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(amp, t + 0.015)
        g.gain.exponentialRampToValueAtTime(0.0001, t + tail)
        o.connect(g).connect(out)
        o.start(t)
        o.stop(t + tail + 0.1)
      }
    })
  } catch {
    // no audio device
  }
}

export const sfx = {
  connect: () => tone([523.25, 659.25, 783.99, 1046.5], 0.09, 0.09, 1.4),
  disconnect: () => tone([659.25, 493.88], 0.12, 0.07, 1.0),
  notify: () => tone([880, 1174.66], 0.08, 0.05, 0.9),
  tap: () => tone([1318.5], 0, 0.025, 0.25),
  sent: () => tone([987.77, 1318.5], 0.06, 0.04, 0.6),
  ring: () => tone([1046.5, 1318.5, 1046.5, 1318.5], 0.14, 0.12, 0.5, 'triangle'),
  // a second call while you're on one: two quiet short beeps, not a ring
  waitBeep: () => tone([880, 880], 0.32, 0.035, 0.22)
}
