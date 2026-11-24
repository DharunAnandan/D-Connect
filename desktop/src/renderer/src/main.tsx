import '@fontsource-variable/inter'
import './index.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ToastHost } from './pages/ToastHost'
import { CallCard } from './pages/CallCard'
import { AppWindow } from './pages/AppWindow'
import { MiniMixer } from './pages/Sound'
import { startLiveState } from './lib/store'

const route = location.hash.replace(/^#/, '').split('?')[0] || '/'
const root = createRoot(document.getElementById('root')!)
if (route === '/toast') {
  document.body.classList.add('transparent')
  root.render(<ToastHost />)
} else if (route.startsWith('/appwin')) {
  root.render(<AppWindow />)
} else if (route === '/mixer') {
  document.body.classList.add('transparent')
  root.render(<MiniMixer />)
} else if (route === '/call') {
  document.body.classList.add('transparent')
  root.render(<CallCard />)
} else {
  startLiveState()
  root.render(<App />)
}
