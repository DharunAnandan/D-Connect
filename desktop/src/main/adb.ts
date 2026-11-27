// USB mode: when a phone is plugged in with USB debugging on, `adb reverse` maps the phone's
// localhost:PORT to ours, so the app connects over the cable with the very same protocol.
import { execFile } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

// adb: the copy bundled with the Windows installer, an Android SDK, or whatever is on PATH
export function adbPath(): string {
  const candidates = [
    process.platform === 'win32' && process.resourcesPath && path.join(process.resourcesPath, 'win', 'adb', 'adb'),
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb'),
    path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', 'adb'),
    '/usr/bin/adb',
    '/usr/local/bin/adb'
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (fs.existsSync(c + '.exe')) return c + '.exe'
    if (fs.existsSync(c)) return c
  }
  return 'adb' // let PATH decide
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(bin, args, { timeout: 5000 }, (err, out) => (err ? reject(err) : resolve(out)))
  )
}

export interface UsbDevice {
  serial: string
  model: string
  state: string
}

export class Usb extends EventEmitter {
  devices: UsbDevice[] = []
  available = true
  private timer: NodeJS.Timeout | null = null
  private reversed = new Set<string>()
  private tcpTried = new Set<string>()
  private bin = adbPath()

  start(port: number, enabled: () => boolean, wifiAdb: () => boolean = () => false): void {
    const tick = async (): Promise<void> => {
      if (!enabled() || !this.bin) return
      try {
        const out = await run(this.bin, ['devices', '-l'])
        const list = out
          .split('\n')
          .slice(1)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const [serial, state] = l.split(/\s+/)
            const model = /model:(\S+)/.exec(l)?.[1]?.replace(/_/g, ' ') || serial
            return { serial, state, model }
          })
          .filter((d) => !d.serial.includes(':')) // wireless adb is not USB
        const changed = JSON.stringify(list) !== JSON.stringify(this.devices)
        this.devices = list
        for (const d of list) {
          if (d.state !== 'device' || this.reversed.has(d.serial)) continue
          // app windows over Wi-Fi: let the phone accept adb on the network too (until it restarts).
          // Doing so restarts adb on the phone, so it comes before the reverse tunnel. Any new
          // computer that tries it still has to be allowed on the phone's screen.
          if (wifiAdb()) {
            const tcp = (await run(this.bin, ['-s', d.serial, 'shell', 'getprop', 'service.adb.tcp.port']).catch(() => '')).trim()
            if (tcp !== '5555' && !this.tcpTried.has(d.serial)) {
              this.tcpTried.add(d.serial) // once per plug-in, so a phone that refuses still links
              await run(this.bin, ['-s', d.serial, 'tcpip', '5555']).catch(() => '')
              continue // adb on the phone restarts: set up the tunnel on the next round
            }
          }
          await run(this.bin, ['-s', d.serial, 'reverse', `tcp:${port}`, `tcp:${port}`])
          this.reversed.add(d.serial)
          this.emit('reversed', d)
        }
        for (const s of [...this.reversed]) if (!list.find((d) => d.serial === s)) this.reversed.delete(s)
        for (const s of [...this.tcpTried]) if (!list.find((d) => d.serial === s)) this.tcpTried.delete(s)
        if (changed) this.emit('change', list)
      } catch {
        if (this.available) {
          this.available = false
          this.emit('change', [])
        }
      }
    }
    tick()
    this.timer = setInterval(tick, 3000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }
}
