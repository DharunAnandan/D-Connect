import { motion } from 'framer-motion'
import { AppWindow, Globe, Music2, Smartphone, Speaker, Volume1, Volume2, VolumeX, X, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Card, Empty, PageHeader } from '@/components/ui'
import { call } from '@/lib/api'
import { list, spring } from '@/theme/motion'

interface MixerApp { id: string; name: string; icon?: string; volume: number; muted: boolean; phone?: boolean }
interface Mixer { supported: boolean; output: { name: string; label: string; volume: number; muted: boolean } | null; apps: MixerApp[] }

function useMixer() {
  const [mx, setMx] = useState<Mixer | null>(null)
  const dragging = useRef(0)
  useEffect(() => {
    const load = (): void => {
      if (Date.now() - dragging.current > 1500) call<Mixer>('mixer').then(setMx)
    }
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [])
  const set = (kind: 'output' | 'app', a: { id: string; phone?: boolean }, v: number): void => {
    dragging.current = Date.now()
    setMx((m) => m && (kind === 'output' ? { ...m, output: m.output && { ...m.output, volume: v } } : { ...m, apps: m.apps.map((x) => (x.id === a.id ? { ...x, volume: v } : x)) }))
    call('mixerSet', kind, a.id, v, a.phone)
  }
  const mute = (kind: 'output' | 'app', id: string, muted: boolean): void => {
    call<Mixer>('mixerMute', kind, id, muted).then(setMx)
  }
  return { mx, set, mute }
}

// Small mixer opened from the tray: this PC and every app, with sliders.
export function MiniMixer() {
  const { mx, set, mute } = useMixer()
  return (
    <div className="h-screen w-screen p-2">
      <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} className="glass-strong flex h-full flex-col overflow-hidden rounded-[22px] bg-ink-900/95 p-4 ring-1 ring-white/10">
        <div className="drag mb-3 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-[linear-gradient(135deg,#ff5ca8,#7c5cff)]"><Volume2 size={16} /></div>
          <div className="flex-1 text-sm font-semibold">Sound</div>
          <button onClick={() => call('mixerWindow', false)} className="no-drag grid h-7 w-7 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"><X size={15} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {mx?.output && (
            <div className="rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/[0.06]">
              <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold"><Speaker size={14} className="text-pink" /><span className="min-w-0 flex-1 truncate">This PC</span><Big v={mx.output.volume} muted={mx.output.muted} small /></div>
              <Boost value={mx.output.volume} muted={mx.output.muted} onChange={(v) => set('output', { id: '' }, v)} onMute={() => mute('output', '', !mx.output!.muted)} />
            </div>
          )}
          {mx?.apps.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/[0.05]">
              <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold"><span className={a.phone ? 'text-pink' : 'text-cyan'}><AppIcon a={a} /></span><span className="min-w-0 flex-1 truncate">{a.name}</span><Big v={a.volume} muted={a.muted} small /></div>
              <Boost value={a.volume} muted={a.muted} onChange={(v) => set('app', a, v)} onMute={() => mute('app', a.id, !a.muted)} />
            </div>
          ))}
          {mx && !mx.apps.length && <div className="py-4 text-center text-xs text-white/45">No app is playing sound right now.</div>}
        </div>
      </motion.div>
    </div>
  )
}

