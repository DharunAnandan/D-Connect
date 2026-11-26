import { motion } from 'framer-motion'
import { LayoutGrid, Loader2, RefreshCw, Search, Usb } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, PageHeader } from '@/components/ui'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'

interface PhoneApp {
  pkg: string
  label: string
  icon?: string
}

export function Apps() {
  const connected = useApp((s) => s.conn.connected)
  const [apps, setApps] = useState<PhoneApp[] | null>(null)
  const [q, setQ] = useState('')
  const [opening, setOpening] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const load = (): void => {
    setApps(null)
    call<PhoneApp[]>('phoneApps').then(setApps).catch(() => setApps([]))
  }
  useEffect(() => {
    if (connected) load()
  }, [connected])

  const shown = useMemo(() => (apps || []).filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase())), [apps, q])

  const open = async (a: PhoneApp): Promise<void> => {
    setOpening(a.pkg)
    setMsg('')
    const r = await call<{ ok: boolean; message?: string }>('openPhoneApp', a.pkg, a.label)
    setOpening(null)
    if (!r.ok) setMsg(r.message || 'Could not open it.')
  }

  if (!connected) return <Empty icon={LayoutGrid} title="Connect your phone" body="Open your phone's apps in their own windows on this PC." />

  return (
    <div className="mx-auto w-full max-w-[1680px]">
      <PageHeader icon={LayoutGrid} title="Apps" subtitle="Each app opens in its own window and runs on its own screen, so your phone stays free">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps" className="field w-56 pl-9" />
        </div>
        <Button size="sm" variant="soft" icon={RefreshCw} onClick={load}>Refresh</Button>
      </PageHeader>
      {msg && (
        <Card className="mb-5 flex items-center gap-3 p-4 text-sm">
          <Usb size={18} className="shrink-0 text-amber" />
          <span className="text-white/80">{msg}</span>
        </Card>
      )}
      {apps === null ? (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">{Array.from({ length: 18 }).map((_, i) => <div key={i} className="shimmer h-28 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <Empty icon={LayoutGrid} title="No apps found" body="Update the D-Connect phone app, then refresh." />
      ) : (
        <div className="grid grid-cols-6 gap-3">
          {shown.map((a, i) => (
            <motion.button
              key={a.pkg}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 30) * 0.012 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => open(a)}
              disabled={!!opening}
              className="glass relative flex flex-col items-center gap-2.5 rounded-2xl px-2 py-4 text-center transition-shadow hover:shadow-[0_14px_40px_-14px_rgb(var(--c-violet)/0.45)] disabled:opacity-60"
            >
              {a.icon ? <img src={`data:image/png;base64,${a.icon}`} className="h-12 w-12" /> : <div className="h-12 w-12 rounded-2xl bg-white/10" />}
              <span className="line-clamp-2 text-[12px] font-medium leading-tight text-white/85">{a.label}</span>
              {opening === a.pkg && <Loader2 size={16} className="absolute right-2 top-2 animate-spin text-cyan" />}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}
