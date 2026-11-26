// Live phone screen. H.264 Annex-B frames from the phone's hardware encoder are decoded by
// WebCodecs and drawn to a canvas; the mouse becomes touches, the keyboard becomes typing.
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, ChevronLeft, Circle, Hand, Home as HomeIcon, Loader2, MonitorSmartphone, Power, Square, StopCircle, Volume1, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, Card, Empty, IconButton, PageHeader, Segmented } from '@/components/ui'
import { call, dc, useLive } from '@/lib/api'
import { useApp } from '@/lib/store'

type MirrorState = { state: 'off' | 'starting' | 'on' | 'denied' | 'error'; width?: number; height?: number; message?: string; control?: boolean }

function codecFromSps(config: Uint8Array): string {
  // find the SPS NAL (type 7) after a start code and read profile / constraints / level
  for (let i = 0; i < config.length - 4; i++) {
    const sc3 = config[i] === 0 && config[i + 1] === 0 && config[i + 2] === 1
    if (!sc3) continue
    const nal = config[i + 3]
    if ((nal & 0x1f) === 7) {
      const h = (b: number): string => b.toString(16).padStart(2, '0')
      return `avc1.${h(config[i + 4])}${h(config[i + 5])}${h(config[i + 6])}`
    }
  }
  return 'avc1.42E01F'
}

