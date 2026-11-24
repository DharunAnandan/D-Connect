// Incoming / ongoing call: a floating card with a pulsing avatar, answer and decline.
import { AnimatePresence, motion } from 'framer-motion'
import { Bluetooth, Check, ChevronDown, Combine, Headphones, Laptop, Mic, MicOff, Pause, Phone, PhoneOff, Repeat, Smartphone, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CallState } from '@shared/protocol'
import { Avatar } from '@/components/ui'
import { call, dc } from '@/lib/api'
import { duration } from '@/lib/format'
import { sfx } from '@/lib/sfx'

export function CallCard() {
  const [c, setC] = useState<CallState>({ state: 'idle' })
  const [muted, setMuted] = useState(false)
  const [route, setRoute] = useState<'pc' | 'phone' | 'speaker' | null>(null)
  const [switching, setSwitching] = useState<'pc' | 'phone' | 'speaker' | null>(null)
  const [hint, setHint] = useState('')
  const [devs, setDevs] = useState<{ outputs: { name: string; label: string }[]; inputs: { name: string; label: string }[]; out: string | null; in: string | null } | null>(null)
  useEffect(() => {
    if (route !== 'pc') return
    const load = (): void => {
      call('callDevices').then(setDevs)
    }
    load()
    const t = setInterval(load, 4000) // a headset plugged in mid-call shows up
    return () => clearInterval(t)
  }, [route])
  const pick = (out: string | null, inp: string | null): void => {
    setDevs((d) => (d ? { ...d, out, in: inp } : d))
    call('setCallDevices', out, inp)
  }
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
    return dc.on('call.route', (r) => {
      setRoute(r)
      setSwitching(null)
    })
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

  const name = c.name || c.number || (c.state === 'ringing' ? 'Incoming call' : 'Ongoing call')
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
            {live && route === 'pc' && devs && (
              <div className="no-drag relative mx-auto mt-4 flex w-full max-w-[310px] flex-col gap-2">
                <DevicePicker kind="out" value={devs.out} options={devs.outputs} onPick={(v) => pick(v, devs.in)} />
                <DevicePicker kind="in" value={devs.in} options={devs.inputs} onPick={(v) => pick(devs.out, v)} />
              </div>
            )}
            {live && (
              <div className="no-drag relative mx-auto mt-4 flex w-fit rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
                {(['pc', 'phone', 'speaker'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      if ((switching || route) === r) return
                      setSwitching(r) // highlight at once; the real route arrives when the phone has switched
                      call('setCallRoute', r)
                      setTimeout(() => setSwitching((x) => (x === r ? null : x)), 12000)
                    }}
                    className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${(switching || route) === r ? 'text-ink-950' : 'text-white/60 hover:text-white'}`}
                  >
                    {(switching || route) === r && <motion.span layoutId="route" transition={{ type: 'spring', stiffness: 500, damping: 34 }} className={`absolute inset-0 rounded-full ${switching === r ? 'animate-pulse bg-mint/70' : 'bg-mint'}`} />}
                    <span className="relative flex items-center gap-1.5">{r === 'pc' ? <Laptop size={13} /> : r === 'phone' ? <Smartphone size={13} /> : <Volume2 size={13} />}{r === 'pc' ? 'This PC' : r === 'phone' ? 'Receiver' : 'Speaker'}</span>
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

// A glass pill that opens an animated list of speakers / microphones.
function DevicePicker({ kind, value, options, onPick }: { kind: 'out' | 'in'; value: string | null; options: { name: string; label: string }[]; onPick: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const all = [{ name: '', label: kind === 'out' ? 'Default speaker' : 'Default microphone' }, ...options]
  const current = all.find((o) => o.name === (value || '')) || all[0]
  const iconFor = (label: string, name: string) => {
    if (/bluez|bluetooth|buds|airpods|headset|wh-|jbl|noise|realme|oneplus/i.test(name + label)) return Bluetooth
    if (/usb|headphone|head/i.test(name + label)) return Headphones
    return kind === 'out' ? Volume2 : Mic
  }
  const CurIcon = iconFor(current.label, current.name)
  return (
    <div className="relative">
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left ring-1 transition-colors ${open ? 'bg-white/[0.12] ring-cyan/40' : 'bg-white/[0.06] ring-white/10 hover:bg-white/[0.09]'}`}
      >
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl ${kind === 'out' ? 'bg-[linear-gradient(135deg,#7c5cff,#35e0ff)]' : 'bg-[linear-gradient(135deg,#3ddc97,#35e0ff)]'} text-ink-950`}>
          <CurIcon size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9.5px] font-semibold uppercase tracking-widest text-white/40">{kind === 'out' ? 'Speaker' : 'Microphone'}</span>
          <span className="block truncate text-[12.5px] font-medium text-white/90">{current.label}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-white/50">
          <ChevronDown size={15} />
        </motion.span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            className="glass-strong absolute left-0 right-0 top-full z-30 mt-1.5 max-h-48 overflow-y-auto rounded-2xl p-1.5"
          >
            {all.map((o) => {
              const I = iconFor(o.label, o.name)
              const sel = o.name === (value || '')
              return (
                <button
                  key={o.name || 'default'}
                  onClick={() => {
                    onPick(o.name || null)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12.5px] transition-colors ${sel ? 'bg-white/[0.1] text-white' : 'text-white/75 hover:bg-white/[0.06] hover:text-white'}`}
                >
                  <I size={14} className={sel ? 'text-cyan-soft' : 'text-white/45'} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {sel && <Check size={14} className="text-mint" />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
