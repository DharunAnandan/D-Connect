// D-Connect wire protocol. Mirrored by mobile/lib/core/protocol.dart and documented in protocol/PROTOCOL.md.
//
// Text frames:   {"type": "<name>", "id"?: "<req id>", "data": {...}}
// Binary frames: [channel u8][header length u16 BE][header JSON utf8][payload bytes]

export const PROTOCOL_VERSION = 1
export const DEFAULT_PORT = 47820
export const MDNS_TYPE = 'dconnect'

export enum Channel {
  File = 1,
  Video = 2,
  Thumb = 3
}

export interface Envelope<T = any> {
  type: string
  id?: string
  data?: T
}

// ---------------------------------------------------------------- handshake
export interface Hello {
  v: number
  deviceId: string
  name: string
  model: string
  android: string
  token?: string // one-time pairing token from the QR
  key?: string // long-term key issued at pairing
}
export interface Welcome {
  deviceId: string
  name: string
  os: string
  key?: string // only sent right after pairing
  features: string[]
  standby?: boolean // another phone is the active one; this one waits
}

// ---------------------------------------------------------------- phone status
export interface PhoneStatus {
  battery: number
  charging: boolean
  network?: string // "wifi" | "mobile" | "none"
  carrier?: string
  signal?: number // 0..4
  storageFree?: number
  storageTotal?: number
  dnd?: boolean
  screenOn?: boolean
}

// ---------------------------------------------------------------- notifications
export interface PhoneNotification {
  key: string
  pkg: string
  app: string
  title: string
  text: string
  time: number
  icon?: string // base64 png
  canReply?: boolean
  actions?: string[]
  category?: string // 'call' for app calls (Teams, WhatsApp...)
  fromMe?: boolean // the newest message in this chat is your own reply
  thread?: { from?: string; text: string; me?: boolean; time?: number }[] // chat apps: the last few messages
}

// ---------------------------------------------------------------- messages / calls
export interface SmsThread {
  threadId: string
  address: string
  name?: string
  snippet: string
  date: number
  unread: number
}
export interface SmsMessage {
  id: string
  threadId: string
  address: string
  body: string
  date: number
  out: boolean
}
export interface CallState {
  state: 'ringing' | 'offhook' | 'idle' | 'dialing'
  number?: string
  name?: string
  photo?: string
  since?: number
  waiting?: boolean // (older phones) a second call ringing while already on one
  held?: boolean // the call in front is on hold
  waitingCall?: { number?: string; name?: string } | null // a second call ringing while on this one
  calls?: CallLine[] // every call going on (active, on hold, ringing)
  app?: string // set for app calls (Teams, WhatsApp...): answered via the notification's buttons
  key?: string
}
export interface CallLine {
  number?: string
  name?: string
  since?: number
  status: 'ringing' | 'dialing' | 'active' | 'held'
  conference?: boolean
}
export interface CallLogEntry {
  number: string
  name?: string
  date: number
  duration: number
  kind: 'in' | 'out' | 'missed' | 'rejected'
}

// ---------------------------------------------------------------- files / photos
export interface FileOffer {
  fid: string
  name: string
  size: number
  mime?: string
  tag?: string // "photo" when it answers photos.fetch
}
export interface PhotoItem {
  id: string
  name: string
  date: number
  w: number
  h: number
  size: number
  thumb: string // base64 jpeg
  video?: boolean
  duration?: number // ms, videos
}
export interface PhotoAlbum {
  id: string
  name: string
  count: number
  videos: number
  thumb: string
}

// ---------------------------------------------------------------- media
export interface MediaPlayerState {
  id: string
  app: string
  title: string
  artist?: string
  album?: string
  playing: boolean
  art?: string
  position?: number
  length?: number
}
export type MediaCmd = 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'volup' | 'voldown'

// ---------------------------------------------------------------- mirror
export interface MirrorOptions {
  maxSize: number
  bitrate: number
  fps: number
}
export interface TouchEvent {
  action: 'down' | 'move' | 'up'
  x: number // 0..1
  y: number // 0..1
}

// ---------------------------------------------------------------- eye care
export type EyeResult = 'done' | 'skip' | 'snooze'
export interface EyeStatus {
  on: boolean
  nextInMs: number | null
  everyMs: number
  seconds: number
  screenOn: boolean
  showing: boolean
  phoneCounts: boolean
}
export interface EyeDay {
  date: string // YYYY-MM-DD
  done: number
  skip: number
  snooze: number
}
export interface EyeStats {
  days: EyeDay[]
  streak: number
  best: number
}

// ---------------------------------------------------------------- quick commands
export interface QuickCommand {
  id: string
  name: string
  icon: string
  cmd?: string // shell command, for user commands
  builtin?: boolean
  toggle?: boolean // a switch: Mute audio, Keep awake
  on?: boolean // its current state
}

// ---------------------------------------------------------------- binary framing
export function encodeBinary(channel: Channel, header: object, payload: Uint8Array): Uint8Array {
  const h = new TextEncoder().encode(JSON.stringify(header))
  const out = new Uint8Array(3 + h.length + payload.length)
  out[0] = channel
  out[1] = (h.length >> 8) & 0xff
  out[2] = h.length & 0xff
  out.set(h, 3)
  out.set(payload, 3 + h.length)
  return out
}

export function decodeBinary(buf: Uint8Array): { channel: Channel; header: any; payload: Uint8Array } {
  const hlen = (buf[1] << 8) | buf[2]
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(3, 3 + hlen)))
  return { channel: buf[0] as Channel, header, payload: buf.subarray(3 + hlen) }
}

// The QR the desktop shows: everything the phone needs to find and trust it.
export interface PairPayload {
  v: number
  name: string
  hosts: string[]
  port: number
  fp: string // sha256 of the TLS cert, hex
  token: string
  id: string
}
export function pairUri(p: PairPayload): string {
  const q = new URLSearchParams({
    v: String(p.v),
    n: p.name,
    h: p.hosts.join(','),
    p: String(p.port),
    f: p.fp,
    t: p.token,
    i: p.id
  })
  return `dconnect://pair?${q.toString()}`
}
export function parsePairUri(uri: string): PairPayload | null {
  try {
    const u = new URL(uri)
    if (u.protocol !== 'dconnect:') return null
    const q = u.searchParams
    return {
      v: +(q.get('v') || 1),
      name: q.get('n') || 'PC',
      hosts: (q.get('h') || '').split(',').filter(Boolean),
      port: +(q.get('p') || DEFAULT_PORT),
      fp: q.get('f') || '',
      token: q.get('t') || '',
      id: q.get('i') || ''
    }
  } catch {
    return null
  }
}
