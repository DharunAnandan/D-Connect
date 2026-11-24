import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownToLine, ArrowUpFromLine, Check, File, FolderOpen, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Empty, PageHeader, Ring } from '@/components/ui'
import { call, dc, useLive } from '@/lib/api'
import { size } from '@/lib/format'
import { useApp } from '@/lib/store'
import { spring } from '@/theme/motion'

interface Transfer {
  fid: string
  name: string
  size: number
  done: number
  dir: 'in' | 'out'
  state: 'waiting' | 'active' | 'done' | 'failed' | 'cancelled'
  speed: number
  path?: string
}

export function Files() {
  const connected = useApp((s) => s.conn.connected)
  const [transfers] = useLive<Transfer[]>('transfers', 'transfers', [])
  const [over, setOver] = useState(false)

  const sendList = (files: FileList | null): void => {
    if (!files?.length) return
    const paths = [...files].map((f) => dc.pathForFile(f)).filter(Boolean)
    call('sendFiles', paths)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader icon={FolderOpen} title="Files" subtitle="Drop anything here to send it to your phone. Files from your phone land in Downloads/D-Connect.">
        <Button size="sm" variant="soft" icon={FolderOpen} onClick={() => call('openDownloads')}>Open folder</Button>
      </PageHeader>

      <motion.label
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (connected) sendList(e.dataTransfer.files)
        }}
        animate={{ scale: over ? 1.015 : 1 }}
        transition={spring}
        className={`relative mb-6 flex h-52 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed transition-colors ${over ? 'border-cyan bg-cyan/[0.07]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'} ${connected ? '' : 'pointer-events-none opacity-50'}`}
      >
        <input type="file" multiple className="hidden" onChange={(e) => sendList(e.target.files)} />
        <motion.div animate={over ? { y: -8, scale: 1.12 } : { y: [0, -5, 0] }} transition={over ? spring : { duration: 3, repeat: Infinity }} className="mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-[linear-gradient(135deg,#7c5cff,#35e0ff)] text-ink-950 shadow-[0_12px_40px_-8px_rgba(53,224,255,0.7)]">
          <Upload size={28} />
        </motion.div>
        <div className="font-semibold">{over ? 'Let go to send' : 'Drop files to send'}</div>
        <div className="mt-1 text-sm text-muted">or click to choose · any size</div>
        {over && <motion.div layoutId="drop-glow" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(53,224,255,0.18),transparent_60%)]" />}
      </motion.label>

      {transfers.length === 0 ? (
        <Empty icon={File} title="No transfers yet" body="Share a file to D-Connect from your phone's share sheet, or drop one above." />
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {transfers.map((t) => {
              const pct = t.size ? t.done / t.size : 0
              const done = t.state === 'done'
              const bad = t.state === 'failed' || t.state === 'cancelled'
              return (
                <motion.div key={t.fid} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                  <Card className="flex items-center gap-4 p-4">
                    <Ring value={done ? 1 : pct} size={50} stroke={5} colors={bad ? ['#f87171', '#ff5ca8'] : done ? ['#3ddc97', '#8be9ff'] : ['#7c5cff', '#35e0ff']}>
                      <AnimatePresence mode="wait">
                        {done ? (
                          <motion.span key="d" initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-mint"><Check size={20} strokeWidth={3} /></motion.span>
                        ) : bad ? (
                          <X size={18} className="text-rose" />
                        ) : t.dir === 'in' ? (
                          <ArrowDownToLine size={17} className="text-cyan-soft" />
                        ) : (
                          <ArrowUpFromLine size={17} className="text-violet-soft" />
                        )}
                      </AnimatePresence>
                    </Ring>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{t.name}</div>
                      <div className="text-xs text-muted">
                        {t.dir === 'in' ? 'From phone' : 'To phone'} · {done ? size(t.size) : bad ? t.state : t.state === 'waiting' ? 'Waiting for the phone…' : `${size(t.done)} of ${size(t.size)} · ${size(t.speed)}/s`}
                      </div>
                    </div>
                    {t.state === 'active' && <Button size="sm" variant="ghost" onClick={() => call('fileAction', 'cancel', t.fid)}>Cancel</Button>}
                    {done && t.dir === 'in' && (
                      <>
                        <Button size="sm" variant="soft" onClick={() => call('fileAction', 'open', t.fid)}>Open</Button>
                        <Button size="sm" variant="ghost" onClick={() => call('fileAction', 'show', t.fid)}>Show</Button>
                      </>
                    )}
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
