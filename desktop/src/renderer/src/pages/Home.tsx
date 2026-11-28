import { motion } from 'framer-motion'
import { Bell, Clipboard, Laptop, Smartphone, Eye, FolderUp, Link2, MessageSquare, MonitorSmartphone, Music2, Pause, Play, Radar, SkipBack, SkipForward, Wifi } from 'lucide-react'
import { ConnectScene } from '@/components/ConnectScene'
import { Avatar, Button, Card, Pill, Ring } from '@/components/ui'
import { call, useLive } from '@/lib/api'
import { ago, size } from '@/lib/format'
import { Boost } from './Sound'
import { Mark } from '@/components/TitleBar'
import { ClipboardCard } from '@/components/ClipboardCard'
import { LinkDrawing } from '@/components/LinkDrawing'
import { useApp } from '@/lib/store'
import { list } from '@/theme/motion'

export function Home() {
  const { conn, status, notifs, eye, eyeStats, phoneMedia, info, go: nav, settings, setSetting } = useApp()
  const [phoneRinging] = useLive<boolean>('phoneRinging', 'findphone', false)

  // switched off here, or the phone switched itself off: a still card, not the search animation
  if (!conn.connected && (conn.pcOffline || conn.phoneOffline)) {
    return (
      <motion.div variants={list} initial="initial" animate="animate" className="mx-auto max-w-xl pt-24 text-center">
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl bg-white/5 ring-1 ring-white/10">
          {conn.pcOffline ? <Laptop size={40} className="text-white/50" /> : <Smartphone size={40} className="text-white/50" />}
        </div>
        <h2 className="mt-6 text-2xl font-bold tracking-tight">{conn.pcOffline ? 'This PC is offline' : `${conn.device?.name || 'Your phone'} is offline`}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {conn.pcOffline ? 'No phone can connect until you go online again.' : 'D-Connect was switched off on the phone. Turn it on there (the app or its quick-settings tile) to connect again.'}
        </p>
        {conn.pcOffline && (
          <div className="mt-6 flex justify-center">
            <Button variant="primary" icon={Wifi} onClick={() => call('setPcOffline', false)}>Go online</Button>
          </div>
        )}
      </motion.div>
    )
  }

  if (!conn.connected) {
    return (
      <motion.div variants={list} initial="initial" animate="animate" className="mx-auto max-w-3xl pt-6 text-center">
        <ConnectScene state="searching" phoneName={conn.device?.name} pcName={info?.name} height={320} />
        <h2 className="text-2xl font-bold tracking-tight">Looking for {conn.device?.name || 'your phone'}…</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">Open D-Connect on your phone, on the same Wi-Fi, or plug it in with USB debugging on. It reconnects by itself.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="soft" icon={Wifi} onClick={() => nav('/pair')}>Pair another phone</Button>
        </div>
      </motion.div>
    )
  }

  const today = eyeStats?.days[eyeStats.days.length - 1]
  const eyePct = eye?.on && eye.nextInMs !== null ? 1 - eye.nextInMs / eye.everyMs : 0
  const storagePct = status?.storageTotal ? 1 - (status.storageFree || 0) / status.storageTotal : 0

  return (
    <motion.div variants={list} initial="initial" animate="animate" className="mx-auto w-full max-w-[1680px]">
      {/* hero */}
      <Card strong className="relative mb-5 overflow-hidden p-6">
        {/* a soft light sweeps across now and then (every 10 s) */}
        <motion.div
          className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgb(var(--c-cyan)/0.10),rgba(255,255,255,0.10),rgb(var(--c-violet)/0.10),transparent)]"
          initial={{ left: '-40%' }}
          animate={{ left: '120%' }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 7.6, delay: 1.5 }}
        />
        <div className="absolute -left-20 -top-28 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgb(var(--c-violet)/0.30)_0%,transparent_70%)]" />
        <div className="absolute -bottom-32 right-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgb(var(--c-cyan)/0.20)_0%,transparent_70%)]" />
        <div className="relative flex items-center gap-6">
          <motion.div layoutId="phone-hero" className="relative grid h-[112px] w-[72px] place-items-center rounded-[22px] bg-[linear-gradient(160deg,#2a3360,#121731)] ring-1 ring-white/15 shadow-[0_0_50px_rgb(var(--c-violet)/0.4)]">
            <Mark size={40} className="text-cyan-soft" />
            <span className="absolute bottom-2 h-1 w-6 rounded-full bg-white/20" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Pill color="mint"><span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_6px_rgb(var(--c-mint))]" /> Connected</Pill>
              <Pill color={conn.via === 'usb' ? 'violet' : 'cyan'}>{conn.via === 'usb' ? 'USB' : 'Wi-Fi'}{conn.rtt ? ` · ${conn.rtt} ms` : ''}</Pill>
            </div>
            <h1 className="mt-2 truncate text-[30px] font-bold tracking-tight">{conn.device?.name}</h1>
            <p className="text-sm text-muted">{conn.device?.model}{conn.since ? ` · linked ${ago(conn.since)} ago` : ''}</p>
          </div>
          {/* the phone and this PC, drawn in light, linked */}
          <LinkDrawing className="hidden h-24 min-w-[180px] max-w-[560px] flex-[1.3] 2xl:block" />
          <div className="flex items-center gap-5">
            <Stat label="Battery" value={`${status?.battery ?? '–'}%`} pct={(status?.battery ?? 0) / 100} colors={status?.charging ? ['rgb(var(--c-mint))', '#8be9ff'] : (status?.battery ?? 100) <= 20 ? ['rgb(var(--c-pink))', '#f87171'] : ['rgb(var(--c-violet))', 'rgb(var(--c-cyan))']} sub={status?.charging ? 'Charging' : 'On battery'} />
            <Stat label="Storage" value={status?.storageFree ? size(status.storageFree) : '–'} pct={storagePct} colors={['#ffb547', 'rgb(var(--c-pink))']} sub="free" />
          </div>
        </div>
      </Card>

      {/* quick actions */}
      <div className="mb-5 grid grid-cols-3 gap-3 lg:grid-cols-6">
        {[
          phoneRinging
            ? { icon: Radar, label: 'Stop ringing', color: 'from-pink/60 to-rose-500/40', run: () => call('findPhone', false) }
            : { icon: Radar, label: 'Find phone', color: 'from-pink/30 to-violet/20', run: () => call('findPhone', true) },
          { icon: Clipboard, label: 'Send clipboard', color: 'from-cyan/30 to-violet/10', run: () => call('clipSendNow') },
          { icon: FolderUp, label: 'Send files', color: 'from-violet/30 to-cyan/10', run: () => nav('/files') },
          { icon: MonitorSmartphone, label: 'Mirror screen', color: 'from-mint/25 to-cyan/10', run: () => nav('/mirror') },
          { icon: Link2, label: 'Share link', color: 'from-amber/25 to-pink/10', run: () => nav('/extras') },
          { icon: Eye, label: 'Eye break', color: 'from-cyan/25 to-mint/15', run: () => call('eyeTake') }
        ].map((a) => (
          <Card key={a.label} hover className="cursor-pointer p-4" onClick={a.run} whileTap={{ scale: 0.96 }}>
            <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${a.color} ring-1 ring-white/10`}>
              <a.icon size={19} />
            </div>
            <div className="text-[13px] font-semibold">{a.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* latest notifications */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold"><Bell size={16} className="text-pink" /> Latest</h3>
            <Button size="sm" variant="ghost" onClick={() => nav('/notifications')}>See all</Button>
          </div>
          {notifs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">All caught up ✨</p>
          ) : (
            <div className="space-y-1">
              {notifs.slice(0, 5).map((n) => (
                <motion.div layout key={n.key} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.04]">
                  {n.icon ? <img src={`data:image/png;base64,${n.icon}`} className="h-9 w-9 rounded-xl bg-white/5 p-1.5" /> : <Avatar name={n.app} size={36} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">{n.title}</span>
                      <span className="shrink-0 text-[11px] text-white/40">{n.app} · {ago(n.time)}</span>
                    </div>
                    <div className="truncate text-[13px] text-muted">{n.text}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          {/* eye care */}
          <Card hover className="cursor-pointer p-5" onClick={() => nav('/eye')}>
            <div className="flex items-center gap-4">
              <Ring value={eyePct} size={76} stroke={7} colors={['rgb(var(--c-cyan))', 'rgb(var(--c-mint))']}>
                <Eye size={22} className="text-cyan-soft" />
              </Ring>
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-widest text-white/45">20 · 20 · 20</div>
                <div className="mt-1 text-lg font-semibold">{eye?.on ? (eye.nextInMs !== null ? `Break in ${Math.ceil(eye.nextInMs / 60000)} min` : '…') : 'Eye breaks off'}</div>
                <div className="text-xs text-muted">{today ? `${today.done} today` : ''}{eyeStats?.streak ? ` · 🔥 ${eyeStats.streak}-day streak` : ''}</div>
              </div>
            </div>
          </Card>

          {/* now playing on the phone */}
          <Card className="relative overflow-hidden p-5">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgb(var(--c-pink)/0.20)_0%,transparent_70%)]" />
            <div className="relative flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[linear-gradient(135deg,rgb(var(--c-pink)),rgb(var(--c-violet)))] shadow-[0_8px_30px_-6px_rgb(var(--c-pink)/0.6)]">
                {phoneMedia?.playing ? <Equalizer /> : <Music2 size={22} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-white/45">On your phone</div>
                <div className="truncate font-semibold">{phoneMedia?.title || 'Nothing playing'}</div>
                <div className="truncate text-xs text-muted">{phoneMedia ? `${phoneMedia.artist || ''} · ${phoneMedia.app}` : 'Play something to control it here'}</div>
              </div>
            </div>
            {phoneMedia && (
              <div className="relative mt-3 flex justify-center">
                <div className="flex rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
                  {[
                    { v: true, label: 'This PC', I: Laptop },
                    { v: false, label: 'Phone', I: Smartphone }
                  ].map(({ v, label, I }) => {
                    const on = (settings.phoneAudioOnPc !== false) === v
                    return (
                      <button key={label} onClick={() => setSetting('phoneAudioOnPc', v)} className={`relative flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${on ? 'text-ink-950' : 'text-white/60 hover:text-white'}`}>
                        {on && <motion.span layoutId="media-out" className="absolute inset-0 rounded-full bg-mint" transition={{ type: 'spring', stiffness: 500, damping: 34 }} />}
                        <span className="relative flex items-center gap-1.5"><I size={12} /> {label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {phoneMedia && (
              <div className="relative mt-3 flex justify-center gap-2">
                <MediaBtn icon={SkipBack} onClick={() => call('mediaPhoneCmd', 'prev')} />
                <MediaBtn icon={phoneMedia.playing ? Pause : Play} big onClick={() => call('mediaPhoneCmd', 'toggle')} />
                <MediaBtn icon={SkipForward} onClick={() => call('mediaPhoneCmd', 'next')} />
              </div>
            )}
            {phoneMedia && settings.phoneAudioOnPc !== false && (
              <div className="relative mt-3 px-1">
                <div className="mb-0.5 flex justify-between text-[11px] text-white/45"><span>Volume on this PC</span><span className={`tabular-nums ${(settings.phoneAudioVolume ?? 100) > 100 ? 'text-pink' : ''}`}>{settings.phoneAudioVolume ?? 100}%</span></div>
                <Boost value={settings.phoneAudioVolume ?? 100} onChange={(v) => setSetting('phoneAudioVolume', v)} />
              </div>
            )}
          </Card>

          <Card hover className="cursor-pointer p-5" onClick={() => nav('/messages')}>
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan/15 text-cyan"><MessageSquare size={18} /></div>
              <div className="flex-1">
                <div className="font-semibold">Messages</div>
                <div className="text-xs text-muted">Read and reply to texts from your keyboard</div>
              </div>
            </div>
          </Card>

          <ClipboardCard />
        </div>
      </div>
    </motion.div>
  )
}

function Stat({ label, value, pct, colors, sub }: { label: string; value: string; pct: number; colors: string[]; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <Ring value={pct} size={64} stroke={6} colors={colors}>
        <span className="text-[13px] font-bold tabular-nums">{Math.round(pct * 100)}</span>
      </Ring>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-white/45">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
        <div className="text-[11px] text-muted">{sub}</div>
      </div>
    </div>
  )
}

function MediaBtn({ icon: I, big, onClick }: { icon: any; big?: boolean; onClick: () => void }) {
  return (
    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onClick} className={`grid place-items-center rounded-full ${big ? 'h-12 w-12 bg-white text-ink-950' : 'h-10 w-10 bg-white/10 hover:bg-white/15'}`}>
      <I size={big ? 20 : 16} fill={big ? 'currentColor' : 'none'} />
    </motion.button>
  )
}

export function Equalizer() {
  return (
    <div className="flex h-6 items-end gap-[3px]">
      {[0, 1, 2, 3].map((i) => (
        <motion.span key={i} className="w-[4px] rounded-full bg-white" animate={{ height: ['30%', '100%', '45%', '80%', '30%'] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
      ))}
    </div>
  )
}
