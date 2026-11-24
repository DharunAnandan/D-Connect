// One phone app in its own laptop window. Video from the app's virtual display on the phone,
// mouse/keyboard sent back as touches and keys.
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, Circle, Loader2, Minus, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { call, dc } from '@/lib/api'
import { StreamDecoder } from '@/lib/h264'

export function AppWindow() {
  const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id') || ''
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<{ state: 'starting' | 'on' | 'ended'; label?: string; message?: string }>({ state: 'starting' })
  const [label, setLabel] = useState('')

  useEffect(() => {
    call('appwinInfo', id).then((i) => {
      if (!i) return
      setLabel(i.label)
      if (i.state === 'on') setState({ state: 'on', label: i.label })
    })
    const dec = new StreamDecoder(() => canvas.current)
    const offV = dc.onAppVideo((h, p) => dec.push(h, p))
    const offS = dc.on('appwin.state', (s) => {
      setState(s)
      if (s.label) setLabel(s.label)
    })
    return () => {
      offV()
      offS()
      dec.close()
    }
  }, [id])

  // the picture is scaled to fit (object-contain): map the pointer into the picture itself
  const pos = (e: React.PointerEvent | React.WheelEvent): { x: number; y: number } => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    const scale = Math.min(r.width / (c.width || 1), r.height / (c.height || 1))
    const w = (c.width || 1) * scale
    const h = (c.height || 1) * scale
    const left = r.left + (r.width - w) / 2
    const top = r.top + (r.height - h) / 2
    return { x: Math.min(1, Math.max(0, (e.clientX - left) / w)), y: Math.min(1, Math.max(0, (e.clientY - top) / h)) }
  }
  const down = useRef(false)
  const last = useRef(0)
  const input = (m: any): void => {
    call('appwinInput', id, m)
  }
  const onPointer = (action: 'down' | 'move' | 'up') => (e: React.PointerEvent) => {
    if (e.button === 2 && action === 'down') return input({ t: 'key', key: 'back' })
    if (action === 'down') {
      down.current = true
      canvas.current!.setPointerCapture(e.pointerId)
      canvas.current!.focus()
    }
    if (action === 'move') {
      if (!down.current) return
      const now = performance.now()
      if (now - last.current < 10) return
      last.current = now
    }
    if (action === 'up') down.current = false
    input({ t: 'touch', action, ...pos(e) })
  }
  const onKey = (e: React.KeyboardEvent): void => {
    const map: Record<string, string> = { Enter: 'enter', Backspace: 'backspace', Delete: 'del', Tab: 'tab', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Escape: 'back' }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      navigator.clipboard.readText().then((t) => t && input({ t: 'text', text: t }))
      e.preventDefault()
      return
    }
    if (map[e.key]) {
      e.preventDefault()
      return input({ t: 'key', key: map[e.key] })
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      input({ t: 'text', text: e.key })
    }
  }

  return (
    <div className="flex h-screen flex-col bg-ink-950 text-white">
      <div className="drag flex h-10 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-ink-900 px-2">
        <div className="no-drag flex items-center">
          {[
            { I: ChevronLeft, k: 'back', t: 'Back' },
            { I: Circle, k: 'home', t: 'Home' },
            { I: Square, k: 'recents', t: 'Recent apps' }
          ].map(({ I, k, t }) => (
            <button key={k} title={t} onClick={() => input({ t: 'key', key: k })} className="grid h-7 w-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white">
              <I size={k === 'back' ? 16 : 12} />
            </button>
          ))}
        </div>
        <div className="flex-1 truncate text-center text-[12.5px] font-semibold text-white/80">{label || 'Phone app'}</div>
        <div className="no-drag flex items-center">
          {(['s', 'm', 'l'] as const).map((z) => (
            <button key={z} title={{ s: 'Small', m: 'Medium', l: 'Large' }[z]} onClick={() => call('appwinSize', id, z)} className="grid h-7 w-6 place-items-center rounded-lg text-[10px] font-bold uppercase text-white/45 hover:bg-white/10 hover:text-white">
              {z}
            </button>
          ))}
          <button title="Minimize" onClick={() => call('appwinMinimize', id)} className="grid h-7 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white">
            <Minus size={14} />
          </button>
          <button title="Close" onClick={() => call('appwinClose', id)} className="grid h-7 w-8 place-items-center rounded-lg text-white/50 hover:bg-rose/80 hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <canvas
          ref={canvas}
          tabIndex={0}
          onPointerDown={onPointer('down')}
          onPointerMove={onPointer('move')}
          onPointerUp={onPointer('up')}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => input({ t: 'scroll', ...pos(e), dy: e.deltaY })}
          onKeyDown={onKey}
          className="absolute inset-0 h-full w-full cursor-default object-contain outline-none"
        />
        <AnimatePresence>
          {state.state !== 'on' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-ink-950/90 text-center">
              <div className="px-8">
                {state.state === 'starting' ? <Loader2 size={30} className="mx-auto mb-3 animate-spin text-cyan" /> : null}
                <div className="text-sm text-white/70">{state.state === 'starting' ? `Opening ${label || 'the app'}…` : state.message || 'The app window closed on the phone.'}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
