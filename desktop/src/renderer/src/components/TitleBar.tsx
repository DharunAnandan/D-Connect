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
          <stop offset="0" style={{ stopColor: "#8a6dfc" }} />
          <stop offset="0.55" style={{ stopColor: "#45c9f7" }} />
          <stop offset="1" style={{ stopColor: "#3fd8a8" }} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#lg-a)" />
      {/* a laptop with a D on its screen, linked with a phone in front of its corner */}
      <g transform="translate(32 32) scale(0.9) translate(-25.5 -30.5)">
      <path d="M31 36H12a3 3 0 0 1-3-3V18a3 3 0 0 1 3-3h24a3 3 0 0 1 3 3v3.5" fill="none" stroke="#0b1020" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path fillRule="evenodd" d="M7 39.5h25.5v4.2h-22.5a3 3 0 0 1-3-3zM21 39.5h6v.9a.6 .6 0 0 1-.6 .6h-4.8a.6 .6 0 0 1-.6-.6z" fill="#0b1020" />
      <path d="M18 20.5h2.8c3 0 5 2.1 5 4.8s-2 4.8-5 4.8h-2.8z" fill="none" stroke="#0b1020" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M38 24h6a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-16a3 3 0 0 1 3-3z" fill="none" stroke="#0b1020" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M39.6 27.8h2.8" fill="none" stroke="#0b1020" strokeWidth="2.2" strokeLinecap="round" /></g>
    </svg>
  )
}

// The D-Connect mark alone (a laptop with a D, linked with a phone), in the current text colour.
export function Mark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="10 10 44 44" className={className}>
      <g transform="translate(32 32) scale(0.9) translate(-25.5 -30.5)">
      <path d="M31 36H12a3 3 0 0 1-3-3V18a3 3 0 0 1 3-3h24a3 3 0 0 1 3 3v3.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path fillRule="evenodd" d="M7 39.5h25.5v4.2h-22.5a3 3 0 0 1-3-3zM21 39.5h6v.9a.6 .6 0 0 1-.6 .6h-4.8a.6 .6 0 0 1-.6-.6z" fill="currentColor" />
      <path d="M18 20.5h2.8c3 0 5 2.1 5 4.8s-2 4.8-5 4.8h-2.8z" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M38 24h6a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-16a3 3 0 0 1 3-3z" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M39.6 27.8h2.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></g>
    </svg>
  )
}
