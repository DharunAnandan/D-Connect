// What every feature gets: the phone link, settings, and a way to talk to the UI.
import type { Hub } from './hub'
import type { Store } from './store'

export interface Toast {
  id?: string
  kind: 'notification' | 'sms' | 'file' | 'info' | 'battery' | 'clip' | 'link'
  title: string
  body?: string
  icon?: string // data url
  image?: string // data url: a picture in the message (a shared post, a photo)
  app?: string
  reply?: { kind: 'notif' | 'sms'; key?: string; address?: string }
  actions?: { id: string; label: string }[]
  ttl?: number
  meta?: any
}

export interface Ctx {
  hub: Hub
  store: Store
  emit: (channel: string, data: any) => void // to every renderer
  toast: (t: Toast) => void
  handle: (name: string, fn: (...args: any[]) => any) => void // rpc from the renderer
  focusMain: (route?: string) => void
}
