import { AnimatePresence, motion } from 'framer-motion'
import { MessageSquare, PenSquare, RefreshCw, Search, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SmsMessage, SmsThread } from '@shared/protocol'
import { Avatar, Button, Card, Empty, IconButton } from '@/components/ui'
import { call, useEvent } from '@/lib/api'
import { ago, clock } from '@/lib/format'
import { sfx } from '@/lib/sfx'
import { useApp } from '@/lib/store'
import { spring } from '@/theme/motion'

export function Messages() {
  const connected = useApp((s) => s.conn.connected)
  const [threads, setThreads] = useState<SmsThread[] | null>(null)
  const [active, setActive] = useState<SmsThread | null>(null)
  const [msgs, setMsgs] = useState<SmsMessage[]>([])
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const [composeTo, setComposeTo] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const loadThreads = useCallback(() => {
    if (!connected) return
    call<{ threads: SmsThread[] }>('smsThreads').then((r) => setThreads(r.threads)).catch(() => setThreads([]))
  }, [connected])
  useEffect(loadThreads, [loadThreads])

  const open = (t: SmsThread): void => {
    setActive(t)
    setComposeTo(null)
    setMsgs([])
    call<{ messages: SmsMessage[] }>('smsMessages', t.threadId).then((r) => setMsgs(r.messages)).catch(() => {})
  }
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  useEvent(
    'sms.received',
    useCallback(
      (m: SmsMessage) => {
        loadThreads()
        if (active && m.threadId === active.threadId) setMsgs((x) => [...x, m])
      },
      [active, loadThreads]
    )
  )

  const send = async (): Promise<void> => {
    const body = text.trim()
    const address = composeTo || active?.address
    if (!body || !address) return
    setText('')
    const optimistic: SmsMessage = { id: 'tmp' + Date.now(), threadId: active?.threadId || '', address, body, date: Date.now(), out: true }
    setMsgs((x) => [...x, optimistic])
    sfx.sent()
    await call('smsSend', address, body).catch(() => {})
    setTimeout(loadThreads, 800)
  }

  const shown = useMemo(() => (threads || []).filter((t) => !q || (t.name || t.address).toLowerCase().includes(q.toLowerCase()) || t.snippet.toLowerCase().includes(q.toLowerCase())), [threads, q])

  if (!connected) return <Empty icon={MessageSquare} title="Connect your phone" body="Your text messages show up here once your phone is connected." />

  return (
    <div className="mx-auto flex h-full max-w-6xl gap-5 pb-2">
      {/* threads */}
      <Card className="flex w-[340px] shrink-0 flex-col overflow-hidden">
        <div className="flex items-center gap-2 p-4 pb-3">
          <h2 className="flex-1 text-xl font-bold tracking-tight">Messages</h2>
          <IconButton icon={RefreshCw} label="Refresh" onClick={loadThreads} />
          <IconButton icon={PenSquare} label="New message" onClick={() => { setActive(null); setMsgs([]); setComposeTo('') }} />
        </div>
        <div className="relative mx-4 mb-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="field pl-9" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {threads === null
            ? Array.from({ length: 7 }).map((_, i) => <div key={i} className="shimmer m-2 h-14 rounded-xl" />)
            : shown.map((t, i) => (
                <motion.button
                  key={t.threadId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: Math.min(i, 12) * 0.025 }}
                  onClick={() => open(t)}
                  className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active?.threadId === t.threadId ? '' : 'hover:bg-white/[0.04]'}`}
                >
                  {active?.threadId === t.threadId && <motion.span layoutId="thread-active" transition={spring} className="absolute inset-0 rounded-xl bg-[linear-gradient(120deg,rgba(124,92,255,0.22),rgba(53,224,255,0.08))] ring-1 ring-white/10" />}
                  <div className="relative"><Avatar name={t.name || t.address} size={42} /></div>
                  <div className="relative min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${t.unread ? 'font-bold' : 'font-semibold'}`}>{t.name || t.address}</span>
                      <span className="shrink-0 text-[11px] text-white/40">{ago(t.date)}</span>
                    </div>
                    <div className={`truncate text-[13px] ${t.unread ? 'text-white/85' : 'text-muted'}`}>{t.snippet}</div>
                  </div>
                  {t.unread > 0 && <span className="relative h-2.5 w-2.5 rounded-full bg-cyan shadow-[0_0_8px_#35e0ff]" />}
                </motion.button>
              ))}
        </div>
      </Card>

      {/* conversation */}
      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {active || composeTo !== null ? (
          <>
            <div className="flex items-center gap-3 border-b hairline px-5 py-3.5">
              {composeTo !== null ? (
                <input autoFocus value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="To: phone number" className="field" />
              ) : (
                <>
                  <Avatar name={active!.name || active!.address} size={38} />
                  <div>
                    <div className="font-semibold">{active!.name || active!.address}</div>
                    <div className="text-xs text-muted">{active!.name ? active!.address : 'SMS'}</div>
                  </div>
                </>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-4">
              <AnimatePresence initial={false}>
                {msgs.map((m, i) => {
                  const showTime = i === 0 || m.date - msgs[i - 1].date > 15 * 60000
                  return (
                    <motion.div key={m.id} layout initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring}>
                      {showTime && <div className="my-3 text-center text-[11px] text-white/35">{new Date(m.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {clock(m.date)}</div>}
                      <div className={`flex ${m.out ? 'justify-end' : 'justify-start'}`}>
                        <div className={`selectable max-w-[70%] whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-[14px] leading-snug ${m.out ? 'rounded-br-md bg-[linear-gradient(135deg,#7c5cff,#4b9dff)] text-white shadow-[0_6px_20px_-8px_rgba(124,92,255,0.8)]' : 'rounded-bl-md bg-white/[0.07] text-white/90'}`}>
                          {m.body}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              <div ref={bottom} />
            </div>
            <div className="flex items-end gap-2 border-t hairline p-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                rows={1}
                placeholder="Text message"
                className="field max-h-32 min-h-[44px] resize-none py-3"
              />
              <motion.button whileTap={{ scale: 0.85 }} whileHover={{ scale: 1.06 }} disabled={!text.trim()} onClick={send} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#7c5cff,#35e0ff)] text-ink-950 shadow-[0_6px_20px_-6px_rgba(53,224,255,0.7)] disabled:opacity-30">
                <Send size={18} />
              </motion.button>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center">
            <Empty icon={MessageSquare} title="Pick a conversation" body="Or start a new one. Messages go out from your phone's SIM.">
              <Button variant="primary" icon={PenSquare} onClick={() => setComposeTo('')}>New message</Button>
            </Empty>
          </div>
        )}
      </Card>
    </div>
  )
}
