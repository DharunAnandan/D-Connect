// A pretend phone for developing the desktop without a device. Speaks the real protocol.
//   node scripts/fake-phone.mjs "dconnect://pair?..."   pair with the URI from the QR (copy it from Settings or the log)
//   node scripts/fake-phone.mjs                         reconnect with the saved key
// Then type: notif | sms | call | hangup | clip <text> | file <path> | eye | find | url <url> | battery <n> | quit
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'
import WebSocket from 'ws'

const STATE = path.join(os.homedir(), '.config', 'd-connect-fake-phone.json')
let state = {}
try {
  state = JSON.parse(fs.readFileSync(STATE, 'utf8'))
} catch {}
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2))

const arg = process.argv[2]
if (arg?.startsWith('dconnect://')) {
  const u = new URL(arg)
  const q = u.searchParams
  state.pair = { hosts: q.get('h').split(','), port: +q.get('p'), fp: q.get('f'), token: q.get('t'), name: q.get('n') }
  state.deviceId = state.deviceId || crypto.randomUUID()
  delete state.key
  save()
}
if (!state.pair) {
  console.log('Pass the pairing URI first.')
  process.exit(1)
}

const host = process.env.HOST || state.pair.hosts[0] || '127.0.0.1'
const url = `wss://${host}:${state.pair.port}`
console.log('connecting to', url)
// Trust exactly the PC's own certificate (read from the D-Connect app on this computer; or
// DC_CERT=<file.pem>), checked against the fingerprint in the pairing code. Certificate checks
// stay on: the self-signed certificate is the only one accepted.
const certFile = process.env.DC_CERT || path.join(os.homedir(), '.config', 'D-Connect', 'identity.json')
let pcCert
try {
  const raw = fs.readFileSync(certFile, 'utf8')
  pcCert = certFile.endsWith('.json') ? JSON.parse(raw).cert : raw
} catch {
  console.log(`Can't read the PC's certificate (${certFile}). Run this on the PC itself, or set DC_CERT=<cert.pem>.`)
  process.exit(1)
}
const pinned = new crypto.X509Certificate(pcCert).fingerprint256.replace(/:/g, '').toLowerCase()
if (pinned !== state.pair.fp) {
  console.log('That certificate is not the one in the pairing code, refusing')
  process.exit(2)
}
const ws = new WebSocket(url, {
  ca: pcCert,
  // the certificate is for the PC's name, not its IP address: the fingerprint check stands in
  checkServerIdentity: (_host, cert) => (cert.fingerprint256.replace(/:/g, '').toLowerCase() === pinned ? undefined : new Error('certificate mismatch'))
})
const send = (type, data, id) => ws.send(JSON.stringify({ type, data, id }))
const sendBin = (ch, header, payload) => {
  const h = Buffer.from(JSON.stringify(header))
  ws.send(Buffer.concat([Buffer.from([ch, h.length >> 8, h.length & 255]), h, payload]))
}

ws.on('upgrade', (res) => {
  const cert = res.socket.getPeerCertificate()
  const fp = cert.fingerprint256.replace(/:/g, '').toLowerCase()
  if (fp !== state.pair.fp) {
    console.log('FINGERPRINT MISMATCH, refusing', fp)
    process.exit(2)
  }
})

let battery = 76
const status = () => send('phone.status', { battery, charging: false, network: 'wifi', signal: 3, storageFree: 41e9, storageTotal: 128e9, dnd: false, screenOn: true })
const threads = [
  { threadId: '1', address: '+911234567890', name: 'Amma', snippet: 'Did you eat?', date: Date.now() - 600000, unread: 1 },
  { threadId: '2', address: '+919876543210', name: 'Karthik', snippet: 'Match at 7, coming?', date: Date.now() - 3600000, unread: 0 },
  { threadId: '3', address: 'AX-HDFCBK', snippet: 'Your OTP is 482913', date: Date.now() - 86400000, unread: 0 }
]
const messages = {
  1: [
    { id: 'a', threadId: '1', address: '+911234567890', body: 'Reached office?', date: Date.now() - 3600000, out: false },
    { id: 'b', threadId: '1', address: '+911234567890', body: 'Yes ma, just now', date: Date.now() - 3500000, out: true },
    { id: 'c', threadId: '1', address: '+911234567890', body: 'Did you eat?', date: Date.now() - 600000, out: false }
  ]
}
const incoming = new Map()

ws.on('open', () => {
  send('hello', { v: 1, deviceId: state.deviceId, name: 'Pixel (fake)', model: 'Google Pixel 9', android: '16', token: state.key ? undefined : state.pair.token, key: state.key })
})

