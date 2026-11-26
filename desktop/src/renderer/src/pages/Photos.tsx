import { AnimatePresence, motion } from 'framer-motion'
import { Download, Film, Image, Images, Loader2, Play, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PhotoAlbum, PhotoItem } from '@shared/protocol'
import { Button, Empty, PageHeader } from '@/components/ui'
import { call } from '@/lib/api'
import { useApp } from '@/lib/store'

type Kind = 'all' | 'photos' | 'videos'
const PAGE = 48
const dur = (ms?: number): string => {
  const s = Math.round((ms || 0) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// The phone's gallery: photos and videos, by album, newest first.
export function Photos() {
  const connected = useApp((s) => s.conn.connected)
  const [kind, setKind] = useState<Kind>('all')
  const [album, setAlbum] = useState<PhotoAlbum | null>(null)
  const [albums, setAlbums] = useState<PhotoAlbum[] | null>(null)
  const [items, setItems] = useState<PhotoItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [end, setEnd] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<PhotoItem | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const gen = useRef(0) // ignore pages that arrive after the filter changed

  const more = useCallback(
    async (reset = false) => {
      if (!connected || (!reset && (loading || end))) return
      const g = reset ? ++gen.current : gen.current
      setLoading(true)
      try {
        const offset = reset ? 0 : items?.length || 0
        const r = await call<{ items: PhotoItem[] }>('photos', offset, PAGE, kind, album?.id)
        if (g !== gen.current) return
        setItems((x) => (reset ? r.items : [...(x || []), ...r.items]))
        setEnd(r.items.length < PAGE)
      } catch {
        if (g === gen.current) setItems((x) => x || [])
      }
      if (g === gen.current) setLoading(false)
    },
    [loading, end, connected, items, kind, album]
  )
  // a new filter: start over
  useEffect(() => {
    setItems(null)
    setEnd(false)
    more(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, kind, album?.id])
  useEffect(() => {
    if (!connected) return
    setAlbums(null)
    call<{ albums: PhotoAlbum[] }>('photoAlbums', kind).then((r) => setAlbums(r.albums || [])).catch(() => setAlbums([]))
  }, [connected, kind])
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

  if (!connected) return <Empty icon={Image} title="Connect your phone" body="Your photos, videos and albums appear here." />

  return (
    <div className="mx-auto w-full max-w-[1680px]">
      <PageHeader icon={Image} title={album ? album.name : 'Photos'} subtitle={album ? `${album.count} items${album.videos ? ` · ${album.videos} videos` : ''}` : 'Photos and videos from your phone, by album'}>
        <div className="flex rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10">
          {([['all', 'All', Images], ['photos', 'Photos', Image], ['videos', 'Videos', Film]] as const).map(([k, label, I]) => (
            <button key={k} onClick={() => setKind(k)} className={`relative flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${kind === k ? 'text-ink-950' : 'text-white/60 hover:text-white'}`}>
              {kind === k && <motion.span layoutId="photo-kind" className="absolute inset-0 rounded-full bg-white" transition={{ type: 'spring', stiffness: 500, damping: 34 }} />}
              <span className="relative flex items-center gap-1.5"><I size={13} /> {label}</span>
            </button>
          ))}
        </div>
        <Button size="sm" variant="soft" icon={RefreshCw} onClick={() => { setEnd(false); more(true) }}>Refresh</Button>
      </PageHeader>

      {/* albums */}
      <div className="-mx-1 mb-5 flex gap-3 overflow-x-auto px-1 pb-2">
        <AlbumTile active={!album} name="Everything" sub={kind === 'videos' ? 'All videos' : kind === 'photos' ? 'All photos' : 'Photos & videos'} onClick={() => setAlbum(null)} />
        {albums === null
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer h-[118px] w-[112px] shrink-0 rounded-2xl" />)
          : albums.map((a) => <AlbumTile key={a.id} active={album?.id === a.id} name={a.name} sub={`${a.count}`} thumb={a.thumb} onClick={() => setAlbum(album?.id === a.id ? null : a)} />)}
      </div>

      {items === null ? (
        <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">{Array.from({ length: 15 }).map((_, i) => <div key={i} className="shimmer aspect-square rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <Empty icon={kind === 'videos' ? Film : Image} title={kind === 'videos' ? 'No videos here' : 'Nothing here'} body="Allow Photos & videos in the phone app (Settings) to browse your gallery." />
      ) : (
        <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
          {items.map((p, i) => (
            <motion.button
              key={p.id}
              layoutId={`photo-${p.id}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28, delay: (i % PAGE) * 0.012 }}
              whileHover={{ scale: 1.03, zIndex: 2 }}
              onClick={() => setPreview(p)}
              className="group relative aspect-square overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/5"
            >
              <img src={`data:image/jpeg;base64,${p.thumb}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 transition group-hover:opacity-100" />
              {p.video && (
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums backdrop-blur">
                  <Play size={10} fill="currentColor" /> {dur(p.duration)}
                </div>
              )}
              {busy === p.id && <div className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="animate-spin" /></div>}
            </motion.button>
          ))}
        </div>
      )}
      <div ref={sentinel} className="h-10" />
      {loading && items && items.length > 0 && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-white/40" /></div>}

      <AnimatePresence>
        {preview && (
          <motion.div className="fixed inset-0 z-40 grid place-items-center bg-ink-950/94 p-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreview(null)}>
            <div className="relative">
              <motion.img layoutId={`photo-${preview.id}`} src={`data:image/jpeg;base64,${preview.thumb}`} className="max-h-[75vh] max-w-full rounded-3xl object-contain shadow-2xl" />
              {preview.video && (
                <button onClick={(e) => { e.stopPropagation(); fetch(preview) }} className="absolute inset-0 grid place-items-center">
                  <span className="grid h-20 w-20 place-items-center rounded-full bg-black/55 ring-2 ring-white/70 backdrop-blur">{busy === preview.id ? <Loader2 className="animate-spin" size={30} /> : <Play size={34} fill="currentColor" />}</span>
                </button>
              )}
            </div>
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute bottom-10 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm">{preview.name}{preview.video ? ` · ${dur(preview.duration)}` : ` · ${preview.w}×${preview.h}`}</span>
              <Button variant="primary" icon={busy === preview.id ? Loader2 : preview.video ? Play : Download} onClick={() => fetch(preview)}>{preview.video ? 'Play on this PC' : 'Open full size'}</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AlbumTile({ active, name, sub, thumb, onClick }: { active: boolean; name: string; sub: string; thumb?: string; onClick: () => void }) {
  return (
    <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={onClick} className="w-[112px] shrink-0 text-left">
      <div className={`relative h-[84px] w-[112px] overflow-hidden rounded-2xl ring-2 transition ${active ? 'ring-cyan' : 'ring-transparent'}`}>
        {thumb ? <img src={`data:image/jpeg;base64,${thumb}`} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#7c5cff55,#35e0ff33)]"><Images size={26} className="text-white/80" /></div>}
      </div>
      <div className={`mt-1.5 truncate text-[12.5px] font-semibold ${active ? 'text-white' : 'text-white/80'}`}>{name}</div>
      <div className="truncate text-[11px] text-white/45">{sub}</div>
    </motion.button>
  )
}
