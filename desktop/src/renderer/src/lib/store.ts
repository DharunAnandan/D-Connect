// App-wide live state, filled from the main process once and kept fresh by events.
import { create } from 'zustand'
import type { EyeStats, EyeStatus, MediaPlayerState, PhoneNotification, PhoneStatus } from '@shared/protocol'
import { call, dc } from './api'

export interface Conn {
  connected: boolean
  device?: { deviceId: string; name: string; model: string; pairedAt: number; lastSeen: number }
  via?: 'wifi' | 'usb'
  address?: string
  since?: number
  rtt?: number
  pcOffline?: boolean // this PC is switched off
  phoneOffline?: boolean // the phone switched itself off
}

interface State {
  conn: Conn
  status: PhoneStatus | null
  notifs: PhoneNotification[]
  eye: EyeStatus | null
  eyeStats: EyeStats | null
  phoneMedia: MediaPlayerState | null
  pcMedia: MediaPlayerState[]
  settings: Record<string, any>
  devices: any[]
  info: { name: string; platform: string; version: string; fingerprint: string; port: number; session: string } | null
  setSetting: (k: string, v: any) => void
  route: string
  go: (r: string) => void
}

export const useApp = create<State>((set) => ({
  conn: { connected: false },
  status: null,
  notifs: [],
  eye: null,
  eyeStats: null,
  phoneMedia: null,
  pcMedia: [],
  settings: {},
  devices: [],
  info: null,
  route: location.hash.replace(/^#/, '') || '/',
  go: (r) => {
    history.replaceState(null, '', '#' + r)
    set({ route: r })
  },
  setSetting: (k, v) => {
    set((s) => ({ settings: { ...s.settings, [k]: v } }))
    call('setSetting', k, v)
  }
}))

let started = false
export function startLiveState(): void {
  if (started) return
  started = true
  const s = useApp.setState
  const load = <K extends keyof State>(key: K, rpc: string): void => {
    call(rpc).then((v) => v !== undefined && s({ [key]: v } as any)).catch(() => {})
  }
  load('conn', 'conn')
  load('status', 'status')
  load('notifs', 'notifs')
  load('eye', 'eyeStatus')
  load('eyeStats', 'eyeStats')
  load('phoneMedia', 'mediaPhone')
  load('pcMedia', 'mediaPc')
  load('settings', 'settings')
  load('devices', 'devices')
  load('info', 'info')
  dc.on('conn', (conn) => s({ conn }))
  dc.on('rtt', (rtt) => s((st) => ({ conn: { ...st.conn, rtt } })))
  dc.on('status', (status) => s({ status }))
  dc.on('notifs', (notifs) => s({ notifs }))
  dc.on('eye', (eye) => s({ eye }))
  dc.on('eye.stats', (eyeStats) => s({ eyeStats }))
  dc.on('media.phone', (phoneMedia) => s({ phoneMedia }))
  dc.on('media.pc', (pcMedia) => s({ pcMedia }))
  dc.on('settings', (settings) => s({ settings }))
  dc.on('devices', (devices) => s({ devices }))
}
