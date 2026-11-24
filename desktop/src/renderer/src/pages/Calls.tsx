import { motion } from 'framer-motion'
import { Delete, Hash, Headphones, Phone, Search, PhoneIncoming, PhoneMissed, PhoneOutgoing } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CallLogEntry } from '@shared/protocol'
import { Avatar, Button, Card, Empty, PageHeader, Segmented } from '@/components/ui'
import { call } from '@/lib/api'
import { ago, duration } from '@/lib/format'
import { useApp } from '@/lib/store'
import { list, spring } from '@/theme/motion'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
const SUB: Record<string, string> = { '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ', '0': '+' }

export function Calls() {
  const { conn, go } = useApp()
  const [num, setNum] = useState('')
  const [log, setLog] = useState<CallLogEntry[] | null>(null)
  const [bt, setBt] = useState<{ ready: boolean; platform: string; adapter: boolean; hfpConfigured: boolean; phone: { paired: boolean } | null } | null>(null)
  const [sims, setSims] = useState<{ index: number; label: string; number?: string }[]>([])
  const [tab, setTab] = useState<'recent' | 'contacts'>('recent')
  const [contacts, setContacts] = useState<{ name: string; number: string }[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (tab === 'contacts' && contacts === null && conn.connected)
      call<{ items: { name: string; number: string }[] }>('contacts', '').then((r) => setContacts(r.items || [])).catch(() => setContacts([]))
  }, [tab, conn.connected])
  // search by name, or by digits typed here or on the dial pad
  const needle = q.trim().toLowerCase()
  const digits = (needle || (tab === 'contacts' ? num : '')).replace(/\D/g, '')
  const shown = (contacts || []).filter((c) => (!needle && !digits) || (needle && c.name.toLowerCase().includes(needle)) || (digits.length >= 2 && c.number.replace(/\D/g, '').includes(digits)))
  const [sim, setSim] = useState<number>(() => +(localStorage.getItem('dc.sim') || 0))
  const dial = (n: string): void => {
    if (!n) return
    call('callDial', n, sims.length > 1 ? sim : undefined)
  }

  useEffect(() => {
    if (!conn.connected) return
    call<{ calls: CallLogEntry[] }>('callLog').then((r) => setLog(r.calls)).catch(() => setLog([]))
    call('btStatus').then(setBt)
    call('sims').then(setSims)
  }, [conn.connected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (KEYS.includes(e.key) || e.key === '+') setNum((n) => n + e.key)
      else if (e.key === 'Backspace') setNum((n) => n.slice(0, -1))
      else if (e.key === 'Enter' && num) dial(num)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [num])

  if (!conn.connected) return <Empty icon={Phone} title="Connect your phone" body="Make and take calls from your PC once your phone is connected." />

  return (
    <motion.div variants={list} initial="initial" animate="animate" className="mx-auto w-full max-w-[1680px]">
      <PageHeader icon={Phone} title="Calls" subtitle="Dial from your keyboard. Answer from anywhere on your desktop." />
      {bt && bt.platform === 'linux' && (!bt.adapter || !bt.hfpConfigured || !bt.phone?.paired) && (
        <Card className="mb-5 flex items-center gap-4 p-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber/15 text-amber"><Headphones size={18} /></div>
          <div className="flex-1 text-sm">
            <div className="font-semibold">Hear calls through this PC</div>
            <div className="text-muted">Set up Bluetooth hands-free once, then call audio plays on your laptop's speakers and mic.</div>
          </div>
          <Button size="sm" variant="soft" onClick={() => go('/settings')}>Set up</Button>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        <Card className="p-6">
          {sims.length > 1 && (
            <div className="mb-3 flex justify-center">
              <Segmented
                value={String(sim)}
                onChange={(v) => {
                  setSim(+v)
                  localStorage.setItem('dc.sim', v)
                }}
                options={sims.map((x) => ({ value: String(x.index), label: x.label || `SIM ${x.index + 1}` }))}
              />
            </div>
          )}
          <div className="mb-5 flex h-14 items-center justify-center">
            <motion.span key={num.length} initial={{ scale: 1.06 }} animate={{ scale: 1 }} className="truncate text-[32px] font-light tabular-nums tracking-wider">
              {num || <span className="text-white/25">Enter a number</span>}
            </motion.span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {KEYS.map((k) => (
              <motion.button key={k} whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.04 }} transition={spring} onClick={() => setNum((n) => n + k)} className="flex h-16 flex-col items-center justify-center rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.09]">
                <span className="text-2xl font-medium">{k}</span>
                <span className="h-3 text-[9px] font-semibold tracking-[0.2em] text-white/40">{SUB[k] || ''}</span>
              </motion.button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-center gap-6">
            <div className="w-12" />
            <motion.button whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.06 }} disabled={!num} onClick={() => dial(num)} className="grid h-16 w-16 place-items-center rounded-full bg-mint text-ink-950 shadow-[0_10px_30px_-6px_rgba(61,220,151,0.8)] disabled:opacity-40">
              <Phone size={26} fill="currentColor" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setNum((n) => n.slice(0, -1))} className="grid h-12 w-12 place-items-center rounded-full text-white/60 hover:bg-white/5 hover:text-white">
              <Delete size={22} />
            </motion.button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-3">
            <Segmented value={tab} options={[{ value: 'recent', label: 'Recent' }, { value: 'contacts', label: 'Contacts' }]} onChange={setTab} />
            {tab === 'contacts' && (
              <div className="relative flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or number" className="w-full rounded-xl bg-white/[0.06] py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-white/10 placeholder:text-white/35 focus:ring-violet/60" />
              </div>
            )}
          </div>
          {tab === 'contacts' ? (
            contacts === null ? (
              Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer mb-2 h-14 rounded-xl" />)
            ) : shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{contacts.length ? 'No matching contacts' : 'No contacts. Allow Contacts in the phone app → Settings.'}</p>
            ) : (
              <div className="max-h-[520px] space-y-0.5 overflow-y-auto">
                {shown.slice(0, 300).map((c, i) => (
                  <div key={c.name + c.number + i} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
                    <Avatar name={c.name} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <div className="truncate text-xs text-muted">{c.number}</div>
                    </div>
                    <motion.button whileTap={{ scale: 0.85 }} onClick={() => setNum(c.number.replace(/[^\d+*#]/g, ''))} title="Put in the dial pad" className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-white/70 opacity-0 transition hover:bg-white/10 group-hover:opacity-100">
                      <Hash size={15} />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.85 }} onClick={() => dial(c.number)} title="Call" className="grid h-9 w-9 place-items-center rounded-full bg-mint/15 text-mint opacity-0 transition group-hover:opacity-100">
                      <Phone size={15} />
                    </motion.button>
                  </div>
                ))}
              </div>
            )
          ) : log === null ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer mb-2 h-14 rounded-xl" />)
          ) : log.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No recent calls</p>
          ) : (
            <div className="max-h-[520px] space-y-0.5 overflow-y-auto">
              {log.map((c, i) => {
                const I = c.kind === 'missed' || c.kind === 'rejected' ? PhoneMissed : c.kind === 'out' ? PhoneOutgoing : PhoneIncoming
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 15) * 0.02 }} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
                    <Avatar name={c.name || c.number} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-semibold ${c.kind === 'missed' ? 'text-rose' : ''}`}>{c.name || c.number}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <I size={12} className={c.kind === 'missed' ? 'text-rose' : c.kind === 'out' ? 'text-cyan' : 'text-mint'} />
                        {ago(c.date)}{c.duration ? ` · ${duration(c.duration)}` : ''}
                      </div>
                    </div>
                    <motion.button whileTap={{ scale: 0.85 }} onClick={() => dial(c.number)} className="grid h-9 w-9 place-items-center rounded-full bg-mint/15 text-mint opacity-0 transition group-hover:opacity-100">
                      <Phone size={15} />
                    </motion.button>
                  </motion.div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </motion.div>
  )
}
