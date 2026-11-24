# D-Connect protocol (v1)

The desktop runs a **WSS server** (default port `47820`, next free port if taken) with a self-signed
certificate. The phone is the client. Source of truth: `desktop/src/shared/protocol.ts`, mirrored
by `mobile/lib/core/protocol.dart`.

## Transport
| Path | How |
|---|---|
| Wi-Fi | `wss://<pc-ip>:47820`, PC found by the IPs in the QR or mDNS `_dconnect._tcp` (TXT `id`, `fp`, `n`) |
| USB | the desktop runs `adb reverse tcp:47820 tcp:47820`; the phone tries `wss://127.0.0.1:47820` first |

## Trust
1. The QR holds `dconnect://pair?v=1&n=<name>&h=<ip,ip>&p=<port>&f=<sha256 cert fingerprint>&t=<token>&i=<pc id>`.
2. The phone pins `f`: the TLS handshake is accepted only when the cert's SHA-256 matches.
3. `hello` carries the one-time `token` (valid 5 min, single use). The PC answers `welcome` with a
   32-byte `key`; later `hello`s carry `key` instead. Unknown or forgotten devices get `denied`.

## Frames
- **Text**: `{"type": "...", "id"?: "...", "data"?: {...}}`. A reply to a request reuses its `id`.
- **Binary**: `[channel u8][header length u16 BE][header JSON][payload]`.
  Channels: `1` file chunk `{fid, seq}`, `2` video `{config, key, pts}`, `3` thumbnail.

## Messages
| Area | Phone → PC | PC → phone |
|---|---|---|
| Link | `hello`, `pong`, `ping` | `welcome`, `denied`, `ping`, `pong` |
| Status | `phone.status {battery, charging, network, carrier, signal, storageFree, storageTotal, dnd, screenOn}` | `settings.sync` |
| Notifications | `notif.all {items}`, `notif.posted`, `notif.removed {key}` | `notif.dismiss {key}`, `notif.reply {key,text}`, `notif.action {key,index}` |
| SMS | `sms.received`, replies `sms.threads`, `sms.messages`, `sms.sent` | `sms.threads.get`, `sms.messages.get {threadId}`, `sms.send {address,body}` |
| Calls | `call.state {state: ringing/dialing/offhook/idle, number, name, since}`, replies `calllog`, `contacts` | `call.answer`, `call.reject`, `call.end`, `call.dial {number}`, `call.mute {muted}`, `calllog.get`, `contacts.search {q}` |
| Files | `file.offer {fid,name,size,tag?}`, `file.accept/reject/done/cancel`, `file.ack {fid,done}` | same set |
| Photos | replies `photos.list {items}`; full photo arrives as a file with `tag: "photo"` | `photos.get {offset,limit}`, `photos.fetch {id}` |
| Clipboard / share | `clip.set {text}`, `share.url {url, open}`, `share.text {text}` | `clip.set`, `share.url`, `share.text` |
| Mirror | `mirror.started {width,height}`, `mirror.stopped`, `mirror.denied`, `mirror.error`, video on channel 2 | `mirror.start {maxSize,bitrate,fps}`, `mirror.stop`, `mirror.keyframe`, `input.touch {action,x,y}`, `input.scroll {x,y,dy}`, `input.key {action}`, `input.text {text}` |
| Remote (phone drives PC) | `pc.mouse.move {dx,dy}`, `pc.mouse.button {button,state}`, `pc.mouse.scroll {dx,dy}`, `pc.key {key}`, `pc.combo {keys}`, `pc.text {text}`, `pc.slide {dir}` | |
| Media | `media.phone.state`, `media.pc.cmd {id,cmd}` | `media.pc.state {players}`, `media.phone.cmd {cmd}` |
| Extras | `find.pc {on}`, `commands.run {id}` | `find.ring {on}`, `dnd.set {on}`, `commands.list {commands}` |
| Eye care | `eye.screen {on}`, `eye.result {result}`, `eye.take`, `eye.reset`, `eye.config {on,minutes,seconds,phoneCounts,sync}`, `eye.stats.get` | `eye.status`, `eye.stats {days,streak,best}`, `eye.start {seconds}`, `eye.end {result}` |

Files from the phone are flow-controlled: the phone keeps at most 8 MB unacknowledged and the PC
sends `file.ack` every 4 MB. Files from the PC rely on the socket's `bufferedAmount`.
