import { motion } from 'framer-motion'
import { Cable, QrCode, RefreshCw, ShieldCheck, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConnectScene } from '@/components/ConnectScene'
import { Logo } from '@/components/TitleBar'
import { Button, Card } from '@/components/ui'
import { call, dc } from '@/lib/api'
import { useApp } from '@/lib/store'
import { item, list } from '@/theme/motion'

interface PairInfo {
  qr: string
  uri: string
  hosts: string[]
  port: number
  fp: string
  name: string
}

export function Pair() {
  const [info, setInfo] = useState<PairInfo | null>(null)
  const [usb, setUsb] = useState<{ devices: { model: string; state: string }[] }>({ devices: [] })
  const devices = useApp((s) => s.devices)

  useEffect(() => {
    call<PairInfo>('pairInfo').then(setInfo)
    call('usb').then(setUsb)
    const offs = [dc.on('pairInfo', setInfo), dc.on('usb', (d) => setUsb({ devices: d }))]
    const t = setInterval(() => call<PairInfo>('pairInfo').then(setInfo), 60000)
    return () => {
      offs.forEach((o) => o())
      clearInterval(t)
    }
  }, [])

  return (
    <motion.div variants={list} initial="initial" animate="animate" className="mx-auto grid h-full max-w-6xl grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-center gap-10 py-4">
      <motion.div variants={item}>
        <div className="mb-5 flex items-center gap-3">
          <Logo size={40} />
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/60 ring-1 ring-white/10">{devices.length ? 'Add a phone' : 'Welcome'}</span>
        </div>
        <h1 className="text-[44px] font-extrabold leading-[1.05] tracking-tight">
          Your phone,
          <br />
          <span className="text-aurora">right on your PC.</span>
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
          Messages, calls, notifications, files and your phone's screen, plus eye care that follows you from screen to screen.
        </p>
        <div className="-mx-6 mt-4">
          <ConnectScene state="searching" pcName={info?.name} height={260} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/60">
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5"><ShieldCheck size={13} className="text-mint" /> TLS encrypted, pinned to this PC</span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5"><Wifi size={13} className="text-cyan" /> Same Wi-Fi</span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5"><Cable size={13} className="text-violet-soft" /> or USB</span>
        </div>
      </motion.div>

      <Card strong className="relative overflow-hidden p-7">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgb(var(--c-violet)/0.30)_0%,transparent_70%)]" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <QrCode size={17} className="text-cyan" /> Scan with the D-Connect app
          </div>
          <div className="relative mx-auto mt-5 w-fit">
            <motion.div
              className="absolute -inset-3 rounded-[30px] bg-[conic-gradient(from_0deg,rgb(var(--c-violet)),rgb(var(--c-cyan)),rgb(var(--c-mint)),rgb(var(--c-pink)),rgb(var(--c-violet)))] opacity-70 blur-md"
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            />
            <div className="relative rounded-3xl bg-white p-3.5">
              {info ? (
                <motion.img key={info.qr} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} src={info.qr} className="h-[236px] w-[236px]" />
              ) : (
                <div className="shimmer h-[236px] w-[236px] rounded-xl" />
              )}
            </div>
          </div>
          <ol className="mt-7 space-y-3 text-sm">
            {['Install D-Connect on your Android phone', 'Open it and tap “Pair with PC”', 'Point the camera at this code'].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[linear-gradient(135deg,rgb(var(--c-violet)),rgb(var(--c-cyan)))] text-[11px] font-bold text-ink-950">{i + 1}</span>
                <span className="text-white/80">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex items-center justify-between border-t hairline pt-4 text-xs text-muted">
            <span className="truncate">
              {info ? `${info.hosts.join(' · ') || 'no network'} : ${info.port}` : '…'}
              {usb.devices.length > 0 && <span className="ml-2 text-mint">· USB: {usb.devices[0].model}</span>}
            </span>
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => call('rotateToken')}>
              New code
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
