import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Coffee, Link2, Lock, Moon, MoonStar, Music2, Pause, Play, Plus, Radar, Send, ShieldCheck, SkipBack, SkipForward, Sparkles, Terminal, Trash2, Type, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { QuickCommand } from '@shared/protocol'
import { Button, Card, Empty, PageHeader, Row, Toggle } from '@/components/ui'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'
import { list } from '@/theme/motion'

const ICONS: Record<string, any> = { lock: Lock, moon: Moon, 'volume-x': VolumeX, camera: Camera, coffee: Coffee, terminal: Terminal }

export function Extras() {
  const { conn, settings, setSetting, pcMedia, status } = useApp()
  const [ringing, setRinging] = useState(false)
  const [link, setLink] = useState('')
  const [commands, setCommands] = useState<QuickCommand[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', cmd: '' })

  useEffect(() => {
    call<QuickCommand[]>('commands').then(setCommands)
  }, [])

  if (!conn.connected) return <Empty icon={Sparkles} title="Connect your phone" body="Find your phone, share links, run PC actions from your phone and more." />

  const ring = (): void => {
    const on = !ringing
    setRinging(on)
    call('findPhone', on)
    if (on) setTimeout(() => setRinging(false), 30000)
  }
  const share = (): void => {
    const v = link.trim()
    if (!v) return
    if (/^https?:\/\//i.test(v) || /^[\w-]+\.[\w.-]+(\/|$)/.test(v)) call('shareUrl', /^https?:/i.test(v) ? v : `https://${v}`)
    else call('shareText', v)
    setLink('')
  }

  return (
    <motion.div variants={list} initial="initial" animate="animate" className="mx-auto w-full max-w-[1680px]">
      <PageHeader icon={Sparkles} title="Extras" subtitle="The things Phone Link doesn't do" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* find my phone */}
        <Card className="relative overflow-hidden p-6">
          <div className="flex items-center gap-5">
            <div className="relative grid h-24 w-24 place-items-center">
              {ringing && [0, 1, 2].map((i) => <motion.span key={i} className="absolute inset-0 rounded-full border-2 border-pink" initial={{ scale: 0.6, opacity: 0.8 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.5 }} />)}
              <motion.button whileTap={{ scale: 0.9 }} animate={ringing ? { rotate: [0, -12, 12, -12, 12, 0] } : {}} transition={ringing ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.4 } : {}} onClick={ring} className="relative grid h-20 w-20 place-items-center rounded-full bg-[linear-gradient(135deg,#ff5ca8,#7c5cff)] shadow-[0_12px_40px_-8px_rgba(255,92,168,0.8)]">
                <Radar size={32} />
              </motion.button>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Find my phone</h3>
              <p className="mt-1 text-sm text-muted">Rings at full volume, even on silent or Do Not Disturb.</p>
              <Button className="mt-3" size="sm" variant={ringing ? 'danger' : 'soft'} onClick={ring}>{ringing ? 'Stop ringing' : 'Ring it'}</Button>
            </div>
          </div>
        </Card>

        {/* share */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold"><Link2 size={18} className="text-cyan" /> Continue on phone</h3>
          <p className="mt-1 text-sm text-muted">Send a link (opens on the phone) or any text (lands on its clipboard).</p>
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); share() }}>
            <div className="relative flex-1">
              <Type size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… or any text" className="field pl-9" />
            </div>
            <Button variant="primary" icon={Send} type="submit">Send</Button>
          </form>
        </Card>

        {/* PC actions from the phone */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Terminal size={18} className="text-violet-soft" /> PC actions</h3>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(!adding)}>Add</Button>
          </div>
          <p className="mt-1 text-sm text-muted">These appear on your phone as one-tap buttons.</p>
          <AnimatePresence>
            {adding && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!draft.name || !draft.cmd) return
                  await call('saveCommand', { ...draft, icon: 'terminal' })
                  setCommands(await call('commands'))
                  setDraft({ name: '', cmd: '' })
                  setAdding(false)
                }}
              >
                <div className="mt-3 grid grid-cols-[1fr_1.4fr_auto] gap-2">
                  <input className="field" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  <input className="field font-mono text-xs" placeholder="Shell command" value={draft.cmd} onChange={(e) => setDraft({ ...draft, cmd: e.target.value })} />
                  <Button variant="primary" type="submit">Save</Button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {commands.map((c) => {
              const I = ICONS[c.icon] || Terminal
              return (
                <motion.div key={c.id} whileHover={{ y: -2 }} className="group relative">
                  <button onClick={() => call('runCommand', c.id)} className="flex w-full flex-col items-center gap-2 rounded-xl bg-white/[0.04] px-2 py-3 text-xs font-medium ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]">
                    <I size={18} className="text-violet-soft" />
                    <span className="truncate">{c.name}</span>
                  </button>
                  {!c.builtin && (
                    <button onClick={async () => { await call('deleteCommand', c.id); setCommands(await call('commands')) }} className="absolute right-1 top-1 hidden h-6 w-6 place-items-center rounded-md bg-rose/80 group-hover:grid">
                      <Trash2 size={12} />
                    </button>
                  )}
                </motion.div>
              )
            })}
          </div>
        </Card>

        {/* PC media for the phone remote */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold"><Music2 size={18} className="text-pink" /> Playing on this PC</h3>
          <p className="mt-1 text-sm text-muted">Your phone shows these as a remote, with lock-screen controls.</p>
          <div className="mt-4 space-y-2">
            {pcMedia.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Nothing playing on the PC</p>
            ) : (
              pcMedia.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
                  {p.art ? <img src={p.art} className="h-11 w-11 rounded-lg object-cover" /> : <div className="grid h-11 w-11 place-items-center rounded-lg bg-pink/20"><Music2 size={18} /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.title}</div>
                    <div className="truncate text-xs text-muted">{p.artist} · {p.app}</div>
                  </div>
                  <button onClick={() => call('mediaPcCmd', p.id, 'prev')} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"><SkipBack size={15} /></button>
                  <button onClick={() => call('mediaPcCmd', p.id, 'toggle')} className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink-950">{p.playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
                  <button onClick={() => call('mediaPcCmd', p.id, 'next')} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"><SkipForward size={15} /></button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* toggles */}
        <Card className="divide-y lg:col-span-2 divide-white/[0.06] px-6 py-2">
          <Row icon={Music2} title="Play phone audio on this PC" body="Spotify, YouTube and other phone sounds come out of this PC's speaker.">
            <Toggle on={settings.phoneAudioOnPc !== false} onChange={(v) => setSetting('phoneAudioOnPc', v)} />
          </Row>
          <Row icon={ShieldCheck} title="Proximity lock" body={`Lock this PC when your phone leaves (disconnects for ${settings.proximityGraceSec ?? 20}s).`}>
            <Toggle on={!!settings.proximityLock} onChange={(v) => setSetting('proximityLock', v)} />
          </Row>
          <Row icon={MoonStar} title="Phone Do Not Disturb" body={status?.dnd ? 'On right now' : 'Silence the phone from here'}>
            <Toggle on={!!status?.dnd} onChange={(v) => call('setPhoneDnd', v)} />
          </Row>
          <Row icon={MoonStar} title="Sync focus mode" body="When the phone goes into Do Not Disturb, desktop toasts pause too.">
            <Toggle on={!!settings.dndSync} onChange={(v) => setSetting('dndSync', v)} />
          </Row>
        </Card>
      </div>
    </motion.div>
  )
}
