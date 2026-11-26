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
      {/* a computer with a D on its screen, and a phone in front */}
      <path d="M35 39H14a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4h26a4 4 0 0 1 4 4v3" fill="none" stroke="#0b1020" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 39v5M20 45.5h13" fill="none" stroke="#0b1020" strokeWidth="4" strokeLinecap="round" />
      <path d="M19 20.5h4c4.2 0 7 2.6 7 6s-2.8 6-7 6h-4z" fill="none" stroke="#0b1020" strokeWidth="3.2" strokeLinejoin="round" />
      <path fillRule="evenodd" fill="#0b1020" d="M41.5 25h8a3.5 3.5 0 0 1 3.5 3.5v19a3.5 3.5 0 0 1-3.5 3.5h-8a3.5 3.5 0 0 1-3.5-3.5v-19a3.5 3.5 0 0 1 3.5-3.5zM41.9 29.2h7.2a1.6 1.6 0 0 1 1.6 1.6v14.4a1.6 1.6 0 0 1-1.6 1.6h-7.2a1.6 1.6 0 0 1-1.6-1.6v-14.4a1.6 1.6 0 0 1 1.6-1.6zM43.75 26.6h3.5a.55 .55 0 0 1 0 1.1h-3.5a.55 .55 0 0 1 0-1.1z" />
      <rect x="40.3" y="29.2" width="10.4" height="17.6" rx="1.6" fill="#fff" fillOpacity="0.9" />
    </svg>
  )
}
