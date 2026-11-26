// The toast stack in the corner of the desktop: glass cards that slide in, stack, reply inline
// and leave with a blur. The window lets clicks through except over a toast.
import { AnimatePresence, motion } from 'framer-motion'
import { Battery, Bell, FileDown, Info, Link2, MessageSquare, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { call, dc } from '@/lib/api'
import { sfx } from '@/lib/sfx'

interface T {
  image?: string // a picture in the message
  id: string
  kind: string
  title: string
  body?: string
  icon?: string
  app?: string
  reply?: any
  actions?: { id: string; label: string }[]
  ttl?: number
  time: number
}

const KIND: Record<string, { icon: any; grad: string }> = {
  notification: { icon: Bell, grad: 'from-violet to-cyan' },
  sms: { icon: MessageSquare, grad: 'from-cyan to-mint' },
  file: { icon: FileDown, grad: 'from-violet to-pink' },
  battery: { icon: Battery, grad: 'from-amber to-pink' },
  link: { icon: Link2, grad: 'from-pink to-violet' },
  clip: { icon: Link2, grad: 'from-cyan to-violet' },
  info: { icon: Info, grad: 'from-mint to-cyan' }
}

export function ToastHost() {
  const [toasts, setToasts] = useState<T[]>([])
  const [replying, setReplying] = useState<string | null>(null)
  const [hover, setHover] = useState(false)
  const timers = useRef(new Map<string, number>())
  const stack = useRef<HTMLDivElement>(null)
  // Linux: the window is sized to exactly the toasts (no click-through there), so tell main
  useEffect(() => {
    const el = stack.current
    if (!el) return
    const ro = new ResizeObserver(() => call('toastSize', toasts.length ? el.scrollHeight : 0))
    ro.observe(el)
    call('toastSize', toasts.length ? el.scrollHeight : 0)
    return () => ro.disconnect()
  }, [toasts.length])

  const remove = (id: string): void => {
    setToasts((x) => x.filter((t) => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }
  const schedule = (t: T): void => {
    clearTimeout(timers.current.get(t.id))
    timers.current.set(t.id, window.setTimeout(() => remove(t.id), t.ttl || (t.reply ? 12000 : 7000)))
  }

  useEffect(
    () =>
      dc.on('toast', (t: T) => {
        sfx.notify()
        setToasts((x) => [t, ...x.filter((y) => y.id !== t.id)].slice(0, 4))
        schedule(t)
      }),
    []
  )
  // pause the clocks while the pointer is over the stack
  useEffect(() => {
    if (hover || replying) for (const id of timers.current.keys()) clearTimeout(timers.current.get(id))
    else for (const t of toasts) schedule(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, replying])
  useEffect(() => {
    if (toasts.length === 0) {
      call('toastHover', false)
      const t = setTimeout(() => call('toastsEmpty'), 600)
      return () => clearTimeout(t)
    }
    return undefined
  }, [toasts.length])

  // each app icon's main colour, worked out once per icon
  const [colors, setColors] = useState<Record<string, string>>({})
  useEffect(() => {
    for (const t of toasts) {
      if (!t.icon || t.icon in colors) continue
      iconColor(t.icon).then((c) => setColors((m) => ({ ...m, [t.icon!]: c || '' })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts])

  return (
    <div className="flex h-screen flex-col justify-end overflow-hidden">
    <div ref={stack} className="flex flex-col-reverse items-end gap-2.5 p-3">
      <AnimatePresence initial={false}>
        {toasts.map((t, i) => {
          const k = KIND[t.kind] || KIND.info
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 80, scale: 0.92, filter: 'blur(8px)' }}
              animate={{ opacity: 1, x: 0, scale: 1 - i * 0.015, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 60, scale: 0.94, filter: 'blur(6px)', transition: { duration: 0.22 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onMouseEnter={() => {
                setHover(true)
                call('toastHover', true)
              }}
              onMouseLeave={() => {
                setHover(false)
                if (!replying) call('toastHover', false)
              }}
              className="group relative w-[390px] overflow-hidden rounded-[22px] p-4 text-white"
              style={tint(colors[t.icon || ''])}
            >
              {/* the app's own colour, glossy: tint, top highlight, a shine that sweeps once */}
              {colors[t.icon || ''] && (
                <>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[22px] bg-gradient-to-b from-white/[0.22] via-white/[0.06] to-transparent" />
                  <motion.div className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent" initial={{ left: '-40%' }} animate={{ left: '130%' }} transition={{ duration: 1.1, delay: 0.25, ease: 'easeOut' }} />
                </>
              )}
              <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${colors[t.icon || ''] ? '' : k.grad}`} style={colors[t.icon || ''] ? { background: `rgb(${colors[t.icon || '']})` } : undefined} />
              <div className="relative flex gap-3">
                {t.icon ? (
                  <img src={t.icon} className="h-10 w-10 shrink-0 rounded-xl bg-white/10 p-1.5" style={colors[t.icon] ? { boxShadow: `0 0 18px -2px rgba(${colors[t.icon]},0.75)`, background: `rgba(${colors[t.icon]},0.18)` } : undefined} />
                ) : (
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${k.grad} text-ink-950`}>
                    <k.icon size={18} />
                  </div>
                )}
                <button className="min-w-0 flex-1 text-left" onClick={() => { call('toastOpen', t); remove(t.id) }}>
                  {t.app && <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/45">{t.app}</div>}
                  <div className="truncate text-[14px] font-semibold">{t.title}</div>
                  {t.body && <div className="line-clamp-3 whitespace-pre-line text-[13px] leading-snug text-white/70">{t.body}</div>}
                  {t.image && <img src={t.image} className="mt-2 max-h-36 max-w-full rounded-xl object-cover ring-1 ring-white/10" />}
                </button>
                <button onClick={() => remove(t.id)} title="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white">
                  <X size={14} />
                </button>
              </div>
              {(!!t.reply || !!t.actions?.length) && (
                <div className="mt-3 flex gap-2 pl-[52px]">
                  {t.reply && replying !== t.id && (
                    <button onClick={() => { setReplying(t.id); call('toastFocus') }} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">Reply</button>
                  )}
                  {t.actions?.map((a) => (
                    <button key={a.id} onClick={() => { call('toastAction', a.id); remove(t.id) }} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/12">
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
              <AnimatePresence>
                {replying === t.id && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-[52px]"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const v = (e.currentTarget.elements.namedItem('r') as HTMLInputElement).value.trim()
                      if (!v) return
                      call('toastReply', t, v)
                      sfx.sent()
                      setReplying(null)
                      remove(t.id)
                    }}
                  >
                    <div className="mt-2 flex gap-2">
                      <input name="r" autoFocus placeholder="Reply…" className="field py-2" onKeyDown={(e) => e.key === 'Escape' && setReplying(null)} />
                      <button className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,rgb(var(--c-violet)),rgb(var(--c-cyan)))] text-ink-950"><Send size={15} /></button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
    </div>
  )
}

// the most colourful average of an icon (skips transparent, near-white and near-black pixels)
function iconColor(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 24
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0, 24, 24)
        const d = g.getImageData(0, 0, 24, 24).data
        let r = 0, gr = 0, b = 0, w = 0
        for (let i = 0; i < d.length; i += 4) {
          const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]]
          if (A < 128) continue
          const max = Math.max(R, G, B), min = Math.min(R, G, B)
          if (max < 40 || (min > 215 && max - min < 25)) continue // black / white
          const sat = (max - min) / max
          const wt = 0.15 + sat * sat * 4 // favour the colourful parts
          r += R * wt; gr += G * wt; b += B * wt; w += wt
        }
        if (!w) return resolve(null)
        resolve(`${Math.round(r / w)},${Math.round(gr / w)},${Math.round(b / w)}`)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// A solid dark card (the desktop behind must never show through: Linux can't blur behind a
// pop-up window), tinted with the app's colour when there is one.
const BASE = '#0d1124'
function tint(rgb?: string): React.CSSProperties {
  if (!rgb)
    return {
      background: `linear-gradient(135deg, rgb(var(--c-violet)/0.16) 0%, rgb(var(--c-cyan)/0.06) 55%, rgba(0,0,0,0) 100%), ${BASE}`,
      boxShadow: '0 18px 50px -14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(255,255,255,0.08)'
    }
  return {
    background: `linear-gradient(135deg, rgba(${rgb},0.38) 0%, rgba(${rgb},0.14) 50%, rgba(${rgb},0.04) 100%), ${BASE}`,
    boxShadow: `0 18px 50px -14px rgba(${rgb},0.55), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(${rgb},0.35)`
  }
}
