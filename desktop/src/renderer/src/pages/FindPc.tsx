// "Find my PC" from the phone: the window comes forward, glows and chimes until dismissed.
import { AnimatePresence, motion } from 'framer-motion'
import { MonitorSmartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { dc } from '@/lib/api'
import { sfx } from '@/lib/sfx'

export function FindPcOverlay() {
  const [on, setOn] = useState(false)
  useEffect(() => dc.on('findpc', (v: boolean) => setOn(v)), [])
  useEffect(() => {
    if (!on) return
    sfx.ring()
    const t = setInterval(() => sfx.ring(), 1500)
    const stop = setTimeout(() => setOn(false), 30000)
    return () => {
      clearInterval(t)
      clearTimeout(stop)
    }
  }, [on])
  return (
    <AnimatePresence>
      {on && (
        <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/94" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="text-center">
            <div className="relative mx-auto grid h-40 w-40 place-items-center">
              {[0, 1, 2].map((i) => <motion.span key={i} className="absolute inset-0 rounded-full border-2 border-cyan" initial={{ scale: 0.5, opacity: 1 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5 }} />)}
              <div className="grid h-28 w-28 place-items-center rounded-full bg-[linear-gradient(135deg,rgb(var(--c-violet)),rgb(var(--c-cyan)))] text-ink-950"><MonitorSmartphone size={44} /></div>
            </div>
            <h2 className="mt-8 text-3xl font-bold">Here I am!</h2>
            <p className="mt-2 text-muted">Your phone is looking for this PC.</p>
            <Button className="mt-6" variant="primary" onClick={() => setOn(false)}>Found it</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
