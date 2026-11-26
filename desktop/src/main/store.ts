// A small JSON settings store in userData. Writes are debounced; get/set are synchronous.
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'

export interface TrustedDevice {
  deviceId: string
  name: string
  model: string
  key: string
  pairedAt: number
  lastSeen: number
  btAddress?: string
}

export const DEFAULTS = {
  deviceName: '',
  port: 47820,
  trusted: {} as Record<string, TrustedDevice>,
  activeDevice: '', // the phone the user chose when several are paired
  // notifications
  notifyToasts: true,
  mutedApps: [] as string[],
  // clipboard
  clipboardSync: true,
  // files
  autoAcceptFiles: true,
  downloadDir: '',
  // usb
  usbAuto: true,
  // extras
  theme: 'auto', // colour theme: auto (blends through all) | aurora | sunset | ocean | forest | graphite
  navStyle: 'dock', // dock | sidebar
  dockPos: 'left', // left | bottom
  bgStyle: 'auto', // auto (aurora, mesh, starry in turn) | aurora | mesh | stars | solid
  notifOpenInWindow: true, // clicking a phone notification opens that app in a window on this PC
  callNoiseAi: true, // RNNoise on the laptop mic during calls (after the WebRTC filter)
  callNoiseVad: 60, // RNNoise voice threshold %: higher cuts more background, too high clips soft speech
  phoneAudioVolume: 100, // loudness of the phone's music on this PC (0-200%)
  phoneAudioOnPc: true, // play the phone's media (Spotify, YouTube...) through this PC's speaker
  proximityLock: false,
  proximityGraceSec: 20,
  lowBatteryAlert: 20, // alert when the phone drops to this % (0 = off)
  chargeAlert: 100, // alert when charging reaches this % (0 = off), e.g. 80 to protect the battery
  pcBatteryAlert: true, // also alert when this laptop's own battery runs low
  pcLowAlert: 20, // the laptop's low level (0 = off)
  pcChargeAlert: 0, // alert when the laptop charges to this % (0 = off)
  pcAlertsToPhone: true, // laptop battery alerts also show on the phone
  dndSync: true,
  commands: [] as { id: string; name: string; icon: string; cmd: string }[],
  // eye care (from side-eye)
  eyeBreaks: true,
  eyeBreakMinutes: 20,
  eyeBreakSeconds: 20,
  eyeBreakSound: true,
  eyePhoneSync: true,
  eyePhoneCounts: true,
  eyeStats: {} as Record<string, { done: number; skip: number; snooze: number }>,
  // ui
  reducedMotion: false,
  sounds: true,
  launchHidden: false
}
export type Settings = typeof DEFAULTS
export type SettingKey = keyof Settings

export class Store extends EventEmitter {
  private data: Settings
  private file: string
  private timer: NodeJS.Timeout | null = null

  constructor(dir: string) {
    super()
    this.file = path.join(dir, 'd-connect.json')
    let saved = {}
    try {
      saved = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    } catch {
      // first run
    }
    this.data = { ...structuredClone(DEFAULTS), ...saved }
  }

  get<K extends SettingKey>(k: K): Settings[K] {
    return this.data[k]
  }

  set<K extends SettingKey>(k: K, v: Settings[K]): void {
    this.data[k] = v
    this.save()
    this.emit('change', k, v)
  }

  all(): Settings {
    return this.data
  }

  private save(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2))
      fs.renameSync(this.file + '.tmp', this.file)
    }, 300)
  }
}
