// Incoming / ongoing call: a floating card with a pulsing avatar, answer and decline.
import { AnimatePresence, motion } from 'framer-motion'
import { Combine, Laptop, Mic, MicOff, Pause, Phone, PhoneOff, Repeat, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CallState } from '@shared/protocol'
import { Avatar } from '@/components/ui'
import { call, dc } from '@/lib/api'
import { duration } from '@/lib/format'
import { sfx } from '@/lib/sfx'

export function CallCard() {
  const [c, setC] = useState<CallState>({ state: 'idle' })
  const [muted, setMuted] = useState(false)
  const [route, setRoute] = useState<'pc' | 'phone' | null>(null)
  const [hint, setHint] = useState('')
  const [twoCalls, setTwoCalls] = useState(false)
  useEffect(() => {
    if (c.state === 'idle') {
      setTwoCalls(false)
      setMuted(false)
    }
  }, [c.state])
  const control = async (action: 'hold' | 'swap' | 'merge'): Promise<void> => {
    const r = await call<{ ok: boolean }>('callControl', action)
    setHint(r?.ok ? '' : 'Turn on Screen control on the phone (Settings → Screen control) to hold, swap and merge from here.')
  }
  useEffect(() => {
    call('callRoute').then(setRoute)
    return dc.on('call.route', setRoute)
  }, [])
  const [, tick] = useState(0)
  useEffect(() => {
    call('lastCall').then(setC)
    return dc.on('call', setC)
  }, [])
  useEffect(() => {
    if (c.state !== 'ringing') return
    sfx.ring()
    const t = setInterval(() => sfx.ring(), 2600)
    return () => clearInterval(t)
  }, [c.state])
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const name = c.name || c.number || 'Unknown'
  const live = c.state === 'offhook' || c.state === 'dialing'
  return (
    <div className="flex h-screen items-start justify-center p-4">
      <AnimatePresence>
        {c.state !== 'idle' && (
          <motion.div
            key="card"
            initial={{ opacity: 0, y: -40, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -30, scale: 0.92, filter: 'blur(8px)' }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="glass-strong drag relative w-full overflow-hidden rounded-[30px] px-6 pb-7 pt-8 text-center text-white"
          >
            <div className="absolute -left-10 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(61,220,151,0.25)_0%,transparent_70%)]" />
            <div className="absolute -bottom-16 -right-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.30)_0%,transparent_70%)]" />
            <div className="relative mx-auto grid h-32 w-32 place-items-center">
              {c.state === 'ringing' && [0, 1, 2].map((i) => <motion.span key={i} className="absolute inset-2 rounded-full border-2 border-mint/70" initial={{ scale: 0.8, opacity: 0.9 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6 }} />)}
              <motion.div animate={c.state === 'ringing' ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 1.2, repeat: Infinity }}>
                <Avatar name={name} src={c.photo ? `data:image/jpeg;base64,${c.photo}` : undefined} size={96} />
              </motion.div>
            </div>
            <div className="relative mt-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-mint">{c.state === 'ringing' ? (c.waiting ? 'Call waiting' : 'Incoming call') : c.state === 'dialing' ? 'Calling…' : 'On call'}</div>
            <div className="relative mt-1 truncate text-2xl font-bold">{name}</div>
            {c.name && c.number && <div className="relative text-sm text-white/55">{c.number}</div>}
            {live && c.since && <div className="relative mt-1 text-sm tabular-nums text-white/70">{duration((Date.now() - c.since) / 1000)}</div>}
            {c.state === 'ringing' && c.waiting && <div className="relative mt-2 text-xs text-white/60">Answering puts your current call on hold</div>}
            {live && (
              <div className="no-drag relative mx-auto mt-4 flex justify-center gap-2">
                {[{ a: 'hold' as const, I: Pause, label: 'Hold' }, ...(twoCalls ? [{ a: 'swap' as const, I: Repeat, label: 'Swap' }, { a: 'merge' as const, I: Combine, label: 'Merge' }] : [])].map(({ a, I, label }) => (
                  <button key={a} onClick={() => control(a)} className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/10 hover:bg-white/[0.12]">
                    <I size={13} /> {label}
                  </button>
                ))}
              </div>
            )}
            {hint && <div className="relative mt-2 text-[11px] text-amber">{hint}</div>}
            {live && (
              <div className="no-drag relative mx-auto mt-4 flex w-fit rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
                {(['pc', 'phone'] as const).map((r) => (
                  <button key={r} onClick={() => call('setCallRoute', r)} className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${route === r ? 'text-ink-950' : 'text-white/60 hover:text-white'}`}>
                    {route === r && <motion.span layoutId="route" transition={{ type: 'spring', stiffness: 500, damping: 34 }} className="absolute inset-0 rounded-full bg-mint" />}
                    <span className="relative flex items-center gap-1.5">{r === 'pc' ? <Laptop size={13} /> : <Smartphone size={13} />}{r === 'pc' ? 'On this PC' : 'On phone'}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="no-drag relative mt-7 flex items-center justify-center gap-8">
              {live && (
                <div className="flex flex-col items-center gap-1.5">
                  <motion.button whileTap={{ scale: 0.88 }} title={muted ? 'Unmute' : 'Mute'} onClick={() => { setMuted(!muted); call('callMute', !muted) }} className={`grid h-14 w-14 place-items-center rounded-full transition-colors ${muted ? 'bg-rose text-white shadow-[0_0_24px_rgba(248,113,113,0.6)]' : 'bg-white/10 hover:bg-white/15'}`}>
                    {muted ? <MicOff size={22} /> : <Mic size={22} />}
                  </motion.button>
                  <span className={`text-[11px] font-semibold ${muted ? 'text-rose' : 'text-white/55'}`}>{muted ? 'Muted' : 'Mute'}</span>
                </div>
              )}
              <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.88 }} onClick={() => call(c.state === 'ringing' ? 'callReject' : 'callEnd')} className="grid h-16 w-16 place-items-center rounded-full bg-rose shadow-[0_10px_30px_-6px_rgba(248,113,113,0.9)]">
                <PhoneOff size={26} />
              </motion.button>
              {c.state === 'ringing' && (
                <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.88 }} animate={{ rotate: [0, -14, 14, -14, 14, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.8 }} title={c.waiting ? 'Answer and hold the current call' : 'Answer'} onClick={() => { if (c.waiting) setTwoCalls(true); call('callAnswer') }} className="grid h-16 w-16 place-items-center rounded-full bg-mint text-ink-950 shadow-[0_10px_30px_-6px_rgba(61,220,151,0.9)]">
                  <Phone size={26} fill="currentColor" />
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
