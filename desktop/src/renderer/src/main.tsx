import '@fontsource-variable/inter'
import './index.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ToastHost } from './pages/ToastHost'
import { CallCard } from './pages/CallCard'
import { startLiveState } from './lib/store'

const route = location.hash.replace(/^#/, '') || '/'
const root = createRoot(document.getElementById('root')!)
if (route === '/toast') {
  document.body.classList.add('transparent')
  root.render(<ToastHost />)
} else if (route === '/call') {
  document.body.classList.add('transparent')
  root.render(<CallCard />)
} else {
  startLiveState()
  root.render(<App />)
}
