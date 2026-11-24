// The hub: a WSS server the phone connects to (over Wi-Fi, or USB through `adb reverse`).
// It does the handshake (pairing with a one-time token, or a known device with its key) and
// then hands typed messages to the features. One phone is active at a time.
import { EventEmitter } from 'events'
import crypto from 'crypto'
import https from 'https'
import os from 'os'
import { WebSocketServer, WebSocket } from 'ws'
import {
  Channel,
  decodeBinary,
  encodeBinary,
  Envelope,
  Hello,
  PairPayload,
  PROTOCOL_VERSION,
  Welcome
} from '@shared/protocol'
import type { Identity } from './cert'
import type { Store, TrustedDevice } from './store'

export const FEATURES = [
  'notifications', 'sms', 'calls', 'clipboard', 'files', 'photos', 'mirror', 'remote',
  'media', 'find', 'share', 'dnd', 'commands', 'eye'
]

const TOKEN_TTL = 5 * 60000

export interface Session {
  device: TrustedDevice
  ws: WebSocket
  via: 'wifi' | 'usb'
  address: string
  since: number
  rtt: number
}

export declare interface Hub {
  on(e: 'message', l: (type: string, data: any, id?: string) => void): this
  on(e: 'binary', l: (channel: Channel, header: any, payload: Buffer) => void): this
  on(e: 'connected', l: (s: Session) => void): this
  on(e: 'disconnected', l: (s: Session) => void): this
  on(e: 'paired', l: (d: TrustedDevice) => void): this
  on(e: 'token', l: (p: PairPayload) => void): this
}

export class Hub extends EventEmitter {
  session: Session | null = null
  private wss: WebSocketServer | null = null
  private server: https.Server | null = null
  private token = ''
  private tokenAt = 0
  private pingTimer: NodeJS.Timeout | null = null

  constructor(private store: Store, private identity: Identity, private name: string) {
    super()
    this.setMaxListeners(100) // every feature listens for messages
  }

  get port(): number {
    return this.store.get('port')
  }

