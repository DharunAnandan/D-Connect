// A line drawing that draws itself: the phone and this PC sketched in light, then a wave of
// light linking them with sparks running both ways. It redraws itself now and then. Pure SVG.
import { motion } from 'framer-motion'

const ink = 'url(#ld-ink)'
const draw = (delay: number, duration = 1.4) => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: [0, 1, 1, 0], opacity: [0, 1, 1, 0] },
  transition: { duration: 12, times: [0, duration / 12, 0.86, 1], delay, repeat: Infinity, ease: 'easeInOut' as const }
})

export function LinkDrawing({ className = '' }: { className?: string }) {
  const wave = 'M112 64 C 170 20, 210 108, 260 64 S 350 20, 408 64'
  return (
    <svg viewBox="0 0 520 128" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <defs>
        <linearGradient id="ld-ink" x1="0" y1="0" x2="520" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="rgb(var(--c-violet))" />
          <stop offset=".55" stopColor="rgb(var(--c-cyan))" />
          <stop offset="1" stopColor="rgb(var(--c-mint))" />
        </linearGradient>
        <filter id="ld-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <path id="ld-wave" d={wave} />
      </defs>
      <g filter="url(#ld-glow)" stroke={ink} strokeWidth="2.2">
        {/* the phone */}
        <motion.path d="M70 26 h30 a8 8 0 0 1 8 8 v60 a8 8 0 0 1 -8 8 h-30 a8 8 0 0 1 -8 -8 v-60 a8 8 0 0 1 8 -8 z" {...draw(0)} />
        <motion.path d="M80 33 h10" {...draw(0.9, 0.5)} />
        <motion.path d="M78 94 h14" {...draw(1.0, 0.5)} />
        {/* signal arcs from the phone */}
        <motion.path d="M118 46 a22 22 0 0 1 0 36" strokeWidth="1.6" {...draw(1.2, 0.6)} />
        <motion.path d="M126 38 a32 32 0 0 1 0 52" strokeWidth="1.2" {...draw(1.4, 0.6)} />
        {/* the laptop: screen, a D on it, the base */}
        <motion.path d="M416 30 h72 a6 6 0 0 1 6 6 v48 a6 6 0 0 1 -6 6 h-72 a6 6 0 0 1 -6 -6 v-48 a6 6 0 0 1 6 -6 z" {...draw(0.3)} />
        <motion.path d="M440 46 h6 c10 0 16 6 16 14 s-6 14 -16 14 h-6 z" {...draw(1.3, 0.8)} />
        <motion.path d="M400 98 h104 l-6 8 h-92 z" {...draw(0.8, 0.8)} />
        {/* the link between them */}
        <motion.path d={wave} strokeWidth="2" strokeDasharray="1 0" {...draw(1.6, 1.6)} />
      </g>
      {/* sparks running along the link, both ways */}
      {[0, 1.3, 2.6].map((d, i) => (
        <circle key={i} r={i === 1 ? 3 : 2.4} fill={i === 1 ? 'rgb(var(--c-cyan))' : 'rgb(var(--c-mint))'} opacity="0">
          <animate attributeName="opacity" values="0;1;1;0" dur="3.9s" begin={`${3.4 + d}s`} repeatCount="indefinite" />
          <animateMotion dur="3.9s" begin={`${3.4 + d}s`} repeatCount="indefinite" keyPoints={i === 1 ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear">
            <mpath href="#ld-wave" />
          </animateMotion>
        </circle>
      ))}
    </svg>
  )
}
