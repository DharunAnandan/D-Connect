import { motion } from 'framer-motion'
import { Eye, Flame, Play, RotateCcw, Smartphone, Trophy, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Card, PageHeader, Ring, Row, Slider, Toggle } from '@/components/ui'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { list, spring } from '@/theme/motion'

export function EyeCare() {
  const { eye, eyeStats, settings, setSetting, conn } = useApp()
  const [now, setNow] = useState(Date.now())
  const [base, setBase] = useState({ at: Date.now(), next: eye?.nextInMs ?? 0 })
  useEffect(() => {
    setBase({ at: Date.now(), next: eye?.nextInMs ?? 0 })
  }, [eye?.nextInMs])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    call('eyeStats', 7).then((s) => useApp.setState({ eyeStats: s }))
  }, [])

  // between status updates, count down locally while the screen is on
  const left = eye?.on && eye.nextInMs !== null ? Math.max(0, base.next - (eye.screenOn ? now - base.at : 0)) : 0
  const pct = eye?.on ? 1 - left / (eye.everyMs || 1) : 0
  const mm = Math.floor(left / 60000)
  const ss = Math.floor((left % 60000) / 1000)
  const days = eyeStats?.days || []
  const maxDay = Math.max(4, ...days.map((d) => d.done + d.skip + d.snooze))
  const today = days[days.length - 1]
  const week = days.reduce((a, d) => a + d.done, 0)

  return (
    <motion.div variants={list} initial="initial" animate="animate" className="mx-auto w-full max-w-[1680px]">
      <PageHeader icon={Eye} title="Eye Care" subtitle="20 · 20 · 20: every 20 minutes, look 20 feet away for 20 seconds">
        <Button variant="soft" icon={RotateCcw} onClick={() => call('eyeReset')}>Restart timer</Button>
        <Button variant="primary" icon={Play} onClick={() => call('eyeTake')}>Break now</Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card strong className="relative flex items-center gap-8 overflow-hidden p-8">
          <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(53,224,255,0.20)_0%,transparent_70%)]" />
          <div className="relative">
            <motion.div className="absolute inset-4 rounded-full bg-cyan/10" animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.25, 0.6] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} />
            <Ring value={pct} size={210} stroke={10} colors={['#8be9ff', '#35e0ff', '#3ddc97']}>
              <div className="text-center">
                <div className="text-[46px] font-extralight tabular-nums tracking-tight">{eye?.on ? `${mm}:${String(ss).padStart(2, '0')}` : 'Off'}</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">{eye?.showing ? 'on a break' : eye?.screenOn === false ? 'paused · screen off' : 'until break'}</div>
              </div>
            </Ring>
          </div>
          <div className="relative flex-1 space-y-4">
            <Big icon={Flame} color="text-amber" value={eyeStats?.streak ?? 0} label="day streak" />
            <Big icon={Trophy} color="text-violet-soft" value={eyeStats?.best ?? 0} label="best streak" />
            <Big icon={Eye} color="text-mint" value={today?.done ?? 0} label="breaks today" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">This week</h3>
            <span className="text-sm text-muted">{week} breaks taken</span>
          </div>
          <div className="mt-6 flex h-44 items-end justify-between gap-3">
            {days.map((d, i) => {
              const total = d.done + d.skip + d.snooze
              const label = new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-2" title={`${d.done} taken · ${d.snooze} snoozed · ${d.skip} skipped`}>
                  <div className="flex h-36 w-full flex-col-reverse overflow-hidden rounded-xl bg-white/[0.04]">
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(d.done / maxDay) * 100}%` }} transition={{ ...spring, delay: i * 0.05 }} className="w-full bg-[linear-gradient(0deg,#35e0ff,#3ddc97)]" />
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(d.snooze / maxDay) * 100}%` }} transition={{ ...spring, delay: i * 0.05 + 0.1 }} className="w-full bg-amber/70" />
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(d.skip / maxDay) * 100}%` }} transition={{ ...spring, delay: i * 0.05 + 0.2 }} className="w-full bg-rose/60" />
                  </div>
                  <span className={`text-[11px] ${i === days.length - 1 ? 'font-semibold text-white' : 'text-white/45'}`}>{label}</span>
                  <span className="-mt-1.5 text-[10px] tabular-nums text-white/35">{total || ''}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex gap-4 text-[11px] text-white/55">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-mint" /> taken</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber" /> snoozed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose" /> skipped</span>
          </div>
        </Card>

        <Card className="grid grid-cols-1 lg:col-span-2 lg:grid-cols-2 gap-x-10 px-6 py-3">
          <div className="divide-y divide-white/[0.06]">
            <Row icon={Eye} title="Eye breaks" body="Counts only time with a screen on. 5 min away counts as a rest.">
              <Toggle on={!!settings.eyeBreaks} onChange={(v) => setSetting('eyeBreaks', v)} />
            </Row>
            <div className="py-4">
              <div className="mb-2 text-sm font-medium">Every</div>
              <Slider value={settings.eyeBreakMinutes ?? 20} min={5} max={60} step={5} suffix=" min" onChange={(v) => setSetting('eyeBreakMinutes', v)} />
            </div>
            <div className="py-4">
              <div className="mb-2 text-sm font-medium">For</div>
              <Slider value={settings.eyeBreakSeconds ?? 20} min={10} max={60} step={5} suffix=" s" onChange={(v) => setSetting('eyeBreakSeconds', v)} />
            </div>
          </div>
          <div className="divide-y divide-white/[0.06]">
            <Row icon={Smartphone} title="Break on the phone too" body={conn.connected ? 'The phone shows the break at the same moment, and ending it there ends it here.' : 'Works when your phone is connected.'}>
              <Toggle on={!!settings.eyePhoneSync} onChange={(v) => setSetting('eyePhoneSync', v)} />
            </Row>
            <Row icon={Smartphone} title="Phone screen time counts" body="Switching from the PC to the phone is not a rest. The timer keeps going.">
              <Toggle on={!!settings.eyePhoneCounts} onChange={(v) => setSetting('eyePhoneCounts', v)} />
            </Row>
            <Row icon={Volume2} title="Chime" body="A soft chime at the start and a brighter one at the end.">
              <Toggle on={settings.eyeBreakSound !== false} onChange={(v) => setSetting('eyeBreakSound', v)} />
            </Row>
          </div>
        </Card>
      </div>
    </motion.div>
  )
}

function Big({ icon: I, value, label, color }: { icon: any; value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-11 w-11 place-items-center rounded-xl bg-white/[0.06] ${color}`}><I size={20} /></div>
      <div>
        <motion.div key={value} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-2xl font-bold tabular-nums">{value}</motion.div>
        <div className="-mt-0.5 text-xs text-muted">{label}</div>
      </div>
    </div>
  )
}