ws.on('message', (raw, isBinary) => {
  if (isBinary) {
    const hl = (raw[1] << 8) | raw[2]
    const h = JSON.parse(raw.subarray(3, 3 + hl).toString())
    const f = incoming.get(h.fid)
    if (f) {
      f.got += raw.length - 3 - hl
    }
    return
  }
  const m = JSON.parse(raw.toString())
  const d = m.data || {}
  switch (m.type) {
    case 'welcome':
      if (d.key) {
        state.key = d.key
        save()
        console.log('paired! key saved')
      }
      console.log('connected to', d.name)
      status()
      send('notif.all', {
        items: [
          { key: 'w1', pkg: 'com.whatsapp', app: 'WhatsApp', title: 'Team D', text: 'Priya: build is green 🎉', time: Date.now() - 120000, canReply: true },
          { key: 'g1', pkg: 'com.google.android.gm', app: 'Gmail', title: 'GitHub', text: '[D-Connect] New pull request', time: Date.now() - 900000, actions: ['Archive', 'Reply'] }
        ]
      })
      send('media.phone.state', { id: 'spotify', app: 'Spotify', title: 'Naatu Naatu', artist: 'Rahul Sipligunj', playing: true })
      send('eye.screen', { on: true })
      break
    case 'denied':
      console.log('denied:', d.reason)
      break
    case 'ping':
      send('pong', d)
      break
    case 'sms.threads.get':
      send('sms.threads', { threads }, m.id)
      break
    case 'sms.messages.get':
      send('sms.messages', { messages: messages[d.threadId] || [] }, m.id)
      break
    case 'sms.send':
      console.log('SMS to', d.address, ':', d.body)
      send('sms.sent', { ok: true }, m.id)
      break
    case 'calllog.get':
      send('calllog', { calls: [{ number: '+911234567890', name: 'Amma', date: Date.now() - 7200000, duration: 312, kind: 'in' }, { number: '+919000000000', date: Date.now() - 86400000, duration: 0, kind: 'missed' }, { number: '+919876543210', name: 'Karthik', date: Date.now() - 2 * 86400000, duration: 95, kind: 'out' }] }, m.id)
      break
    case 'photos.get':
      send('photos.list', { items: [] }, m.id)
      break
    case 'file.offer':
      incoming.set(d.fid, { ...d, got: 0 })
      send('file.accept', { fid: d.fid })
      break
    case 'file.done': {
      const f = incoming.get(d.fid)
      console.log('received file', f?.name, f?.got, 'bytes')
      break
    }
    case 'call.answer':
      console.log('answer pressed')
      send('call.state', { state: 'offhook', number: '+911234567890', name: 'Amma', since: Date.now() })
      break
    case 'call.reject':
    case 'call.end':
      send('call.state', { state: 'idle' })
      break
    case 'eye.start':
      console.log(`eye break ${d.seconds}s (type "eyedone" to end it from the phone)`)
      break
    default:
      console.log('<-', m.type, JSON.stringify(d).slice(0, 120))
  }
})
ws.on('close', (c, r) => {
  console.log('closed', c, r.toString())
  process.exit(0)
})
ws.on('error', (e) => console.log('error', e.message))

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const [cmd, ...rest] = line.trim().split(' ')
  const text = rest.join(' ')
  if (cmd === 'notif') send('notif.posted', { key: 'n' + Date.now(), pkg: 'com.whatsapp', app: 'WhatsApp', title: 'Karthik', text: text || 'Bro, you coming tonight?', time: Date.now(), canReply: true })
  else if (cmd === 'sms') send('sms.received', { id: 's' + Date.now(), threadId: '1', address: '+911234567890', name: 'Amma', body: text || 'Call me when free', date: Date.now(), out: false })
  else if (cmd === 'call') send('call.state', { state: 'ringing', number: '+911234567890', name: 'Amma' })
  else if (cmd === 'hangup') send('call.state', { state: 'idle' })
  else if (cmd === 'clip') send('clip.set', { text })
  else if (cmd === 'url') send('share.url', { url: text || 'https://flutter.dev' })
  else if (cmd === 'find') send('find.pc', { on: true })
  else if (cmd === 'eye') send('eye.take', {})
  else if (cmd === 'eyedone') send('eye.result', { result: 'done' })
  else if (cmd === 'battery') {
    battery = +text
    status()
  } else if (cmd === 'file') {
    const p = text
    const buf = fs.readFileSync(p)
    const fid = crypto.randomUUID()
    send('file.offer', { fid, name: path.basename(p), size: buf.length })
    const onAccept = (raw, bin) => {
      if (bin) return
      const m = JSON.parse(raw.toString())
      if (m.type !== 'file.accept' || m.data.fid !== fid) return
      ws.off('message', onAccept)
      for (let i = 0; i < buf.length; i += 262144) sendBin(1, { fid }, buf.subarray(i, i + 262144))
      send('file.done', { fid })
    }
    ws.on('message', onAccept)
  } else if (cmd === 'quit') ws.close()
})
