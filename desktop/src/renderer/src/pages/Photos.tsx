import { AnimatePresence, motion } from 'framer-motion'
import { Download, Image, Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PhotoItem } from '@shared/protocol'
import { Button, Empty, PageHeader } from '@/components/ui'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'

export function Photos() {
  const connected = useApp((s) => s.conn.connected)
  const [items, setItems] = useState<PhotoItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [end, setEnd] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<PhotoItem | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const more = useCallback(
    async (reset = false) => {
      if (loading || (!reset && end) || !connected) return
      setLoading(true)
      try {
        const offset = reset ? 0 : items?.length || 0
        const r = await call<{ items: PhotoItem[] }>('photos', offset, 48)
        setItems((x) => (reset ? r.items : [...(x || []), ...r.items]))
        setEnd(r.items.length < 48)
      } catch {
        setItems((x) => x || [])
      }
      setLoading(false)
    },
    [loading, end, connected, items]
  )
  useEffect(() => {
    more(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && more())
    io.observe(el)
    return () => io.disconnect()
  }, [more])

  const fetch = async (p: PhotoItem, open = true): Promise<void> => {
    setBusy(p.id)
    await call('photoFetch', p.id, open).catch(() => {})
    setBusy(null)
  }

  if (!connected) return <Empty icon={Image} title="Connect your phone" body="Your latest photos and screenshots appear here." />

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader icon={Image} title="Photos" subtitle="Recent photos and screenshots from your phone">
        <Button size="sm" variant="soft" icon={RefreshCw} onClick={() => { setEnd(false); more(true) }}>Refresh</Button>
      </PageHeader>
      {items === null ? (
        <div className="grid grid-cols-5 gap-2.5">{Array.from({ length: 15 }).map((_, i) => <div key={i} className="shimmer aspect-square rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <Empty icon={Image} title="No photos" body="Allow photo access in the phone app to browse your gallery here." />
      ) : (
        <div className="grid grid-cols-5 gap-2.5">
          {items.map((p, i) => (
            <motion.button
              key={p.id}
              layoutId={`photo-${p.id}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28, delay: (i % 48) * 0.012 }}
              whileHover={{ scale: 1.03, zIndex: 2 }}
              onClick={() => setPreview(p)}
              className="group relative aspect-square overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/5"
            >
              <img src={`data:image/jpeg;base64,${p.thumb}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 transition group-hover:opacity-100" />
              {busy === p.id && <div className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="animate-spin" /></div>}
            </motion.button>
          ))}
        </div>
      )}
      <div ref={sentinel} className="h-10" />
      {loading && items && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-white/40" /></div>}

      <AnimatePresence>
        {preview && (
          <motion.div className="fixed inset-0 z-40 grid place-items-center bg-ink-950/94 p-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreview(null)}>
            <motion.img layoutId={`photo-${preview.id}`} src={`data:image/jpeg;base64,${preview.thumb}`} className="max-h-[75vh] max-w-full rounded-3xl object-contain shadow-2xl" />
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute bottom-10 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm">{preview.name} · {preview.w}×{preview.h}</span>
              <Button variant="primary" icon={busy === preview.id ? Loader2 : Download} onClick={() => fetch(preview)}>Open full size</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