export function Mirror() {
  const connected = useApp((s) => s.conn.connected)
  const [m] = useLive<MirrorState>(null, 'mirror', { state: 'off' })
  const [control, setControl] = useState<boolean | null>(null)
  useEffect(() => setControl(m.state === 'on' ? (m.control ?? null) : null), [m.state, m.control])
  useEffect(() => dc.on('mirror.control', (v: boolean) => setControl(v)), [])
  const [quality, setQuality] = useState<'smooth' | 'sharp' | 'max'>('sharp')
  const [fps, setFps] = useState(0)
  const [recording, setRecording] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)

  // ---------------------------------------------------------------- decode
  useEffect(() => {
    let decoder: VideoDecoder | null = null
    let config: Uint8Array | null = null
    let frames = 0
    let waitingKey = true
    let askedAt = 0
    const fpsTimer = setInterval(() => {
      setFps(frames)
      frames = 0
    }, 1000)

    const setup = (cfg: Uint8Array): void => {
      decoder?.close()
      config = cfg
      waitingKey = true
      decoder = new VideoDecoder({
        output: (frame) => {
          const c = canvas.current
          if (c) {
            if (c.width !== frame.displayWidth || c.height !== frame.displayHeight) {
              c.width = frame.displayWidth
              c.height = frame.displayHeight
            }
            c.getContext('2d')!.drawImage(frame, 0, 0)
          }
          frame.close()
          frames++
        },
        error: () => {
          waitingKey = true
          call('mirrorKeyframe')
        }
      })
      const decoderConfig: VideoDecoderConfig = { codec: codecFromSps(cfg), optimizeForLatency: true }
      try {
        decoder.configure(decoderConfig)
      } catch {
        decoder.configure({ codec: 'avc1.42E01F', optimizeForLatency: true })
      }
      call('mirrorKeyframe') // start from a clean picture
    }

    const off = dc.onVideo((h, payload) => {
      const data = new Uint8Array(payload)
      if (h.config) return setup(data)
      if (!decoder || decoder.state !== 'configured') {
        // frames without stream headers yet: ask the phone to send them (and a keyframe) again
        if (performance.now() - askedAt > 1000) {
          askedAt = performance.now()
          call('mirrorKeyframe')
        }
        return
      }
      if (waitingKey && !h.key) return
      let chunkData = data
      if (h.key && config) {
        // Annex-B with no description: SPS/PPS must ride along with each keyframe
        chunkData = new Uint8Array(config.length + data.length)
        chunkData.set(config)
        chunkData.set(data, config.length)
      }
      waitingKey = false
      if (decoder.decodeQueueSize > 6) return // falling behind: drop until it catches up
      decoder.decode(new EncodedVideoChunk({ type: h.key ? 'key' : 'delta', timestamp: h.pts || 0, data: chunkData }))
    })
    return () => {
      off()
      clearInterval(fpsTimer)
      decoder?.close()
    }
  }, [])

  // stop mirroring when leaving the page
  useEffect(() => () => void call('mirrorStop'), [])

  const start = (): void => {
    const q = { smooth: { maxSize: 1280, bitrate: 4_000_000, fps: 60 }, sharp: { maxSize: 1600, bitrate: 8_000_000, fps: 60 }, max: { maxSize: 2400, bitrate: 16_000_000, fps: 60 } }[quality]
    call('mirrorStart', q)
  }

  // ---------------------------------------------------------------- input
  const pos = (e: React.PointerEvent | React.WheelEvent): { x: number; y: number } => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const down = useRef(false)
  const lastMove = useRef(0)
  const onPointer = (action: 'down' | 'move' | 'up') => (e: React.PointerEvent) => {
    if (action === 'down') {
      down.current = true
      canvas.current!.setPointerCapture(e.pointerId)
      canvas.current!.focus()
    }
    if (action === 'move') {
      if (!down.current) return
      const now = performance.now()
      if (now - lastMove.current < 12) return
      lastMove.current = now
    }
    if (action === 'up') down.current = false
    if (e.button === 2 && action === 'down') return void call('inputKey', 'back')
    call('inputTouch', { action, ...pos(e) })
  }
  const onWheel = (e: React.WheelEvent): void => {
    call('inputScroll', { ...pos(e), dy: e.deltaY })
  }
  const onKey = (e: React.KeyboardEvent): void => {
    e.preventDefault()
    if (e.key === 'Escape') call('inputKey', 'back')
    else if (e.key === 'Backspace') call('inputKey', 'backspace')
    else if (e.key === 'Enter') call('inputKey', 'enter')
    else if (e.key === 'Home' && e.ctrlKey) call('inputKey', 'home')
    else if ((e.ctrlKey || e.metaKey) && e.key === 'v') navigator.clipboard.readText().then((t) => t && call('inputText', t))
    else if (e.key.length === 1 && !e.ctrlKey && !e.altKey) call('inputText', e.key)
  }

  // ---------------------------------------------------------------- capture
  const screenshot = (): void => {
    canvas.current?.toBlob((b) => b && download(b, `phone-${stamp()}.png`), 'image/png')
  }
  const toggleRecord = (): void => {
    if (recording) {
      recorder.current?.stop()
      return
    }
    const stream = canvas.current!.captureStream(60)
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 10_000_000 })
    const parts: Blob[] = []
    rec.ondataavailable = (e) => parts.push(e.data)
    rec.onstop = () => {
      download(new Blob(parts, { type: 'video/webm' }), `phone-${stamp()}.webm`)
      setRecording(false)
    }
    rec.start(1000)
    recorder.current = rec
    setRecording(true)
  }

  if (!connected) return <Empty icon={MonitorSmartphone} title="Connect your phone" body="See and control your phone's screen from here." />

  const on = m.state === 'on'
  return (
    <div className="mx-auto flex h-full w-full max-w-[1680px] flex-col">
      <PageHeader icon={MonitorSmartphone} title="Phone screen" subtitle={on ? `${m.width}×${m.height} · ${fps} fps · click to tap, scroll to swipe, type to type` : 'Mirror and control your phone with your mouse and keyboard'}>
        {!on && <Segmented value={quality} onChange={setQuality} options={[{ value: 'smooth', label: 'Smooth' }, { value: 'sharp', label: 'Sharp' }, { value: 'max', label: 'Max' }]} />}
        {on ? (
          <Button variant="danger" icon={Square} onClick={() => call('mirrorStop')}>Stop</Button>
        ) : (
          <Button variant="primary" icon={m.state === 'starting' ? Loader2 : MonitorSmartphone} disabled={m.state === 'starting'} onClick={start}>
            {m.state === 'starting' ? 'Accept on your phone…' : 'Start mirroring'}
          </Button>
        )}
      </PageHeader>

      <AnimatePresence>
        {on && control === false && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-4 flex items-center gap-4 rounded-2xl bg-amber/[0.08] p-4 ring-1 ring-amber/25">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber/15 text-amber"><Hand size={18} /></div>
            <div className="flex-1 text-sm">
              <div className="font-semibold text-amber">View only: Screen control is off on your phone</div>
              <div className="text-muted">Turn on <b>D-Connect screen control</b> in the phone's Accessibility settings to tap, swipe and type from here. If Android says it's restricted, open App info → ⋮ → Allow restricted settings first.</div>
            </div>
            <Button size="sm" variant="soft" onClick={() => call('openPhoneSetting', 'accessibility')}>Open on phone</Button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-5">
        <div className="relative flex h-full min-h-0 items-center justify-center">
          <motion.div
            animate={{ opacity: on ? 1 : 0.6, scale: on ? 1 : 0.97 }}
            className="relative h-full max-h-[calc(100vh-200px)] rounded-[38px] bg-[linear-gradient(160deg,#2a3360,#0f1328)] p-[10px] shadow-[0_30px_80px_-20px_rgb(var(--c-violet)/0.5)] ring-1 ring-white/15"
            style={{ aspectRatio: m.width && m.height ? `${m.width} / ${m.height}` : '9 / 19.5' }}
          >
            <canvas
              ref={canvas}
              tabIndex={0}
              onPointerDown={onPointer('down')}
              onPointerMove={onPointer('move')}
              onPointerUp={onPointer('up')}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={onWheel}
              onKeyDown={onKey}
              className="h-full w-full cursor-pointer rounded-[30px] bg-black object-contain outline-none"
            />
            <AnimatePresence>
              {!on && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-[10px] grid place-items-center rounded-[30px] bg-ink-950/80 text-center">
                  <div className="px-6">
                    {m.state === 'starting' ? <Loader2 size={34} className="mx-auto mb-3 animate-spin text-cyan" /> : <MonitorSmartphone size={34} className="mx-auto mb-3 text-white/40" />}
                    <div className="text-sm text-white/70">
                      {m.state === 'denied' ? 'Screen sharing was declined on the phone.' : m.state === 'error' ? m.message || 'The phone could not start the encoder.' : m.state === 'starting' ? 'Tap “Start now” on your phone' : 'Not mirroring'}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <Card className="flex flex-col gap-1.5 p-2">
          <IconButton icon={ChevronLeft} label="Back (Esc / right-click)" onClick={() => call('inputKey', 'back')} disabled={!on} />
          <IconButton icon={HomeIcon} label="Home" onClick={() => call('inputKey', 'home')} disabled={!on} />
          <IconButton icon={Square} label="Recent apps" onClick={() => call('inputKey', 'recents')} disabled={!on} />
          <div className="my-1 h-px bg-white/10" />
          <IconButton icon={Volume2} label="Volume up" onClick={() => call('inputKey', 'volup')} disabled={!on} />
          <IconButton icon={Volume1} label="Volume down" onClick={() => call('inputKey', 'voldown')} disabled={!on} />
          <IconButton icon={Power} label="Lock screen" onClick={() => call('inputKey', 'lock')} disabled={!on} />
          <div className="my-1 h-px bg-white/10" />
          <IconButton icon={Camera} label="Screenshot" onClick={screenshot} disabled={!on} />
          <IconButton icon={recording ? StopCircle : Circle} label={recording ? 'Stop recording' : 'Record'} active={recording} className={recording ? '!text-rose' : ''} onClick={toggleRecord} disabled={!on} />
        </Card>
      </div>
    </div>
  )
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}
function download(b: Blob, name: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(b)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
