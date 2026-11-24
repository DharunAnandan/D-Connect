import { motion } from 'framer-motion'
import { Bell, Eye, FolderUp, Home, Image, MessageSquare, MonitorSmartphone, Phone, Settings, Sparkles } from 'lucide-react'
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
  { to: '/extras', label: 'Extras', icon: Sparkles },
  { to: '/eye', label: 'Eye Care', icon: Eye }
]

export function Sidebar({ route, go }: { route: string; go: (r: string) => void }) {
  const { conn, status, notifs, eye } = useApp()
  return (
    <aside className="flex w-[232px] shrink-0 flex-col px-3 pb-4">
      {/* the phone */}
      <motion.div layout className="glass mb-4 rounded-2xl p-3.5">
        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-[linear-gradient(135deg,#7c5cff,#35e0ff)] text-ink-950">
            <MonitorSmartphone size={19} />
            {conn.connected && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-ink-850 bg-mint" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{conn.device?.name || 'No phone'}</div>
            <div className="truncate text-[11px] text-muted">{conn.connected ? (conn.via === 'usb' ? 'Connected by USB' : 'Connected on Wi-Fi') : conn.device ? 'Disconnected' : 'Pair to get started'}</div>
          </div>
        </div>
        {conn.connected && status && (
          <div className="mt-3 flex items-center gap-2">
            <BatteryPill level={status.battery} charging={status.charging} />
            {status.network && <span className="rounded-full bg-white/5 px-2 py-1 text-[10.5px] font-medium text-white/60">{status.network === 'wifi' ? 'Wi-Fi' : status.carrier || 'Mobile'}</span>}
          </div>
        )}
      </motion.div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map((n) => {
          const active = n.to === '/' ? route === '/' : route.startsWith(n.to)
          const badge = n.to === '/notifications' ? notifs.length : 0
          return (
            <button key={n.to} onClick={() => go(n.to)} className={`group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors ${active ? 'text-white' : 'text-white/55 hover:text-white/90'}`}>
              {active && (
                <motion.span layoutId="nav-active" transition={spring} className="absolute inset-0 rounded-xl bg-[linear-gradient(120deg,rgba(124,92,255,0.22),rgba(53,224,255,0.1))] ring-1 ring-white/[0.08]">
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[linear-gradient(#8b6cff,#35e0ff)] shadow-[0_0_10px_#35e0ff]" />
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
