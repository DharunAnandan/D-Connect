import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Background } from './components/Background'
import { ConnectScene, type SceneState } from './components/ConnectScene'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { UpdateGate } from './components/UpdateGate'
import { dc } from './lib/api'
import { sfx } from './lib/sfx'
import { useApp } from './lib/store'
import { page } from './theme/motion'
import { Calls } from './pages/Calls'
import { Apps } from './pages/Apps'
import { EyeCare } from './pages/EyeCare'
import { Extras } from './pages/Extras'
import { Files } from './pages/Files'
import { FindPcOverlay } from './pages/FindPc'
import { Home } from './pages/Home'
import { Messages } from './pages/Messages'
import { Mirror } from './pages/Mirror'
import { Notifications } from './pages/Notifications'
import { Pair } from './pages/Pair'
import { Photos } from './pages/Photos'
import { Settings } from './pages/Settings'
import { Sound } from './pages/Sound'
import { Battery } from './pages/Battery'

const PAGES: Record<string, () => React.JSX.Element> = {
  '/': Home,
  '/messages': Messages,
  '/calls': Calls,
  '/notifications': Notifications,
  '/files': Files,
  '/photos': Photos,
  '/mirror': Mirror,
  '/apps': Apps,
  '/sound': Sound,
  '/battery': Battery,
  '/extras': Extras,
  '/eye': EyeCare,
  '/settings': Settings,
  '/pair': Pair
}

export function App() {
  const { conn, devices, settings, info, route, go } = useApp()
  const [celebrate, setCelebrate] = useState<SceneState | null>(null)
  const wasConnected = useRef<boolean | null>(null)

  useEffect(() => dc.on('navigate', (r: string) => go(r)), [])

  useEffect(() => {
    document.body.classList.toggle('reduced', !!settings.reducedMotion)
  }, [settings.reducedMotion])

  // the connect moment: found -> handshake -> connected, then into the app
  useEffect(() => {
    if (wasConnected.current === null) {
      wasConnected.current = conn.connected
      return
    }
    if (conn.connected && !wasConnected.current) {
      if (settings.sounds !== false) sfx.connect()
      setCelebrate('found')
      const t1 = setTimeout(() => setCelebrate('handshake'), 650)
      const t2 = setTimeout(() => setCelebrate('connected'), 1350)
      const t3 = setTimeout(() => {
        setCelebrate(null)
        if (route === '/pair') go('/')
      }, 2700)
      wasConnected.current = true
      return () => [t1, t2, t3].forEach(clearTimeout)
    }
    if (!conn.connected && wasConnected.current && settings.sounds !== false) sfx.disconnect()
    wasConnected.current = conn.connected
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.connected])

  const firstRun = !conn.connected && devices.length === 0
  const Page = firstRun ? Pair : PAGES[route] || Home
  const bottomDock = !firstRun && settings.navStyle !== 'sidebar' && settings.dockPos === 'bottom'

  return (
    <div className="flex h-full flex-col">
      <Background tint={route === '/eye' ? 'eye' : 'default'} />
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {!firstRun && <Sidebar route={route} go={go} />}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={firstRun ? 'pair' : route} variants={page} initial="initial" animate="animate" exit="exit" className={`absolute inset-0 overflow-y-auto overflow-x-hidden px-6 pt-2 xl:px-8 ${bottomDock ? 'pb-28' : 'pb-10'}`}>
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {celebrate && (
          <motion.div
            key="celebrate"
            className="fixed inset-0 z-50 grid place-items-center bg-ink-950/92"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
            transition={{ duration: 0.45 }}
          >
            <div className="w-[720px] text-center">
              <ConnectScene state={celebrate} phoneName={conn.device?.name} pcName={info?.name} height={340} />
              <motion.h2 key={celebrate} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold tracking-tight">
                {celebrate === 'connected' ? <span className="text-aurora">Connected</span> : celebrate === 'handshake' ? 'Securing the link…' : `Found ${conn.device?.name || 'your phone'}`}
              </motion.h2>
              <p className="mt-2 text-sm text-muted">{conn.via === 'usb' ? 'Over USB · end-to-end encrypted' : 'Over Wi-Fi · end-to-end encrypted'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <FindPcOverlay />
      <UpdateGate />
    </div>
  )
}
