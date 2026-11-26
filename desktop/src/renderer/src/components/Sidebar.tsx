import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useRef, useState } from 'react'
import { call, useLive } from '@/lib/api'
import { Bell, Bluetooth, Check, ChevronsUpDown, Eye, LayoutGrid, FolderUp, Home, Image, MessageSquare, MonitorSmartphone, Phone, Settings, Sparkles, Volume2, BatteryMedium } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Mark } from './TitleBar'
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
  const { conn, status, notifs, eye, devices, settings } = useApp()
  if (settings.navStyle !== 'sidebar') return <Dock route={route} go={go} />
  return <FullSidebar route={route} go={go} />
}

// The dock: on the left (icon above a short label) or floating at the bottom. Icons grow under
// the pointer and their neighbours a little less, like a dock should.
const SHORT: Record<string, string> = { '/notifications': 'Alerts', '/eye': 'Eyes', '/mirror': 'Screen' }
function DockItem({ to, label, Icon, active, badge, mouse, horizontal, onClick }: { to: string; label: string; Icon: any; active: boolean; badge: number; mouse: MotionValue<number>; horizontal: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  // 1 far away, up to 1.45 right under the pointer
  const scale = useSpring(
    useTransform(mouse, (m) => {
      const r = ref.current?.getBoundingClientRect()
      if (!r || !Number.isFinite(m)) return 1
      const c = horizontal ? r.left + r.width / 2 : r.top + r.height / 2
      return 1 + 0.45 * Math.max(0, 1 - Math.abs(m - c) / 110)
    }),
    { stiffness: 420, damping: 30, mass: 0.4 }
  )
  return (
    <button ref={ref} onClick={onClick} title={label} className={`group relative flex shrink-0 flex-col items-center ${horizontal ? 'px-1' : 'w-full py-1'}`}>
      <motion.span style={{ scale, transformOrigin: horizontal ? '50% 100%' : '50% 50%' }} className="relative grid h-10 w-12 place-items-center rounded-2xl">
        {active && <motion.span layoutId="dock-active" transition={spring} className="absolute inset-0 rounded-2xl bg-[linear-gradient(120deg,rgb(var(--c-violet)/0.34),rgb(var(--c-cyan)/0.18))] ring-1 ring-white/[0.12]" />}
        {!active && <span className="absolute inset-0 rounded-2xl opacity-0 transition group-hover:bg-white/[0.06] group-hover:opacity-100" />}
        <Icon size={19} className={`relative ${active ? 'text-white' : 'text-white/60 group-hover:text-white'}`} />
        {badge > 0 && <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-pink px-1 text-center text-[9.5px] font-bold leading-[16px] text-white">{badge > 99 ? '99+' : badge}</span>}
      </motion.span>
      {horizontal ? (
        <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-lg bg-ink-950/90 px-2 py-1 text-[11px] font-semibold text-white opacity-0 ring-1 ring-white/10 transition group-hover:opacity-100">{label}</span>
      ) : (
        <span className={`mt-0.5 text-[10.5px] font-medium ${active ? 'text-white' : 'text-white/50'}`}>{SHORT[to] || label}</span>
      )}
    </button>
  )
}

function Dock({ route, go }: { route: string; go: (r: string) => void }) {
  const { conn, status, notifs, devices, settings } = useApp()
  const [open, setOpen] = useState(false)
  const horizontal = settings.dockPos === 'bottom'
  const mouse = useMotionValue(Infinity)
  const many = devices.length > 1
  const isActive = (to: string): boolean => (to === '/' ? route === '/' : route.startsWith(to))
  const items = [...NAV.map((n) => ({ to: n.to, label: n.label, Icon: n.icon })), { to: '/settings', label: 'Settings', Icon: Settings }]
  const phone = (
    <div className="relative shrink-0">
      <button onClick={() => many && setOpen(!open)} title={`${conn.device?.name || 'No phone'}${status ? ` · ${status.battery}%` : ''}`} className={`relative grid place-items-center rounded-2xl bg-[linear-gradient(135deg,rgb(var(--c-violet)),rgb(var(--c-cyan)))] text-ink-950 shadow-[0_8px_24px_-8px_rgb(var(--c-violet)/0.8)] ${horizontal ? 'h-11 w-11' : 'h-12 w-12'}`}>
        <Mark size={horizontal ? 24 : 26} />
        <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-ink-900 ${conn.connected ? 'bg-mint' : 'bg-white/30'}`} />
      </button>
      {!horizontal && conn.connected && status && <div className="mt-1 text-center text-[10px] font-semibold tabular-nums text-white/55">{status.battery}%</div>}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className={`glass-strong absolute z-30 w-56 rounded-2xl p-1.5 ${horizontal ? 'bottom-full left-0 mb-2' : 'left-full top-0 ml-2'}`}>
            {devices.map((d: any) => (
              <button key={d.deviceId} onClick={async () => { await call('activateDevice', d.deviceId); setOpen(false) }} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${d.active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${d.active ? 'bg-mint' : d.online ? 'bg-amber' : 'bg-white/20'}`} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{d.name}</span>
                {d.active && <Check size={15} className="text-mint" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
  if (horizontal) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center">
        <motion.nav
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={spring}
          onMouseMove={(e) => mouse.set(e.clientX)}
          onMouseLeave={() => mouse.set(Infinity)}
          className="pointer-events-auto flex items-end gap-1 rounded-[26px] bg-ink-950/80 px-2.5 pb-2 pt-2 ring-1 ring-white/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
        >
          {phone}
          <span className="mx-1.5 h-8 w-px self-center bg-white/10" />
          {items.map((n) => (
            <DockItem key={n.to} to={n.to} label={n.label} Icon={n.Icon} active={isActive(n.to)} badge={n.to === '/notifications' ? notifs.length : 0} mouse={mouse} horizontal onClick={() => go(n.to)} />
          ))}
        </motion.nav>
      </div>
    )
  }
  return (
    <aside className="flex w-[84px] shrink-0 flex-col items-center px-1.5 pb-3" onMouseMove={(e) => mouse.set(e.clientY)} onMouseLeave={() => mouse.set(Infinity)}>
      <div className="mb-3 mt-1">{phone}</div>
      <nav className="no-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden py-2">
        {items.slice(0, -1).map((n) => (
          <DockItem key={n.to} to={n.to} label={n.label} Icon={n.Icon} active={isActive(n.to)} badge={n.to === '/notifications' ? notifs.length : 0} mouse={mouse} horizontal={false} onClick={() => go(n.to)} />
        ))}
      </nav>
      <DockItem to="/settings" label="Settings" Icon={Settings} active={isActive('/settings')} badge={0} mouse={mouse} horizontal={false} onClick={() => go('/settings')} />
    </aside>
  )
}

function FullSidebar({ route, go }: { route: string; go: (r: string) => void }) {
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
            <Mark size={24} />
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
