// The toast stack in the corner of the desktop: glass cards that slide in, stack, reply inline
// and leave with a blur. The window lets clicks through except over a toast.
import { AnimatePresence, motion } from 'framer-motion'
import { Battery, Bell, FileDown, Info, Link2, MessageSquare, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { call, dc } from '@/lib/api'
import { sfx } from '@/lib/sfx'

interface T {
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
              animate={{ opacity: 1 - i * 0.08, x: 0, scale: 1 - i * 0.015, filter: 'blur(0px)' }}
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
              className="glass-strong group relative w-[390px] overflow-hidden rounded-[22px] p-4 text-white"
            >
              <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${k.grad}`} />
              <div className="flex gap-3">
                {t.icon ? (
                  <img src={t.icon} className="h-10 w-10 shrink-0 rounded-xl bg-white/10 p-1.5" />
                ) : (
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${k.grad} text-ink-950`}>
                    <k.icon size={18} />
                  </div>
                )}
                <button className="min-w-0 flex-1 text-left" onClick={() => { call('toastOpen', t); remove(t.id) }}>
                  {t.app && <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/45">{t.app}</div>}
                  <div className="truncate text-[14px] font-semibold">{t.title}</div>
                  {t.body && <div className="line-clamp-3 text-[13px] leading-snug text-white/70">{t.body}</div>}
                </button>
                <button onClick={() => remove(t.id)} title="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white">
                  <X size={14} />
                </button>
              </div>
              {(t.reply || t.actions?.length) && (
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
                      <button className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#7c5cff,#35e0ff)] text-ink-950"><Send size={15} /></button>
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
