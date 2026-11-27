// Updates: a required one covers the app; an optional one is a banner that can wait for the next
// version. Also asks for the phone app to be updated when it's too old for this PC.
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Smartphone, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Logo } from './TitleBar'
import { Button } from './ui'
import { call, useLive } from '@/lib/api'

export interface UpdateState {
  current: string
  kind: 'snap' | 'appimage' | 'deb' | 'exe' | 'msstore' | 'other'
  latest?: string
  min?: string
  notes?: string
  available: boolean
  force: boolean
  phone?: { version?: string; latest?: string; old: boolean; tooOld: boolean }
  checkedAt?: number
}

export const useUpdate = (): UpdateState | null => useLive<UpdateState | null>('updateState', 'update', null)[0]

const howTo = (k: UpdateState['kind']): string =>
  k === 'msstore' ? 'The Microsoft Store updates it for you: open D-Connect in the Store and click Update.' : k === 'snap' ? 'The Snap Store updates it for you, or run: snap refresh d-connect' : k === 'exe' ? 'Download the new installer and run it; your pairing stays.' : k === 'appimage' ? 'Download the new AppImage and use it in place of this one.' : 'Download the new .deb and open it to install; your pairing stays.'

export function UpdateGate() {
  const u = useUpdate()
  const [skipped, setSkipped] = useState(() => localStorage.getItem('updateSkipped') || '')
  const [phoneHidden, setPhoneHidden] = useState(false)
  useEffect(() => setPhoneHidden(false), [u?.phone?.version])

  if (!u) return null
  if (u.force)
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/95 backdrop-blur-md">
        <div className="w-[440px] text-center">
          <div className="mx-auto w-fit"><Logo size={72} /></div>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight">Update D-Connect</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">This version ({u.current}) is no longer supported. Update to {u.latest} to keep using it.</p>
          {u.notes && <p className="mt-4 rounded-2xl bg-white/5 p-4 text-left text-sm text-white/80 ring-1 ring-white/10">{u.notes}</p>}
          <p className="mt-4 text-xs text-muted">{howTo(u.kind)}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="primary" icon={Download} onClick={() => call('updateOpen')}>Get the update</Button>
            <Button variant="ghost" onClick={() => call('quit')}>Quit</Button>
          </div>
        </div>
      </div>
    )

  const showPc = u.available && skipped !== u.latest
  const showPhone = !!u.phone?.tooOld && !phoneHidden
  return (
    <div className="pointer-events-none fixed inset-x-0 top-11 z-40 flex flex-col items-center gap-2">
      <AnimatePresence>
        {showPc && (
          <Banner key="pc" icon={Download} title={`D-Connect ${u.latest} is available`} body={u.notes || howTo(u.kind)}
            action="Update" onAction={() => call('updateOpen')}
            onClose={() => { localStorage.setItem('updateSkipped', u.latest || ''); setSkipped(u.latest || '') }} />
        )}
        {showPhone && (
          <Banner key="phone" icon={Smartphone} title="Update the phone app" body={`The phone has D-Connect ${u.phone!.version}; this PC needs a newer one. Update it from Google Play or the download page.`}
            action="Get it" onAction={() => call('openPhoneAppLink')} onClose={() => setPhoneHidden(true)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function Banner({ icon: Icon, title, body, action, onAction, onClose }: { icon: typeof Download; title: string; body: string; action: string; onAction: () => void; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
      className="pointer-events-auto flex w-[560px] max-w-[92vw] items-center gap-3 rounded-2xl bg-ink-850/95 px-4 py-3 shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <Icon size={20} className="shrink-0 text-cyan" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="truncate text-xs text-muted">{body}</div>
      </div>
      <Button size="sm" variant="primary" onClick={onAction}>{action}</Button>
      <button onClick={onClose} title="Later" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white/10"><X size={15} /></button>
    </motion.div>
  )
}
