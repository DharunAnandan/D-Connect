import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'

// Behind the app, in the theme's colours. Styles (Settings → Experience → Background):
//  aurora: slow drifting glows (GPU-only transforms, blurred, cheap)
//  mesh:   a still, soft multi-colour gradient
//  stars:  a fine star field with a faint glow
//  solid:  the plain theme colour
const c = (name: string, a = 1): string => `rgb(var(--c-${name}) / ${a})`

const AUTO = ['aurora', 'mesh', 'stars']

// "auto": Aurora, Mesh and Starry in turn, 10 s each, cross-fading
export function Background({ tint = 'default' }: { tint?: 'default' | 'eye' }) {
  const chosen = useApp((s) => s.settings.bgStyle as string | undefined) || 'auto'
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 10000))
  useEffect(() => {
    if (chosen !== 'auto') return
    const t = setInterval(() => setTick(Math.floor(Date.now() / 10000)), 1000)
    return () => clearInterval(t)
  }, [chosen])
  const style = chosen === 'auto' ? AUTO[tick % AUTO.length] : chosen
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-900">
      <AnimatePresence initial={false}>
        <motion.div key={style} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 2, ease: 'easeInOut' }}>
          <Layer style={style} tint={tint} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Layer({ style, tint }: { style: string; tint: 'default' | 'eye' }) {
  const names = tint === 'eye' ? ['cyan', 'mint', 'violet'] : ['violet', 'cyan', 'pink']
  const glow = (n: string, a = 1): string => `radial-gradient(circle, ${c(n, a)} 0%, ${c(n, 0)} 68%)`
  return (
    <div className="absolute inset-0 overflow-hidden bg-ink-900">
      {style === 'aurora' && (
        <>
          <div className="aurora-blob" style={{ width: '46vw', height: '46vw', left: '-10vw', top: '-14vw', background: glow(names[0]), animation: 'drift1 26s ease-in-out infinite' }} />
          <div className="aurora-blob" style={{ width: '38vw', height: '38vw', right: '-8vw', top: '10vh', background: glow(names[1]), opacity: 0.3, animation: 'drift2 32s ease-in-out infinite' }} />
          <div className="aurora-blob" style={{ width: '34vw', height: '34vw', left: '30vw', bottom: '-18vw', background: glow(names[2]), opacity: 0.24, animation: 'drift3 38s ease-in-out infinite' }} />
        </>
      )}
      {style === 'mesh' && (
        <div
          className="absolute inset-0"
          style={{
            background: [
              `radial-gradient(at 12% 18%, ${c(names[0], 0.32)} 0px, transparent 55%)`,
              `radial-gradient(at 88% 12%, ${c(names[1], 0.22)} 0px, transparent 50%)`,
              `radial-gradient(at 70% 88%, ${c(names[2], 0.2)} 0px, transparent 55%)`,
              `radial-gradient(at 18% 92%, ${c('mint', 0.14)} 0px, transparent 50%)`
            ].join(', ')
          }}
        />
      )}
      {style === 'stars' && (
        <>
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 0%, ${c(names[0], 0.18)} 0%, transparent 60%)` }} />
          <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 0.6px, transparent 0.8px)', backgroundSize: '38px 38px' }} />
          <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 0.8px, transparent 1.1px)', backgroundSize: '91px 91px', backgroundPosition: '17px 29px', animation: 'twinkle 6s ease-in-out infinite' }} />
        </>
      )}
      {style !== 'solid' && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgb(var(--c-ink-900)/0.55)_70%,rgb(var(--c-ink-900)/0.9)_100%)]" />}
      {style === 'aurora' && (
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
      )}
    </div>
  )
}
