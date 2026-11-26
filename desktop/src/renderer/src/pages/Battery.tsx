import { motion } from 'framer-motion'
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Laptop, Smartphone, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, PageHeader, Ring, Row, Toggle } from '@/components/ui'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { list } from '@/theme/motion'

// Battery: the phone's and this laptop's charge, and the alerts for both.
export function Battery() {
  const { status, settings, setSetting, conn } = useApp()
  const [pc, setPc] = useState<{ level: number; charging: boolean } | null>(null)
  useEffect(() => {
    const load = (): void => {
      call('pcBattery').then(setPc).catch(() => {})
    }
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])
  const low = Number(settings.lowBatteryAlert ?? 20)
  const target = Number(settings.chargeAlert ?? 100)
  const pcLow = Number(settings.pcLowAlert ?? 20)
  const pcTarget = Number(settings.pcChargeAlert ?? 0)

  return (
    <motion.div variants={list} initial="initial" animate="animate" className="mx-auto w-full max-w-[1680px]">
      <PageHeader icon={BatteryMedium} title="Battery" subtitle="Your phone's and this laptop's charge, with alerts when they run low or finish charging" />

      <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Gauge icon={Smartphone} title={conn.device?.name || 'Phone'} level={conn.connected ? status?.battery : undefined} charging={!!status?.charging} empty={conn.connected ? 'Waiting for the phone…' : 'Phone not connected'} low={low} />
        <Gauge icon={Laptop} title="This laptop" level={pc?.level} charging={!!pc?.charging} empty="No battery found (desktop PC, or not Linux)" low={pcLow} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2 font-semibold"><Smartphone size={16} className="text-cyan" /> Phone alerts</div>
          <Row icon={BatteryLow} title="Battery low" body={low ? `When the phone drops to ${low}% and isn't charging.` : 'Off'}>
            <Levels value={low} options={[0, 15, 20, 30]} onChange={(v) => setSetting('lowBatteryAlert', v)} />
          </Row>
          <Row icon={BatteryFull} title="Charged to" body={target === 0 ? 'Off' : target >= 100 ? 'When it is fully charged.' : `When charging reaches ${target}%: unplug early to go easy on the battery.`}>
            <Levels value={target} options={[0, 80, 90, 100]} onChange={(v) => setSetting('chargeAlert', v)} />
          </Row>
        </Card>
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2 font-semibold"><Laptop size={16} className="text-violet-soft" /> Laptop alerts</div>
          <Row icon={Zap} title="Laptop battery alerts" body="Low battery and charged-to alerts for this laptop.">
            <Toggle on={settings.pcBatteryAlert !== false} onChange={(v) => setSetting('pcBatteryAlert', v)} />
          </Row>
          {settings.pcBatteryAlert !== false && (
            <>
              <Row icon={BatteryLow} title="Battery low" body={pcLow ? `When the laptop drops to ${pcLow}% and isn't charging.` : 'Off'}>
                <Levels value={pcLow} options={[0, 15, 20, 30]} onChange={(v) => setSetting('pcLowAlert', v)} />
              </Row>
              <Row icon={BatteryFull} title="Charged to" body={pcTarget === 0 ? 'Off' : pcTarget >= 100 ? 'When it is fully charged.' : `When charging reaches ${pcTarget}%.`}>
                <Levels value={pcTarget} options={[0, 80, 90, 100]} onChange={(v) => setSetting('pcChargeAlert', v)} />
              </Row>
              <Row icon={Smartphone} title="Also alert on the phone" body="Laptop battery alerts show as a notification on your phone too.">
                <Toggle on={settings.pcAlertsToPhone !== false} onChange={(v) => setSetting('pcAlertsToPhone', v)} />
              </Row>
            </>
          )}
        </Card>
      </div>
    </motion.div>
  )
}

function Gauge({ icon: Icon, title, level, charging, empty, low }: { icon: typeof Laptop; title: string; level?: number; charging: boolean; empty: string; low: number }) {
  const has = typeof level === 'number'
  const color = !has ? ['#555', '#555'] : charging ? ['#3ddc97', '#35e0ff'] : level! <= low ? ['#ff5ca8', '#f87171'] : level! <= 40 ? ['#ffb547', '#ff5ca8'] : ['#7c5cff', '#35e0ff']
  return (
    <Card strong className="relative flex items-center gap-6 overflow-hidden p-6">
      <div className="absolute -left-14 -top-14 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.18)_0%,transparent_70%)]" />
      <Ring value={has ? level! / 100 : 0} size={132} stroke={10} colors={color}>
        <div className="text-center">
          <div className="text-3xl font-light tabular-nums">{has ? `${level}%` : '–'}</div>
          {has && charging && <BatteryCharging size={16} className="mx-auto mt-0.5 text-mint" />}
        </div>
      </Ring>
      <div className="relative min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45"><Icon size={13} /> {title}</div>
        <div className="text-lg font-semibold">{!has ? empty : charging ? 'Charging' : level! <= low ? 'Low battery' : 'On battery'}</div>
        {has && <div className="mt-1 text-sm text-white/55">{charging ? 'Plugged in' : level! <= low ? 'Plug it in soon' : 'Running on battery'}</div>}
      </div>
    </Card>
  )
}

// quick levels (0 = off) plus a box for your own number
function Levels({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  const custom = !options.includes(value)
  const [text, setText] = useState(custom ? String(value) : '')
  useEffect(() => setText(options.includes(value) ? '' : String(value)), [value])
  const commit = (): void => {
    const n = Math.round(Number(text))
    if (text.trim() && Number.isFinite(n) && n >= 1 && n <= 100) onChange(n)
    else setText(options.includes(value) ? '' : String(value))
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums transition-colors ${value === o ? 'bg-white text-ink-950' : 'text-white/60 hover:text-white'}`}>
            {o === 0 ? 'Off' : `${o}%`}
          </button>
        ))}
      </div>
      <label className={`flex items-center rounded-full px-2.5 py-1 ring-1 transition-colors ${custom ? 'bg-white text-ink-950 ring-white' : 'bg-white/[0.06] text-white/70 ring-white/10 focus-within:ring-cyan/50'}`}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="Own"
          inputMode="numeric"
          className="w-9 bg-transparent text-center text-[11px] font-semibold tabular-nums outline-none placeholder:text-current placeholder:opacity-60"
        />
        <span className="text-[11px] font-semibold">%</span>
      </label>
    </div>
  )
}