// Volume booster: this PC's speaker and each app playing sound, 0-300%.
export function Sound() {
  const { mx, set, mute } = useMixer()

  return (
    <motion.div variants={list} initial="initial" animate="animate" className="mx-auto w-full max-w-[1680px]">
      <PageHeader icon={Volume2} title="Sound" subtitle="Volume booster: turn this PC or any app up to 300%" />

      {mx && !mx.supported ? (
        <Empty icon={VolumeX} title="Not available here" body="The volume booster needs PulseAudio or PipeWire on Linux." />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card strong className="relative overflow-hidden p-6">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,92,168,0.22)_0%,transparent_70%)]" />
            <div className="relative mb-5 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,#ff5ca8,#7c5cff)] shadow-[0_8px_30px_-6px_rgba(255,92,168,0.6)]"><Speaker size={22} /></div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">This PC</div>
                <div className="truncate font-semibold">{mx?.output?.label || 'Speaker'}</div>
              </div>
              <Big v={mx?.output?.volume ?? 100} muted={mx?.output?.muted} />
            </div>
            {mx?.output && <Boost value={mx.output.volume} muted={mx.output.muted} onChange={(v) => set('output', { id: '' }, v)} onMute={() => mute('output', '', !mx.output!.muted)} />}
            <div className="relative mt-5 flex gap-2">
              {[100, 150, 200, 300].map((p) => (
                <button key={p} onClick={() => set('output', { id: '' }, p)} className={`flex-1 rounded-xl py-2 text-xs font-semibold ring-1 transition-colors ${mx?.output?.volume === p ? 'bg-white text-ink-950 ring-white' : 'bg-white/[0.05] text-white/70 ring-white/10 hover:bg-white/10'}`}>
                  {p === 100 ? 'Normal' : `${p}%`}
                </button>
              ))}
            </div>
            <p className="relative mt-4 text-[12px] leading-relaxed text-white/45">Above 100% the sound is amplified in software. Very loud settings can crackle on quiet laptop speakers. Ease back if they do.</p>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Zap size={16} className="text-amber" /> Apps playing now</div>
            {mx && mx.apps.length === 0 ? (
              <div className="py-10 text-center text-sm text-white/45">Nothing is playing. Start a video in Chrome or music on your phone and it shows up here.</div>
            ) : (
              <div className="space-y-3">
                {mx?.apps.map((a) => (
                  <motion.div key={a.id} layout transition={spring} className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]">
                    <div className="mb-3 flex items-center gap-3">
                      <div className={`grid h-9 w-9 place-items-center rounded-xl ${a.phone ? 'bg-pink/15 text-pink' : 'bg-cyan/15 text-cyan'}`}><AppIcon a={a} /></div>
                      <div className="min-w-0 flex-1 truncate text-sm font-semibold">{a.name}</div>
                      <Big v={a.volume} muted={a.muted} small />
                    </div>
                    <Boost value={a.volume} muted={a.muted} onChange={(v) => set('app', a, v)} onMute={() => mute('app', a.id, !a.muted)} />
                  </motion.div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </motion.div>
  )
}

function AppIcon({ a }: { a: MixerApp }) {
  if (a.phone) return <Smartphone size={17} />
  if (/chrom/i.test(a.name)) return <Globe size={17} />
  if (/spotify|music|rhythm/i.test(a.name)) return <Music2 size={17} />
  return <AppWindow size={17} />
}

function Big({ v, muted, small }: { v: number; muted?: boolean; small?: boolean }) {
  const boosted = v > 100 && !muted
  return (
    <div className={`tabular-nums font-semibold ${small ? 'text-sm' : 'text-2xl'} ${muted ? 'text-white/35' : boosted ? 'text-pink' : 'text-white'}`}>
      {muted ? 'Muted' : `${v}%`}
    </div>
  )
}

// 0-300% slider: the part past 100% glows as "boost"
export const MAX = 300

export function Boost({ value, muted, onChange, onMute }: { value: number; muted?: boolean; onChange: (v: number) => void; onMute?: () => void }) {
  const Icon = muted ? VolumeX : value > 100 ? Volume2 : Volume1
  const pct = Math.min(MAX, value) / (MAX / 100)
  return (
    <div className="relative flex items-center gap-3">
      {onMute && (
        <button onClick={onMute} className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${muted ? 'bg-rose/20 text-rose' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}><Icon size={15} /></button>
      )}
      <div className="relative h-8 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${muted ? 'bg-white/25' : value > 100 ? 'bg-[linear-gradient(90deg,#7c5cff_0%,#35e0ff_50%,#ffb547_75%,#ff5ca8_100%)]' : 'bg-[linear-gradient(90deg,#7c5cff,#35e0ff)]'}`} style={{ width: `${pct}%`, backgroundSize: value > 100 ? `${(100 / pct) * 100}% 100%` : undefined }} />
        </div>
        <div className="pointer-events-none absolute top-1/2 h-4 w-px -translate-y-1/2 bg-white/40" style={{ left: `${10000 / MAX}%` }} />
        <div className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.4)]" style={{ left: `${pct}%` }} />
        <input type="range" min={0} max={MAX} step={1} value={Math.min(MAX, value)} onChange={(e) => onChange(Number(e.target.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </div>
    </div>
  )
}
