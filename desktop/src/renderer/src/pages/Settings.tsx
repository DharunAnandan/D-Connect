import { motion } from 'framer-motion'
import { Bell, Bluetooth, Mic, Cable, Clipboard, Copy, FolderDown, Headphones, Keyboard, Loader2, MousePointer2, Plus, Settings as Cog, Smartphone, Sparkles, Trash2, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Card, PageHeader, Pill, Row, Toggle } from '@/components/ui'
import { call, dc } from '@/lib/api'
import { ago } from '@/lib/format'
import { useApp } from '@/lib/store'
import { list } from '@/theme/motion'

interface Bt {
  platform: string
  adapter: boolean
  powered: boolean
  audioServer: string
  wireplumber: string | null
  hfpConfigured: boolean
  devices: { address: string; name: string; paired: boolean; connected: boolean }[]
  phone: { name: string; address?: string; paired: boolean; connected: boolean; callLink: boolean } | null
  canAutoSetup: boolean
  ready: boolean
}

export function Settings() {
  const { settings, setSetting, devices, conn, info, go } = useApp()
  const [bt, setBt] = useState<Bt | null>(null)
  const [btMsg, setBtMsg] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [progress, setProgress] = useState('')
  const [micSnaps, setMicSnaps] = useState<string[]>([])
  useEffect(() => {
    call<string[]>('snapsNeedingMic').then(setMicSnaps)
  }, [])
  useEffect(() => dc.on('bt.progress', (p: string) => setProgress(p)), [])
  useEffect(() => dc.on('bt.changed', () => refreshBt()), [])
  const [usb, setUsb] = useState<{ devices: { model: string; state: string }[]; available: boolean } | null>(null)

  const refreshBt = (): void => {
    call<Bt>('btStatus').then(setBt)
  }
  useEffect(() => {
    refreshBt()
    call('btSteps').then(setSteps)
    call('inputBackend').then(setInput)
    call('usb').then(setUsb)
  }, [])

  return (
    <motion.div variants={list} initial="initial" animate="animate" className="mx-auto w-full max-w-[1100px] space-y-5">
      <PageHeader icon={Cog} title="Settings" subtitle={info ? `${info.name} · D-Connect ${info.version} · port ${info.port}` : ''} />

      <Section title="Phones" icon={Smartphone}>
        {devices.map((d) => (
          <Row key={d.deviceId} icon={Smartphone} title={d.name} body={`${d.model} · paired ${ago(d.pairedAt)} ago${conn.device?.deviceId === d.deviceId && conn.connected ? '' : ` · last seen ${ago(d.lastSeen)}`}`}>
            {d.active ? (
              <Pill color="mint">In use</Pill>
            ) : (
              <>
                <Pill color={d.online ? 'amber' : 'violet'}>{d.online ? 'Standby' : 'Offline'}</Pill>
                <Button size="sm" variant="soft" onClick={() => call('activateDevice', d.deviceId)}>Use this phone</Button>
              </>
            )}
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => call('forget', d.deviceId)}>Forget</Button>
          </Row>
        ))}
        <div className="py-3">
          <Button size="sm" variant="soft" icon={Plus} onClick={() => go('/pair')}>Pair a phone</Button>
        </div>
      </Section>

      <Section title="Take calls on this PC" icon={Headphones}>
        <div className="py-3 text-sm text-muted">Your PC becomes a Bluetooth hands-free device for {conn.device?.name || 'your phone'}, so call audio comes through the laptop's speakers and mic.</div>
        {!bt ? (
          <div className="shimmer my-3 h-20 rounded-xl" />
        ) : bt.platform !== 'linux' ? (
          <div className="py-3 text-sm text-muted">On Windows you can answer and decline calls here; audio stays on the phone for now.</div>
        ) : (
          <>
            {/* three steps, each ticks green when done */}
            <div className="space-y-2 py-2">
              <Step done={bt.adapter && bt.powered} n={1} title="Bluetooth on" body={bt.adapter ? (bt.powered ? 'Ready' : 'Turned off on this PC') : 'No Bluetooth adapter found'} />
              <Step
                done={bt.hfpConfigured}
                n={2}
                title="Call audio support"
                body={bt.hfpConfigured ? 'Ready. PulseAudio stays your sound system; only D-Connect calls use the hands-free link.' : 'One click sets it up. Your normal sound (PulseAudio) is not changed.'}
              >
                {!bt.hfpConfigured && (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={busy ? Loader2 : Headphones}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      const r = await call<{ ok: boolean; message: string }>('btSetupAudio')
                      setBtMsg(r.message)
                      setProgress('')
                      setBusy(false)
                      refreshBt()
                    }}
                  >
                    {busy ? 'Setting up…' : 'Set up call audio'}
                  </Button>
                )}
              </Step>
              <Step
                done={!!bt.phone?.callLink}
                n={3}
                title={`Connect ${bt.phone?.name || conn.device?.name || 'your phone'}`}
                body={!bt.phone ? 'Connect your phone to D-Connect first' : bt.phone.callLink ? 'Call link open: calls you take here play on this PC' : bt.phone.paired ? 'Paired, but the call link isn\'t open yet' : 'Not paired with this PC over Bluetooth yet'}
              >
                {bt.phone && !bt.phone.callLink && (
                  bt.phone.paired && bt.phone.address ? (
                    <Button size="sm" variant="soft" icon={busy ? Loader2 : Bluetooth} disabled={busy} onClick={async () => { setBusy(true); setBtMsg('Opening the call link…'); const r = await call<{ ok: boolean; message: string }>('btFixCallLink'); setBtMsg(r.message); setBusy(false); refreshBt() }}>Fix call link</Button>
                  ) : (
                    <Button size="sm" variant="soft" icon={Bluetooth} onClick={async () => { setBtMsg(''); const r = await call<{ ok: boolean; message?: string }>('btPairPhone'); if (!r.ok) setBtMsg(r.message || 'Could not start pairing') }}>Pair</Button>
                  )
                )}
              </Step>
            </div>
            {bt.audioServer === 'pipewire' && micSnaps.length > 0 && (
              <div className="my-2 flex items-center gap-3 rounded-xl bg-amber/[0.08] p-3 ring-1 ring-amber/25">
                <Mic size={16} className="shrink-0 text-amber" />
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-amber">{micSnaps.join(', ')} can't use the microphone</div>
                  <div className="text-muted">With PipeWire, snap apps need the “audio-record” permission. One click grants it.</div>
                </div>
                <Button size="sm" variant="soft" onClick={async () => { const r = await call<{ message: string }>('fixSnapMics'); setBtMsg(r.message); setMicSnaps(await call('snapsNeedingMic')) }}>Fix microphone</Button>
              </div>
            )}
            {(btMsg || progress) && <div className="pb-2 text-xs text-cyan-soft">{btMsg || progress}</div>}
            {!bt.hfpConfigured && (
              <details className="mb-3 rounded-xl bg-white/[0.03] px-4 py-2 text-xs ring-1 ring-white/[0.06]">
                <summary className="cursor-pointer py-1 text-white/50">Prefer the terminal? Show the commands</summary>
                <ol className="space-y-1.5 py-2">
                  {steps.map((st, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 text-white/40">{i + 1}.</span>
                      <code className="selectable flex-1 rounded-md bg-black/30 px-2 py-1 font-mono text-[11.5px] text-white/80">{st}</code>
                      {(st.startsWith('sudo') || st.startsWith('systemctl')) && (
                        <button onClick={() => navigator.clipboard.writeText(st)} className="mt-0.5 text-white/40 hover:text-white"><Copy size={13} /></button>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
      </Section>

      <Section title="Call voice" icon={Mic}>
        <Row icon={Sparkles} title="AI noise removal" body="On calls taken on this PC, an AI filter (RNNoise) keeps your voice and removes background voices, traffic, fans and typing.">
          <Toggle on={settings.callNoiseAi !== false} onChange={(v) => setSetting('callNoiseAi', v)} />
        </Row>
        {settings.callNoiseAi !== false && (
          <Row icon={Mic} title="Strength" body="Strong removes more noise; if the start of your words gets cut, go lighter. Applies from the next call.">
            <div className="flex rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
              {[{ v: 40, l: 'Light' }, { v: 60, l: 'Normal' }, { v: 80, l: 'Strong' }].map((o) => (
                <button key={o.v} onClick={() => setSetting('callNoiseVad', o.v)} className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${Number(settings.callNoiseVad ?? 60) === o.v ? 'bg-white text-ink-950' : 'text-white/60 hover:text-white'}`}>{o.l}</button>
              ))}
            </div>
          </Row>
        )}
      </Section>

      <Section title="Connection" icon={Cable}>
        <Row icon={Cable} title="USB connection" body={usb?.available === false ? 'adb was not found. Install Android platform-tools to use USB.' : usb?.devices.length ? `Phone on USB: ${usb.devices.map((d) => `${d.model} (${d.state})`).join(', ')}` : 'Plug the phone in with USB debugging on, and it connects over the cable.'}>
          <Toggle on={settings.usbAuto !== false} onChange={(v) => setSetting('usbAuto', v)} />
        </Row>
        <Row icon={Sparkles} title="Certificate fingerprint" body={info?.fingerprint ? info.fingerprint.match(/.{1,4}/g)!.slice(0, 8).join(' ') + ' …' : ''} />
      </Section>

      <Section title="Notifications & clipboard" icon={Bell}>
        <Row icon={Bell} title="Desktop toasts" body="Show phone notifications in the corner of your screen.">
          <Toggle on={settings.notifyToasts !== false} onChange={(v) => setSetting('notifyToasts', v)} />
        </Row>
        <Row icon={Smartphone} title="Open notifications in an app window" body="Clicking a phone notification opens that app here, right at that chat or post (needs USB debugging, like Apps).">
          <Toggle on={settings.notifOpenInWindow !== false} onChange={(v) => setSetting('notifOpenInWindow', v)} />
        </Row>
        <Row icon={Clipboard} title="Shared clipboard" body="Copy on one, paste on the other.">
          <Toggle on={settings.clipboardSync !== false} onChange={(v) => setSetting('clipboardSync', v)} />
        </Row>
        <Row icon={FolderDown} title="Accept files automatically" body="Otherwise you're asked for each one.">
          <Toggle on={settings.autoAcceptFiles !== false} onChange={(v) => setSetting('autoAcceptFiles', v)} />
        </Row>
        {(settings.mutedApps || []).length > 0 && (
          <Row icon={Bell} title="Muted apps" body={(settings.mutedApps as string[]).join(', ')}>
            <Button size="sm" variant="ghost" onClick={() => setSetting('mutedApps', [])}>Unmute all</Button>
          </Row>
        )}
      </Section>

      <Section title="Phone as remote" icon={MousePointer2}>
        <Row icon={Keyboard} title="Input method" body={input === 'uinput' ? 'Virtual input device (works on Wayland and X11)' : input === 'xdotool' ? 'xdotool (X11 only)' : input === 'sendinput' ? 'Windows SendInput' : 'Not available: allow access to /dev/uinput, or install xdotool on X11.'}>
          <Pill color={input && input !== 'none' ? 'mint' : 'rose'}>{input || '…'}</Pill>
        </Row>
      </Section>

      <Section title="Experience" icon={Sparkles}>
        <Row icon={Sparkles} title="Theme" body="Colours for the whole app, pop-ups and call card.">
          <div className="flex gap-2">
            {THEMES.map((t) => {
              const on = (settings.theme || 'aurora') === t.id
              return (
                <button key={t.id} title={t.label} onClick={() => setSetting('theme', t.id)} className={`flex flex-col items-center gap-1 rounded-2xl p-1.5 transition ${on ? 'bg-white/[0.08] ring-2 ring-white/70' : 'hover:bg-white/[0.05]'}`}>
                  <span className="h-8 w-12 rounded-xl ring-1 ring-white/10" style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]} 55%, ${t.colors[2]}), ${t.bg}` }} />
                  <span className={`text-[10.5px] font-semibold ${on ? 'text-white' : 'text-white/55'}`}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </Row>
        <Row icon={Volume2} title="Sounds" body="Soft chimes for connecting, notifications and messages.">
          <Toggle on={settings.sounds !== false} onChange={(v) => setSetting('sounds', v)} />
        </Row>
        <Row icon={Sparkles} title="Reduce motion" body="Turn the animations right down.">
          <Toggle on={!!settings.reducedMotion} onChange={(v) => setSetting('reducedMotion', v)} />
        </Row>
        <Row icon={Sparkles} title="Start hidden in the tray" body="Open from the tray icon when you need it.">
          <Toggle on={!!settings.launchHidden} onChange={(v) => setSetting('launchHidden', v)} />
        </Row>
      </Section>
    </motion.div>
  )
}

// the colour themes (see index.css [data-theme]); swatch colours only
const THEMES = [
  { id: 'aurora', label: 'Aurora', colors: ['#7c5cff', '#35e0ff', '#3ddc97'], bg: '#070a14' },
  { id: 'sunset', label: 'Sunset', colors: ['#ff6b6b', '#ffb347', '#ffd666'], bg: '#14090f' },
  { id: 'ocean', label: 'Ocean', colors: ['#3884ff', '#2dd4bf', '#5eead4'], bg: '#040c1a' },
  { id: 'forest', label: 'Forest', colors: ['#34d399', '#a3e635', '#6ee7b7'], bg: '#060e0a' },
  { id: 'graphite', label: 'Graphite', colors: ['#a0aabe', '#e2e8f0', '#86efac'], bg: '#0c0c0f' }
]

function Step({ n, done, title, body, children }: { n: number; done: boolean; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.05]">
      <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${done ? 'bg-mint text-ink-950' : 'bg-white/10 text-white/60'}`}>{done ? '✓' : n}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted">{body}</div>
      </div>
      {children}
    </div>
  )
}

function Section({ title, icon: I, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card className="px-6 pb-2 pt-5">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-widest text-white/50"><I size={14} /> {title}</h3>
      <div className="divide-y divide-white/[0.06]">{children}</div>
    </Card>
  )
}
