// Incoming / ongoing call: a floating card with a pulsing avatar, answer and decline.
import { AnimatePresence, motion } from 'framer-motion'
import { Bluetooth, Check, ChevronDown, Combine, Headphones, Laptop, Maximize2, Mic, MicOff, Minimize2, Pause, Phone, PhoneOff, Play, Repeat, Search, Smartphone, UserPlus, Volume2 } from 'lucide-react'
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
  const [compact, setCompact] = useState(false)
  const setSize = (on: boolean): void => {
    setCompact(on)
    call('callCompact', on)
  }
  useEffect(() => {
    if (c.state === 'idle' || c.state === 'ringing') setCompact(false) // ringing always shows in full
  }, [c.state])
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
  useEffect(() => {
    if (c.state === 'idle') {
      setMuted(false)
      setAdding(false)
    }
  }, [c.state])
  const control = async (action: 'hold' | 'swap' | 'merge'): Promise<void> => {
    setHint('')
    const r = await call<{ ok: boolean }>('callControl', action)
    if (!r?.ok) setHint('Turn on Screen control on the phone (Settings → Screen control) to hold, swap and merge from here.')
  }
  useEffect(() => dc.on('call.hint', (h: string) => setHint(h)), [])
  // every call the phone has going: the one in front, others on hold, one waiting
  const lines = c.calls || []
  const inCall = lines.filter((l) => l.status !== 'ringing')
  // the call in front is the main card; the rest (on hold, or in a conference) get a row each
  const front = inCall.findIndex((l) => l.number === c.number && (c.held ? l.status === 'held' : l.status !== 'held'))
  const others = inCall.filter((_, i) => i !== (front < 0 ? 0 : front))
  const conference = inCall.length > 1 && inCall.every((l) => l.conference)
  const twoCalls = inCall.length > 1 && !conference
  const waitingCall = c.waitingCall || null
  const [adding, setAdding] = useState(false)
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
    if (c.state !== 'ringing' && !c.waitingCall) return
    sfx.ring()
    const t = setInterval(() => sfx.ring(), 2600)
    return () => clearInterval(t)
  }, [c.state, !!c.waitingCall])
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const name = conference ? `Conference · ${inCall.map((l) => (l.name || l.number || '').split(' ')[0]).join(', ')}` : c.name || c.number || (c.state === 'ringing' ? 'Incoming call' : 'Ongoing call')
  const live = c.state === 'offhook' || c.state === 'dialing'
  if (compact && live) {
    return (
      <div className="flex h-screen items-start p-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-strong drag flex w-full items-center gap-2.5 rounded-[22px] py-2 pl-2 pr-2 text-white"
        >
          <Avatar name={name} src={c.photo ? `data:image/jpeg;base64,${c.photo}` : undefined} size={40} />
          <button className="no-drag min-w-0 flex-1 text-left" onClick={() => setSize(false)} title="Show the full call card">
            <div className="truncate text-[13px] font-semibold">{name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-mint">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />
              {c.since ? duration((Date.now() - c.since) / 1000) : 'On call'}
              {route === 'pc' ? ' · on this PC' : route === 'speaker' ? ' · phone speaker' : ''}
            </div>
          </button>
          <button title={muted ? 'Unmute' : 'Mute'} onClick={() => { setMuted(!muted); call('callMute', !muted) }} className={`no-drag grid h-9 w-9 place-items-center rounded-full ${muted ? 'bg-rose text-white' : 'bg-white/10 hover:bg-white/15'}`}>
            {muted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button title="End call" onClick={() => call('callEnd')} className="no-drag grid h-9 w-9 place-items-center rounded-full bg-rose">
            <PhoneOff size={16} />
          </button>
          <button title="Expand" onClick={() => setSize(false)} className="no-drag grid h-9 w-7 place-items-center rounded-full text-white/60 hover:text-white">
            <Maximize2 size={14} />
          </button>
        </motion.div>
      </div>
    )
  }

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
            {live && (
              <button title="Minimise" onClick={() => setSize(true)} className="no-drag absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white">
                <Minimize2 size={14} />
              </button>
            )}
            <div className="absolute -left-10 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(61,220,151,0.25)_0%,transparent_70%)]" />
            <AnimatePresence>
              {waitingCall && (
                <motion.div key="waiting" initial={{ opacity: 0, y: -12, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -12, height: 0 }} className="no-drag relative -mt-3 mb-4 overflow-hidden">
                  <div className="flex items-center gap-3 rounded-2xl bg-mint/10 p-3 text-left ring-1 ring-mint/30">
                    <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                      <Avatar name={waitingCall.name || waitingCall.number || '?'} size={40} />
                    </motion.div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mint">Call waiting</div>
                      <div className="truncate text-sm font-semibold">{waitingCall.name || waitingCall.number || 'Unknown'}</div>
                      <div className="truncate text-[11px] text-white/50">Answer puts {c.name || c.number || 'this call'} on hold</div>
                    </div>
                    <button title="Decline" onClick={() => call('callReject')} className="grid h-10 w-10 place-items-center rounded-full bg-rose"><PhoneOff size={17} /></button>
                    <button title="Answer and hold the current call" onClick={() => call('callAnswer')} className="grid h-10 w-10 place-items-center rounded-full bg-mint text-ink-950"><Phone size={17} fill="currentColor" /></button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="absolute -bottom-16 -right-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.30)_0%,transparent_70%)]" />
            <div className="relative mx-auto grid h-32 w-32 place-items-center">
              {c.state === 'ringing' && [0, 1, 2].map((i) => <motion.span key={i} className="absolute inset-2 rounded-full border-2 border-mint/70" initial={{ scale: 0.8, opacity: 0.9 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6 }} />)}
              <motion.div animate={c.state === 'ringing' ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 1.2, repeat: Infinity }}>
                <Avatar name={name} src={c.photo ? `data:image/jpeg;base64,${c.photo}` : undefined} size={96} />
              </motion.div>
            </div>
            <div className="relative mt-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-mint">{c.state === 'ringing' ? (c.waiting ? 'Call waiting' : 'Incoming call') : c.state === 'dialing' ? 'Calling…' : c.held ? 'On hold' : conference ? 'Conference call' : 'On call'}</div>
            <div className="relative mt-1 truncate text-2xl font-bold">{name}</div>
            {c.name && c.number && <div className="relative text-sm text-white/55">{c.number}</div>}
            {live && c.since && <div className="relative mt-1 text-sm tabular-nums text-white/70">{duration((Date.now() - c.since) / 1000)}</div>}
            {c.state === 'ringing' && c.waiting && <div className="relative mt-2 text-xs text-white/60">Answering puts your current call on hold</div>}
            {live && others.length > 0 && (
              <div className="no-drag relative mx-auto mt-4 w-full max-w-[310px] space-y-1.5">
                {others.map((l, i) => (
                  <div key={(l.number || '') + i} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.05] px-3 py-2 text-left ring-1 ring-white/10">
                    <Avatar name={l.name || l.number || '?'} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{l.name || l.number || 'Call'}</div>
                      <div className={`text-[10.5px] font-semibold ${l.status === 'held' ? 'text-amber' : 'text-mint'}`}>{l.status === 'held' ? 'On hold' : l.conference ? 'In the conference' : 'On call'}</div>
                    </div>
                    {l.status === 'held' && <button onClick={() => control('swap')} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/15">Switch to</button>}
                  </div>
                ))}
              </div>
            )}
            {live && (
              <div className="no-drag relative mx-auto mt-4 flex flex-wrap justify-center gap-2">
                {[
                  { a: 'hold' as const, I: c.held ? Play : Pause, label: c.held ? 'Resume' : 'Hold', show: !twoCalls },
                  { a: 'swap' as const, I: Repeat, label: 'Swap', show: twoCalls },
                  { a: 'merge' as const, I: Combine, label: 'Merge', show: twoCalls }
                ].filter((b) => b.show).map(({ a, I, label }) => (
                  <button key={a} onClick={() => control(a)} className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/10 hover:bg-white/[0.12]">
                    <I size={13} /> {label}
                  </button>
                ))}
                {!waitingCall && (
                  <button onClick={() => setAdding(!adding)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${adding ? 'bg-white text-ink-950 ring-white' : 'bg-white/[0.07] text-white/80 ring-white/10 hover:bg-white/[0.12]'}`}>
                    <UserPlus size={13} /> Add call
                  </button>
                )}
              </div>
            )}
            <AnimatePresence>{live && adding && <AddCall onDone={() => setAdding(false)} />}</AnimatePresence>
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
                <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.88 }} animate={{ rotate: [0, -14, 14, -14, 14, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.8 }} title={c.waiting ? 'Answer and hold the current call' : 'Answer'} onClick={() => call('callAnswer')} className="grid h-16 w-16 place-items-center rounded-full bg-mint text-ink-950 shadow-[0_10px_30px_-6px_rgba(61,220,151,0.9)]">
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

// "Add call": type a number or find a contact; the current call goes on hold while it rings.
function AddCall({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState<{ name: string; number: string }[]>([])
  useEffect(() => {
    call<{ items: { name: string; number: string }[] }>('contacts', '').then((r) => setAll(r?.items || [])).catch(() => {})
  }, [])
  const needle = q.trim().toLowerCase()
  const digits = needle.replace(/[^\d]/g, '')
  const hits = needle ? all.filter((c) => c.name.toLowerCase().includes(needle) || (digits.length >= 2 && c.number.replace(/\D/g, '').includes(digits))).slice(0, 5) : []
  const dial = (n: string): void => {
    const num = n.replace(/[^\d+*#]/g, '')
    if (!num) return
    call('callDial', num)
    onDone()
  }
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="no-drag relative mx-auto mt-3 w-full max-w-[310px] overflow-hidden text-left">
      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.07] px-3 py-2 ring-1 ring-white/10 focus-within:ring-cyan/50">
        <Search size={14} className="text-white/40" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') dial(hits[0] && !/^[\d+*# ]+$/.test(q) ? hits[0].number : q); if (e.key === 'Escape') onDone() }} placeholder="Name or number" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-white/35" />
        {/^[\d+*# ]{3,}$/.test(q) && <button onClick={() => dial(q)} className="grid h-7 w-7 place-items-center rounded-full bg-mint text-ink-950"><Phone size={13} fill="currentColor" /></button>}
      </div>
      {hits.map((h) => (
        <button key={h.name + h.number} onClick={() => dial(h.number)} className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/[0.06]">
          <Avatar name={h.name} size={28} />
          <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-semibold">{h.name}</span><span className="block truncate text-[10.5px] text-white/45">{h.number}</span></span>
          <Phone size={13} className="text-mint" />
        </button>
      ))}
      <div className="mt-1.5 text-center text-[10.5px] text-white/40">Your current call goes on hold while the new one rings</div>
    </motion.div>
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
