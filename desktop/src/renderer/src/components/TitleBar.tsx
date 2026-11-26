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
          <stop offset="0" style={{ stopColor: "#5b3fe0" }} />
          <stop offset="0.55" style={{ stopColor: "#2a8fe0" }} />
          <stop offset="1" style={{ stopColor: "#21b394" }} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#lg-a)" />
      {/* a laptop with a D on its screen, and a phone beside it */}
      <g transform="translate(32 32) scale(0.8) translate(-31 -29.5)">
      <path d="M12 15h24a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3h-24a3 3 0 0 1-3-3v-15a3 3 0 0 1 3-3z" fill="none" stroke="#0b1020" strokeWidth="3.2" strokeLinejoin="round" />
      <path fillRule="evenodd" d="M4 39.5h40v1.2a3 3 0 0 1-3 3h-34a3 3 0 0 1-3-3zM20.5 39.5h7v.9a.6 .6 0 0 1-.6 .6h-5.8a.6 .6 0 0 1-.6-.6z" fill="#0b1020" />
      <path d="M20.5 20.5h2.8c3 0 5 2.1 5 4.8s-2 4.8-5 4.8h-2.8z" fill="none" stroke="#0b1020" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M49 22h6a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-17a3 3 0 0 1 3-3z" fill="none" stroke="#0b1020" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M50.6 25.8h2.8" fill="none" stroke="#0b1020" strokeWidth="2.2" strokeLinecap="round" /></g>
    </svg>
  )
}
