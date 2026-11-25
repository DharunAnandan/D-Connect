// Clipboard history, kept apart by where it was copied: this PC or the phone. Click an item to
// copy it on this PC; the phone button puts it on the phone's clipboard instead.
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ClipboardList, Copy, Laptop, Smartphone, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { call, useLive } from '@/lib/api'
import { ago } from '@/lib/format'
import { Card } from './ui'

interface ClipItem { text: string; from: 'pc' | 'phone'; time: number }

export function ClipboardCard() {
  const [items] = useLive<ClipItem[]>('clips', 'clips', [])
  const [tab, setTab] = useState<'pc' | 'phone'>('phone')
  const [done, setDone] = useState<string>('')
  const shown = items.filter((i) => i.from === tab)
  const flash = (key: string): void => {
    setDone(key)
    setTimeout(() => setDone((d) => (d === key ? '' : d)), 1200)
  }
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet/15 text-violet-soft"><ClipboardList size={18} /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Clipboard</div>
          <div className="text-xs text-muted">Click to copy here · phone icon to copy on the phone</div>
        </div>
        {items.length > 0 && (
          <button title="Clear the history" onClick={() => call('clipClear')} className="grid h-8 w-8 place-items-center rounded-full text-white/45 hover:bg-white/10 hover:text-white"><Trash2 size={14} /></button>
        )}
      </div>
      <div className="mb-2 flex rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
        {([
          { v: 'phone' as const, label: 'From phone', I: Smartphone },
          { v: 'pc' as const, label: 'From this PC', I: Laptop }
        ]).map(({ v, label, I }) => (
          <button key={v} onClick={() => setTab(v)} className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[11.5px] font-semibold transition-colors ${tab === v ? 'text-ink-950' : 'text-white/60 hover:text-white'}`}>
            {tab === v && <motion.span layoutId="clip-tab" className="absolute inset-0 rounded-full bg-white" transition={{ type: 'spring', stiffness: 500, damping: 34 }} />}
            <span className="relative flex items-center gap-1.5"><I size={12} /> {label} <span className="opacity-60">{items.filter((i) => i.from === v).length || ''}</span></span>
          </button>
        ))}
      </div>
      <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
        {shown.length === 0 && <div className="py-6 text-center text-xs text-white/40">{tab === 'phone' ? 'Nothing copied on the phone yet. Copy something there and open D-Connect, or use its Clipboard tile.' : 'Nothing copied on this PC yet.'}</div>}
        <AnimatePresence initial={false}>
          {shown.map((it) => {
            const key = it.from + it.time
            return (
              <motion.div key={key} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="group flex items-start gap-2 rounded-xl px-2.5 py-2 hover:bg-white/[0.05]">
                <button className="min-w-0 flex-1 text-left" title="Copy on this PC" onClick={() => { call('clipCopy', it.text); flash(key + 'pc') }}>
                  <div className="line-clamp-2 break-words text-[13px] text-white/85 [overflow-wrap:anywhere]">{it.text}</div>
                  <div className="mt-0.5 text-[10.5px] text-white/35">{done === key + 'pc' ? <span className="text-mint">Copied on this PC</span> : done === key + 'ph' ? <span className="text-mint">Copied on the phone</span> : ago(it.time)}</div>
                </button>
                <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                  <button title="Copy on this PC" onClick={() => { call('clipCopy', it.text); flash(key + 'pc') }} className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.07] hover:bg-white/15">{done === key + 'pc' ? <Check size={13} className="text-mint" /> : <Copy size={13} />}</button>
                  <button title="Copy on the phone" onClick={() => { call('clipToPhone', it.text); flash(key + 'ph') }} className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.07] hover:bg-white/15">{done === key + 'ph' ? <Check size={13} className="text-mint" /> : <Smartphone size={13} />}</button>
                  <button title="Remove" onClick={() => call('clipRemove', it.text, it.from)} className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.07] hover:bg-white/15"><X size={13} /></button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Card>
  )
}