  start(): Promise<void> {
    this.server = https.createServer({ key: this.identity.key, cert: this.identity.cert })
    this.wss = new WebSocketServer({ server: this.server, maxPayload: 64 * 1024 * 1024 })
    this.wss.on('connection', (ws, req) => this.accept(ws, req.socket.remoteAddress || ''))
    this.pingTimer = setInterval(() => this.ping(), 5000)
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.port, '0.0.0.0', () => resolve())
    })
  }

  stop(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.wss?.close()
    this.server?.close()
  }

  // ---------------------------------------------------------------- pairing
  pairPayload(): PairPayload {
    if (!this.token || Date.now() - this.tokenAt > TOKEN_TTL) this.rotateToken()
    return {
      v: PROTOCOL_VERSION,
      name: this.name,
      hosts: lanAddresses(),
      port: this.port,
      fp: this.identity.fingerprint,
      token: this.token,
      id: this.identity.id
    }
  }

  rotateToken(): PairPayload {
    this.token = crypto.randomBytes(12).toString('base64url')
    this.tokenAt = Date.now()
    const p = this.pairPayload()
    this.emit('token', p)
    return p
  }

  forget(deviceId: string): void {
    const t = { ...this.store.get('trusted') }
    delete t[deviceId]
    this.store.set('trusted', t)
    if (this.session?.device.deviceId === deviceId) this.session.ws.close(4001, 'forgotten')
  }

  // ---------------------------------------------------------------- connections
  private accept(ws: WebSocket, address: string): void {
    const via: Session['via'] = /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(address) ? 'usb' : 'wifi'
    let session: Session | null = null
    const helloTimeout = setTimeout(() => !session && ws.close(4000, 'no hello'), 8000)

    ws.on('message', (raw, isBinary) => {
      if (isBinary) {
        if (!session) return
        const buf = raw as Buffer
        try {
          const { channel, header, payload } = decodeBinary(buf)
          this.emit('binary', channel, header, Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength))
        } catch {
          // a broken frame: drop it
        }
        return
      }
      let msg: Envelope
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (!session) {
        if (msg.type !== 'hello') return ws.close(4000, 'hello first')
        clearTimeout(helloTimeout)
        session = this.handshake(ws, msg.data as Hello, via, address)
        return
      }
      if (msg.type === 'pong') {
        session.rtt = Date.now() - (msg.data?.t || Date.now())
        return
      }
      if (msg.type === 'ping') return this.sendTo(ws, 'pong', msg.data)
      this.emit('message', msg.type, msg.data, msg.id)
    })

    ws.on('close', () => {
      clearTimeout(helloTimeout)
      if (session && this.session === session) {
        this.session = null
        this.emit('disconnected', session)
      }
    })
    ws.on('error', () => {})
  }

  private handshake(ws: WebSocket, hello: Hello, via: Session['via'], address: string): Session | null {
    if (!hello?.deviceId) {
      ws.close(4000, 'bad hello')
      return null
    }
    const trusted = { ...this.store.get('trusted') }
    let device = trusted[hello.deviceId]
    let issuedKey: string | undefined
    const tokenOk = !!hello.token && hello.token === this.token && Date.now() - this.tokenAt < TOKEN_TTL
    if (tokenOk) {
      issuedKey = crypto.randomBytes(32).toString('base64url')
      device = {
        deviceId: hello.deviceId,
        name: hello.name,
        model: hello.model,
        key: issuedKey,
        pairedAt: Date.now(),
        lastSeen: Date.now(),
        btAddress: device?.btAddress
      }
      this.rotateToken() // one use only
    } else if (!device || !hello.key || !safeEqual(device.key, hello.key)) {
      this.sendTo(ws, 'denied', { reason: device ? 'bad-key' : 'not-paired' })
      ws.close(4003, 'not paired')
      return null
    }
    device = { ...device, name: hello.name || device.name, model: hello.model || device.model, lastSeen: Date.now() }
    trusted[device.deviceId] = device
    this.store.set('trusted', trusted)

    // a newer connection replaces the old one (e.g. Wi-Fi -> USB)
    if (this.session) {
      const old = this.session
      this.session = null
      old.ws.close(4002, 'replaced')
      this.emit('disconnected', old)
    }
    const welcome: Welcome = { deviceId: this.identity.id, name: this.name, os: process.platform, key: issuedKey, features: FEATURES }
    this.sendTo(ws, 'welcome', welcome)
    const s: Session = { device, ws, via, address, since: Date.now(), rtt: 0 }
    this.session = s
    if (issuedKey) this.emit('paired', device)
    this.emit('connected', s)
    return s
  }

  private ping(): void {
    if (this.session) this.sendTo(this.session.ws, 'ping', { t: Date.now() })
  }

  // ---------------------------------------------------------------- sending
  private sendTo(ws: WebSocket, type: string, data?: any, id?: string): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, data, id }))
  }

  send(type: string, data?: any, id?: string): boolean {
    if (!this.session) return false
    this.sendTo(this.session.ws, type, data, id)
    return true
  }

  sendBinary(channel: Channel, header: object, payload: Uint8Array): boolean {
    const ws = this.session?.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(encodeBinary(channel, header, payload))
    return true
  }

  // bytes waiting to go out: file senders wait on this so memory stays flat
  get buffered(): number {
    return this.session?.ws.bufferedAmount ?? 0
  }

  // request/response over the socket
  request<T = any>(type: string, data?: any, timeoutMs = 15000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.session) return reject(new Error('not connected'))
      const id = crypto.randomUUID()
      const onMsg = (_t: string, d: any, rid?: string): void => {
        if (rid !== id) return
        cleanup()
        resolve(d)
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('timeout'))
      }, timeoutMs)
      const cleanup = (): void => {
        clearTimeout(timer)
        this.off('message', onMsg)
      }
      this.on('message', onMsg)
      this.send(type, data, id)
    })
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export function lanAddresses(): string[] {
  const out: string[] = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(docker|br-|veth|virbr|lxd|tailscale|zt)/.test(name)) continue
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address)
  }
  return out
}
