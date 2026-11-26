import { motion } from 'framer-motion'
import { Bluetooth, Minus, Square, X } from 'lucide-react'
import { call, useLive } from '@/lib/api'
import { useApp } from '@/lib/store'

export function TitleBar() {
  const conn = useApp((s) => s.conn)
  const [bt] = useLive<{ connected: boolean; callLink: boolean }>('btLink', 'btlink', { connected: false, callLink: false })
  return (
    <div className="drag flex h-11 shrink-0 items-center justify-between pl-5 pr-2">
      <div className="flex items-center gap-2.5">
        <Logo size={20} />
        <span className="text-[13px] font-semibold tracking-wide text-white/85">D-Connect</span>
        <motion.span
          key={String(conn.connected)}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          className={`ml-2 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${conn.connected ? 'bg-mint/10 text-mint' : 'bg-white/5 text-white/45'}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${conn.connected ? 'bg-mint shadow-[0_0_8px_rgb(var(--c-mint))]' : 'bg-white/30'}`} />
          {conn.connected ? `${conn.via === 'usb' ? 'USB' : 'Wi-Fi'}${conn.rtt ? ` · ${conn.rtt} ms` : ''}` : 'Offline'}
        </motion.span>
        {conn.connected && bt.connected && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            title={bt.callLink ? 'Bluetooth: calls can play on this PC' : 'Bluetooth connected'}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${bt.callLink ? 'bg-cyan/10 text-cyan-soft' : 'bg-white/5 text-white/45'}`}
          >
            <Bluetooth size={11} />
            {bt.callLink ? 'Calls' : 'BT'}
          </motion.span>
        )}
      </div>
      <div className="no-drag flex items-center">
        {[
          { icon: Minus, a: 'min' },
          { icon: Square, a: 'max' },
          { icon: X, a: 'close' }
        ].map(({ icon: I, a }) => (
          <button key={a} onClick={() => call('window', a)} className={`grid h-8 w-10 place-items-center rounded-lg text-white/50 transition hover:text-white ${a === 'close' ? 'hover:bg-rose/80' : 'hover:bg-white/10'}`}>
            <I size={a === 'max' ? 12 : 15} />
          </button>
        ))}
      </div>
    </div>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "rgb(var(--c-violet))" }} />
          <stop offset="0.55" style={{ stopColor: "rgb(var(--c-cyan))" }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--c-mint))" }} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#lg-a)" />
      {/* a laptop with a D on its screen, and a phone beside it (outline style) */}
      <g transform="translate(3 -1)" fill="none" stroke="#f4f6ff" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 38V20a3.5 3.5 0 0 1 3.5-3.5h23a3.5 3.5 0 0 1 3.5 3.5v4.5" strokeWidth="3.4" />
      <path d="M6 42.5h27" strokeWidth="3.4" />
      <path d="M20 22.5h3c3.3 0 5.5 2.2 5.5 5s-2.2 5-5.5 5h-3z" strokeWidth="3" />
      <path d="M41.5 27h7a3.5 3.5 0 0 1 3.5 3.5v16a3.5 3.5 0 0 1-3.5 3.5h-7a3.5 3.5 0 0 1-3.5-3.5v-16a3.5 3.5 0 0 1 3.5-3.5z" strokeWidth="3.4" />
      <path d="M43.5 31h3" strokeWidth="2.4" /></g>
    </svg>
  )
}
