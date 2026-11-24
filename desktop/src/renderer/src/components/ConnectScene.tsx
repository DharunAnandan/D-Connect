// The signature moment: the PC searches (radar pulses, orbiting sparks), the phone is found
// and flies in, a beam of particles arcs between them, the handshake shifts violet -> cyan,
// and on connect the beam tightens into a burst and a check mark.
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Laptop, Smartphone } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { bouncy, softSpring } from '@/theme/motion'

export type SceneState = 'searching' | 'found' | 'handshake' | 'connected'

interface Particle {
  t: number // position along the arc 0..1
  speed: number
  off: number // perpendicular offset
  size: number
  hue: number
}
interface Spark {
  a: number
  r: number
  speed: number
  size: number
}
interface Burst {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  hue: number
}

export function ConnectScene({ state, phoneName = 'Phone', pcName = 'This PC', height = 360 }: { state: SceneState; phoneName?: string; pcName?: string; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)
  const progress = useRef({ link: 0, hue: 0, tight: 0, burstDone: false })
  stateRef.current = state

  useEffect(() => {
    const c = canvas.current!
    const g = c.getContext('2d')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduced')
    let W = 0
    let H = 0
    let dpr = 1
    const resize = (): void => {
      dpr = Math.min(1.5, window.devicePixelRatio || 1)
      W = c.clientWidth
      H = c.clientHeight
      c.width = W * dpr
      c.height = H * dpr
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(c)

    const particles: Particle[] = Array.from({ length: 70 }, () => ({ t: Math.random(), speed: 0.12 + Math.random() * 0.25, off: (Math.random() - 0.5) * 2, size: 0.8 + Math.random() * 2, hue: Math.random() }))
    const sparks: Spark[] = Array.from({ length: 26 }, (_, i) => ({ a: (i / 26) * Math.PI * 2, r: 70 + Math.random() * 60, speed: 0.15 + Math.random() * 0.35, size: 0.8 + Math.random() * 1.8 }))
    let burst: Burst[] = []
    let raf = 0
    let last = performance.now()
    let time = 0

    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
    const mix = (h: number): string => {
      // violet (262) -> cyan (190) -> mint (152)
      const hue = h < 0.5 ? lerp(262, 190, h * 2) : lerp(190, 152, (h - 0.5) * 2)
      return `${hue}`
    }

    const frame = (now: number): void => {
      if (document.hidden) {
        last = now
        raf = requestAnimationFrame(frame)
        return
      }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      time += reduced ? 0 : dt
      const s = stateRef.current
      const p = progress.current
      const target = s === 'searching' ? 0 : 1
      p.link += (target - p.link) * Math.min(1, dt * 3)
      p.hue += ((s === 'handshake' ? 0.55 : s === 'connected' ? 1 : 0) - p.hue) * Math.min(1, dt * 2)
      p.tight += ((s === 'connected' ? 1 : 0) - p.tight) * Math.min(1, dt * 4)

      g.clearRect(0, 0, W, H)
      const cy = H / 2
      const ax = W * 0.27
      const bx = W * 0.73
      const pcX = s === 'searching' ? W / 2 : ax
      const hue = mix(p.hue)

      // radar pulses around the PC while searching (they fade as the link forms)
      const radarAlpha = 1 - p.link
      if (radarAlpha > 0.02) {
        const cx = lerp(W / 2, ax, p.link)
        for (let i = 0; i < 4; i++) {
          const k = ((time * 0.45 + i / 4) % 1)
          const r = 50 + k * Math.min(W, H) * 0.42
          g.beginPath()
          g.arc(cx, cy, r, 0, Math.PI * 2)
          g.strokeStyle = `hsla(${hue}, 95%, 70%, ${(1 - k) * 0.32 * radarAlpha})`
          g.lineWidth = 1.5
          g.stroke()
        }
        // rotating sweep
        const sweep = g.createConicGradient(time * 1.4, cx, cy)
        sweep.addColorStop(0, `hsla(${hue}, 95%, 70%, ${0.16 * radarAlpha})`)
        sweep.addColorStop(0.12, 'hsla(0,0%,0%,0)')
        sweep.addColorStop(1, 'hsla(0,0%,0%,0)')
        g.fillStyle = sweep
        g.beginPath()
        g.arc(cx, cy, Math.min(W, H) * 0.42, 0, Math.PI * 2)
        g.fill()
        for (const sp of sparks) {
          sp.a += sp.speed * dt
          const x = cx + Math.cos(sp.a) * sp.r
          const y = cy + Math.sin(sp.a) * sp.r * 0.85
          g.fillStyle = `hsla(${hue}, 100%, 80%, ${0.55 * radarAlpha})`
          g.beginPath()
          g.arc(x, y, sp.size, 0, Math.PI * 2)
          g.fill()
        }
      }

      // the beam between the devices
      if (p.link > 0.02) {
        const lift = lerp(70, 14, p.tight) // the arc flattens when the link locks
        const ctrlY = cy - lift
        const point = (t: number): [number, number] => {
          const x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * (W / 2) + t * t * bx
          const y = (1 - t) ** 2 * cy + 2 * (1 - t) * t * ctrlY + t * t * cy
          return [x, y]
        }
        // glow line
        const grad = g.createLinearGradient(ax, 0, bx, 0)
        grad.addColorStop(0, `hsla(${hue}, 95%, 68%, ${0.5 * p.link})`)
        grad.addColorStop(0.5, `hsla(${(+hue + 40) % 360}, 95%, 72%, ${0.75 * p.link})`)
        grad.addColorStop(1, `hsla(${hue}, 95%, 68%, ${0.5 * p.link})`)
        const reach = Math.min(1, p.link * 1.15)
        g.beginPath()
        for (let i = 0; i <= 40; i++) {
          const t = (i / 40) * reach
          const [x, y] = point(t)
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        // glow: a wide faint stroke under the line (shadowBlur is far too slow per frame)
        g.strokeStyle = `hsla(${hue}, 100%, 65%, ${0.16 * p.link})`
        g.lineWidth = lerp(8, 12, p.tight)
        g.stroke()
        g.strokeStyle = grad
        g.lineWidth = lerp(1.2, 2.6, p.tight)
        g.stroke()
        // particles riding the beam, both ways
        for (const pt of particles) {
          pt.t += pt.speed * dt * (1 + p.tight * 1.5)
          if (pt.t > 1) pt.t -= 1
          const dir = pt.hue > 0.5 ? pt.t : 1 - pt.t
          if (dir > reach) continue
          const [x, y] = point(dir)
          const spread = lerp(16, 3, p.tight) * Math.sin(dir * Math.PI)
          const a = Math.sin(dir * Math.PI) * p.link
          g.fillStyle = `hsla(${(+hue + pt.hue * 60) % 360}, 100%, 78%, ${a * 0.9})`
          g.beginPath()
          g.arc(x, y + pt.off * spread, pt.size, 0, Math.PI * 2)
          g.fill()
        }
      }

      // the burst when the link locks
      if (s === 'connected' && !p.burstDone && p.tight > 0.6) {
        p.burstDone = true
        for (const x of [ax, bx, W / 2])
          for (let i = 0; i < 36; i++) {
            const a = Math.random() * Math.PI * 2
            const v = 60 + Math.random() * 200
            burst.push({ x, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue: 150 + Math.random() * 120 })
          }
      }
      if (s !== 'connected') p.burstDone = false
      burst = burst.filter((b) => b.life > 0)
      for (const b of burst) {
        b.life -= dt * 1.3
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.vx *= 0.96
        b.vy *= 0.96
        g.fillStyle = `hsla(${b.hue}, 100%, 75%, ${Math.max(0, b.life)})`
        g.beginPath()
        g.arc(b.x, b.y, 2 * b.life + 0.5, 0, Math.PI * 2)
        g.fill()
      }

      // halos behind the devices
      const halo = (x: number, strength: number): void => {
        const r = 90
        const hg = g.createRadialGradient(x, cy, 0, x, cy, r)
        hg.addColorStop(0, `hsla(${hue}, 100%, 65%, ${0.28 * strength})`)
        hg.addColorStop(1, 'hsla(0,0%,0%,0)')
        g.fillStyle = hg
        g.fillRect(x - r, cy - r, r * 2, r * 2)
      }
      halo(pcX, 1)
      if (p.link > 0.05) halo(bx, p.link)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const found = state !== 'searching'
  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {/* PC */}
      <motion.div className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3" initial={false} animate={{ left: found ? '27%' : '50%' }} transition={softSpring}>
        <Device icon={<Laptop size={34} strokeWidth={1.6} />} glow={state === 'connected'} />
        <span className="text-xs font-medium text-white/70">{pcName}</span>
      </motion.div>
      {/* phone */}
      <AnimatePresence>
        {found && (
          <motion.div
            key="phone"
            className="absolute left-[73%] top-1/2 flex flex-col items-center gap-3"
            style={{ x: '-50%', y: '-50%' }}
            initial={{ opacity: 0, scale: 0.4, x: '30%', rotate: 18 }}
            animate={{ opacity: 1, scale: 1, x: '-50%', rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={bouncy}
          >
            <Device icon={<Smartphone size={32} strokeWidth={1.6} />} glow={state === 'connected'} tall />
            <span className="text-xs font-medium text-white/70">{phoneName}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* check */}
      <AnimatePresence>
        {state === 'connected' && (
          <motion.div
            key="check"
            className="absolute left-1/2 top-[calc(50%-14px)] grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-mint text-ink-950 shadow-[0_0_40px_rgba(61,220,151,0.8)]"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={{ ...bouncy, delay: 0.35 }}
          >
            <Check size={26} strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Device({ icon, glow, tall }: { icon: React.ReactNode; glow?: boolean; tall?: boolean }) {
  return (
    <motion.div
      animate={glow ? { boxShadow: ['0 0 0px rgba(61,220,151,0)', '0 0 50px rgba(61,220,151,0.55)', '0 0 28px rgba(61,220,151,0.35)'] } : { boxShadow: '0 0 30px rgba(124,92,255,0.35)' }}
      transition={{ duration: 1.2 }}
      className={`grid place-items-center rounded-3xl bg-[linear-gradient(150deg,rgba(40,48,90,0.95),rgba(16,20,40,0.95))] text-white ring-1 ring-white/15 ${tall ? 'h-24 w-16' : 'h-20 w-24'}`}
    >
      {icon}
    </motion.div>
  )
}
