// The eye break (from side-eye): the screen dims, a field of lights drifts away into the
// distance so the eyes follow it out, and a ring counts the seconds down. Restyled with the
// D-Connect aurora; same chimes.
import '@fontsource-variable/inter'
import './eyebreak.css'

const api = window.dc
const q = new URLSearchParams(location.search)
const SECONDS = Math.max(5, +(q.get('s') || 20))
const SOUND = q.get('sound') === '1'
const PRIMARY = q.get('primary') !== '0'
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const body = document.body
if (!PRIMARY) body.classList.add('secondary')

const TIPS = [
  'A window, a tree, the far wall. Let your eyes soften.',
  'Blink slowly a few times.',
  'Relax your shoulders. Breathe out.',
  'Find the farthest thing you can see.'
]

// ---------------------------------------------------------------- sound
let audio: AudioContext | null = null
function chime(notes: number[], gap: number, level: number): void {
  if (!SOUND || !PRIMARY) return
  try {
    audio = audio || new AudioContext()
    const t0 = audio.currentTime + 0.05
    const out = audio.createGain()
    out.gain.value = level
    out.connect(audio.destination)
    notes.forEach((f, i) => {
      const t = t0 + i * gap
      for (const [mult, amp] of [[1, 1], [2, 0.18], [3, 0.06]]) {
        const o = audio!.createOscillator()
        const g = audio!.createGain()
        o.type = 'sine'
        o.frequency.value = f * mult
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(amp, t + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
        o.connect(g).connect(out)
        o.start(t)
        o.stop(t + 2.5)
      }
    })
  } catch {
    // no audio device: the break works silently
  }
}

// ---------------------------------------------------------------- the lights in the distance
const canvas = document.getElementById('depth') as HTMLCanvasElement
const g = canvas.getContext('2d')!
let W = 0
let H = 0
function resize(): void {
  const dpr = window.devicePixelRatio || 1
  W = canvas.width = Math.round(innerWidth * dpr)
  H = canvas.height = Math.round(innerHeight * dpr)
}
addEventListener('resize', resize)
resize()
const STARS = Array.from({ length: 240 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random(), hue: Math.random() }))
let running = true
let last = performance.now()
function frame(now: number): void {
  if (!running) return
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  g.clearRect(0, 0, W, H)
  const cx = W / 2
  const cy = H * 0.45
  const scale = Math.max(W, H) * 0.5
  const hg = g.createLinearGradient(0, cy, W, cy)
  hg.addColorStop(0, 'rgba(124,92,255,0)')
  hg.addColorStop(0.5, 'rgba(53,224,255,0.18)')
  hg.addColorStop(1, 'rgba(61,220,151,0)')
  g.fillStyle = hg
  g.fillRect(0, cy - 0.5, W, 1)
  const dpr = window.devicePixelRatio || 1
  for (const s of STARS) {
    if (!reduced) s.z += dt * 0.045
    if (s.z > 1) {
      s.z = 0.02
      s.x = (Math.random() - 0.5) * 2
      s.y = (Math.random() - 0.5) * 2
    }
    const d = 0.25 + s.z * 3.2
    const x = cx + (s.x / d) * scale
    const y = cy + (s.y / d) * scale
    const near = 1 - s.z
    const r = Math.max(0.4, 2.2 * near) * dpr
    // violet -> cyan -> mint, like the rest of D-Connect
    const hue = 262 - s.hue * 110
    g.fillStyle = `hsla(${hue}, 95%, ${72 + 10 * near}%, ${0.12 + 0.6 * near * near})`
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// ---------------------------------------------------------------- countdown
const progress = document.getElementById('progress') as unknown as SVGCircleElement
const count = document.getElementById('count')!
const tip = document.getElementById('tip')!
const LEN = 2 * Math.PI * 88
progress.style.strokeDasharray = `${LEN}`
progress.style.strokeDashoffset = '0'
count.textContent = String(SECONDS)

let ended = false
function finish(result: 'done' | 'skip' | 'snooze'): void {
  if (ended) return
  ended = true
  body.classList.add('out')
  setTimeout(() => {
    running = false
    api.eyeBreakDone(result)
  }, 900)
}

let start = 0
function countdown(now: number): void {
  if (ended) return
  if (!start) start = now
  const t = (now - start) / 1000
  const left = Math.max(0, SECONDS - t)
  progress.style.strokeDashoffset = `${LEN * (1 - left / SECONDS)}`
  count.textContent = String(Math.ceil(left))
  const tipIndex = Math.min(TIPS.length - 1, Math.floor((t / SECONDS) * TIPS.length))
  if (PRIMARY && tip.dataset.i !== String(tipIndex)) {
    tip.dataset.i = String(tipIndex)
    tip.classList.add('fade')
    setTimeout(() => {
      tip.textContent = TIPS[tipIndex]
      tip.classList.remove('fade')
    }, 500)
  }
  if (left <= 0) {
    body.classList.add('finished')
    document.getElementById('title')!.textContent = 'Nice. Back to it.'
    tip.textContent = ''
    chime([659.25, 783.99, 987.77], 0.16, 0.16)
    setTimeout(() => finish('done'), 1600)
    return
  }
  requestAnimationFrame(countdown)
}

requestAnimationFrame(() => {
  body.classList.add('in')
  chime([523.25, 659.25], 0.22, 0.13)
  setTimeout(() => requestAnimationFrame(countdown), 900)
})

document.getElementById('skip')!.addEventListener('click', () => finish('skip'))
document.getElementById('snooze')!.addEventListener('click', () => finish('snooze'))
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') finish('skip')
})
api.onEyeBreakEnd(() => finish('skip')) // another screen (or the phone) ended it
api.invoke('conn').then((c: any) => c?.connected && body.classList.add('synced'))
