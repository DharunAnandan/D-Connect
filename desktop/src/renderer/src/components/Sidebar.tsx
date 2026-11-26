import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { call, useLive } from '@/lib/api'
import { Bell, Bluetooth, Check, ChevronsUpDown, Eye, LayoutGrid, FolderUp, Home, Image, MessageSquare, MonitorSmartphone, Phone, Settings, Sparkles, Volume2, BatteryMedium } from 'lucide-react'
import { useApp } from '@/lib/store'
import { spring } from '@/theme/motion'
import { BatteryPill } from './Battery'

export const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/calls', label: 'Calls', icon: Phone },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/files', label: 'Files', icon: FolderUp },
  { to: '/photos', label: 'Photos', icon: Image },
  { to: '/mirror', label: 'Screen', icon: MonitorSmartphone },
  { to: '/apps', label: 'Apps', icon: LayoutGrid },
  { to: '/sound', label: 'Sound', icon: Volume2 },
  { to: '/battery', label: 'Battery', icon: BatteryMedium },
  { to: '/extras', label: 'Extras', icon: Sparkles },
  { to: '/eye', label: 'Eye Care', icon: Eye }
]

export function Sidebar({ route, go }: { route: string; go: (r: string) => void }) {
  const { conn, status, notifs, eye, devices } = useApp()
  const [open, setOpen] = useState(false)
  const [bt] = useLive<{ connected: boolean; callLink: boolean }>('btLink', 'btlink', { connected: false, callLink: false })
  const many = devices.length > 1
  return (
    <aside className="flex w-[232px] shrink-0 flex-col px-3 pb-4">
      {/* the phone (click to choose when several are paired) */}
      <div className="relative mb-4">
      <motion.div layout onClick={() => many && setOpen(!open)} className={`glass rounded-2xl p-3.5 ${many ? 'cursor-pointer hover:ring-1 hover:ring-white/10' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-[linear-gradient(135deg,rgb(var(--c-violet)),rgb(var(--c-cyan)))] text-ink-950">
            <MonitorSmartphone size={19} />
            {conn.connected && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-ink-850 bg-mint" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{conn.device?.name || 'No phone'}</div>
            <div className="truncate text-[11px] text-muted">{conn.connected ? (conn.via === 'usb' ? 'Connected by USB' : 'Connected on Wi-Fi') : conn.device ? 'Disconnected' : 'Pair to get started'}</div>
          </div>
          {many && <ChevronsUpDown size={15} className="shrink-0 text-white/40" />}
        </div>
        {conn.connected && status && (
          <div className="mt-3 flex items-center gap-2">
            <BatteryPill level={status.battery} charging={status.charging} />
            {status.network && <span className="rounded-full bg-white/5 px-2 py-1 text-[10.5px] font-medium text-white/60">{status.network === 'wifi' ? 'Wi-Fi' : status.carrier || 'Mobile'}</span>}
            {bt.connected && (
              <span title={bt.callLink ? 'Bluetooth: calls can play on this PC' : 'Bluetooth connected'} className={`grid h-[22px] w-[22px] place-items-center rounded-full ${bt.callLink ? 'bg-cyan/15 text-cyan-soft' : 'bg-white/5 text-white/50'}`}>
                <Bluetooth size={11} />
              </span>
            )}
          </div>
        )}
      </motion.div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={spring}
            className="glass-strong absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl p-1.5"
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-white/40">Use which phone?</div>
            {devices.map((d: any) => (
              <button
                key={d.deviceId}
                onClick={async () => {
                  await call('activateDevice', d.deviceId)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${d.active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${d.active ? 'bg-mint shadow-[0_0_6px_rgb(var(--c-mint))]' : d.online ? 'bg-amber' : 'bg-white/20'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{d.name}</span>
                  <span className="block text-[10.5px] text-muted">{d.active ? 'In use' : d.online ? 'Online · standby' : 'Offline'}</span>
                </span>
                {d.active && <Check size={15} className="text-mint" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map((n) => {
          const active = n.to === '/' ? route === '/' : route.startsWith(n.to)
          const badge = n.to === '/notifications' ? notifs.length : 0
          return (
            <button key={n.to} onClick={() => go(n.to)} className={`group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors ${active ? 'text-white' : 'text-white/55 hover:text-white/90'}`}>
              {active && (
                <motion.span layoutId="nav-active" transition={spring} className="absolute inset-0 rounded-xl bg-[linear-gradient(120deg,rgb(var(--c-violet)/0.22),rgb(var(--c-cyan)/0.1))] ring-1 ring-white/[0.08]">
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[linear-gradient(rgb(var(--c-violet)),rgb(var(--c-cyan)))] shadow-[0_0_10px_rgb(var(--c-cyan))]" />
                </motion.span>
              )}
              <n.icon size={18} className={`relative transition-transform group-hover:scale-110 ${active ? 'text-cyan-soft' : ''}`} />
              <span className="relative flex-1 text-left">{n.label}</span>
              {badge > 0 && <span className="relative rounded-full bg-pink px-1.5 text-[10px] font-bold leading-[18px] text-white">{badge > 99 ? '99+' : badge}</span>}
              {n.to === '/eye' && eye?.on && eye.nextInMs !== null && <span className="relative text-[10.5px] tabular-nums text-white/40">{Math.ceil(eye.nextInMs / 60000)}m</span>}
            </button>
          )
        })}
      </nav>

      <button onClick={() => go('/settings')} className={`mt-2 flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors ${route === '/settings' ? 'bg-white/[0.07] text-white' : 'text-white/55 hover:text-white'}`}>
        <Settings size={18} />
        Settings
      </button>
    </aside>
  )
}
