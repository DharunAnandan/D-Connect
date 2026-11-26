import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellOff, CheckCheck, Reply, Send, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar, Button, Card, Empty, PageHeader } from '@/components/ui'
import { call } from '@/lib/api'
import { ago } from '@/lib/format'
import { useApp } from '@/lib/store'
import { spring } from '@/theme/motion'

// fixed filters by kind of app (the package names cover the usual variants)
const GROUPS: { id: string; label: string; color: string; match: RegExp }[] = [
  { id: 'sms', label: 'SMS', color: '#35e0ff', match: /(\.mms|messaging|\.sms|com\.android\.messaging|com\.oneplus\.mms|com\.coloros\.mms|truecaller)/i },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25d366', match: /^com\.whatsapp(\.w4b)?$/ },
  { id: 'instagram', label: 'Instagram', color: '#e1306c', match: /^com\.instagram\./ },
  { id: 'facebook', label: 'Facebook', color: '#1877f2', match: /^com\.facebook\.(katana|orca|lite|mlite)/ },
  { id: 'telegram', label: 'Telegram', color: '#2aabee', match: /(org\.telegram|org\.thunderdog\.challegram|telegram)/i },
  { id: 'snapchat', label: 'Snapchat', color: '#fffc00', match: /^com\.snapchat\./ },
  { id: 'gmail', label: 'Gmail', color: '#ea4335', match: /^com\.google\.android\.gm$/ },
  { id: 'x', label: 'X / Twitter', color: '#e7e9ea', match: /^com\.twitter\./ },
  { id: 'youtube', label: 'YouTube', color: '#ff0033', match: /^com\.google\.android\.youtube/ }
]
const groupOf = (pkg: string): string | null => GROUPS.find((g) => g.match.test(pkg))?.id ?? null

export function Notifications() {
  const { notifs, conn, settings } = useApp()
  const [replying, setReplying] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const muted: string[] = settings.mutedApps || []

  const apps = useMemo(() => {
    const m = new Map<string, { app: string; pkg: string; count: number; icon?: string }>()
    for (const n of notifs) {
      const x = m.get(n.pkg) || { app: n.app, pkg: n.pkg, count: 0, icon: n.icon }
      x.count++
      m.set(n.pkg, x)
    }
    return [...m.values()].sort((a, b) => b.count - a.count)
  }, [notifs])
  // filter: null = all, "g:<group>" = a kind of app, otherwise one app's package
  const shown = !filter ? notifs : filter.startsWith('g:') ? notifs.filter((n) => groupOf(n.pkg) === filter.slice(2)) : notifs.filter((n) => n.pkg === filter)
  const groupCount = (id: string): number => notifs.filter((n) => groupOf(n.pkg) === id).length
  const otherApps = apps.filter((a) => !groupOf(a.pkg))

  if (!conn.connected) return <Empty icon={Bell} title="Connect your phone" body="Phone notifications show up here and as desktop toasts." />

  return (
    <div className="mx-auto w-full max-w-[1680px]">
      <PageHeader icon={Bell} title="Notifications" subtitle={`${notifs.length} from your phone`}>
        <Button size="sm" variant="soft" icon={CheckCheck} disabled={!notifs.length} onClick={() => call('notifClear')}>Clear all</Button>
      </PageHeader>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Chip active={!filter} onClick={() => setFilter(null)}>All · {notifs.length}</Chip>
        {GROUPS.map((g) => {
          const n = groupCount(g.id)
          const id = 'g:' + g.id
          return (
            <Chip key={g.id} active={filter === id} dim={n === 0} onClick={() => setFilter(filter === id ? null : id)}>
              <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
              {g.label}{n ? ` · ${n}` : ''}
            </Chip>
          )
        })}
        {otherApps.length > 0 && <span className="mx-1 h-5 w-px bg-white/10" />}
        {otherApps.map((a) => (
          <Chip key={a.pkg} active={filter === a.pkg} onClick={() => setFilter(filter === a.pkg ? null : a.pkg)}>
            {a.icon && <img src={`data:image/png;base64,${a.icon}`} className="h-4 w-4" />}
            {a.app} · {a.count}
          </Chip>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty icon={CheckCheck} title={!filter ? 'All caught up' : `Nothing from ${filter.startsWith('g:') ? GROUPS.find((g) => 'g:' + g.id === filter)?.label : apps.find((a) => a.pkg === filter)?.app || 'this app'}`} body="New notifications from your phone will land here." />
      ) : (
        <motion.div layout className="space-y-2.5">
          <AnimatePresence initial={false}>
            {shown.map((n) => (
              <motion.div key={n.key} layout initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }} transition={spring}>
                <Card className="group p-4">
                  <div className="flex gap-3.5">
                    {n.icon ? <img src={`data:image/png;base64,${n.icon}`} className="h-10 w-10 shrink-0 rounded-xl bg-white/5 p-1.5" /> : <Avatar name={n.app} size={40} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{n.app}</span>
                        <span className="text-[11px] text-white/30">{ago(n.time)}</span>
                      </div>
                      <div className="mt-0.5 font-semibold">{n.title}</div>
                      <div className="selectable mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm text-white/70">{n.text}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {n.canReply && <Button size="sm" variant="soft" icon={Reply} onClick={() => { setReplying(replying === n.key ? null : n.key); setText('') }}>Reply</Button>}
                        {(n.actions || []).map((a, i) => (
                          <Button key={a} size="sm" variant="ghost" onClick={() => call('notifAction', n.key, i)}>{a}</Button>
                        ))}
                        <Button size="sm" variant="ghost" icon={BellOff} className="opacity-0 group-hover:opacity-100" onClick={() => call('muteApp', n.pkg, !muted.includes(n.pkg))}>
                          {muted.includes(n.pkg) ? 'Unmute app' : 'Mute app'}
                        </Button>
                      </div>
                      <AnimatePresence>
                        {replying === n.key && (
                          <motion.form
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                            onSubmit={(e) => {
                              e.preventDefault()
                              if (!text.trim()) return
                              call('notifReply', n.key, text)
                              setReplying(null)
                            }}
                          >
                            <div className="mt-3 flex gap-2">
                              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${n.title}`} className="field" />
                              <Button variant="primary" icon={Send} type="submit">Send</Button>
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </div>
                    <button onClick={() => call('notifDismiss', n.key)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/40 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100">
                      <X size={16} />
                    </button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}

function Chip({ active, children, onClick, dim }: { active: boolean; children: React.ReactNode; onClick: () => void; dim?: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.94 }} onClick={onClick} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${active ? 'bg-white/[0.12] text-white ring-white/20' : dim ? 'bg-transparent text-white/30 ring-white/[0.05] hover:text-white/60' : 'bg-white/[0.03] text-white/60 ring-white/[0.06] hover:text-white'}`}>
      {children}
    </motion.button>
  )
}
