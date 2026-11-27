// App updates for the PC app, and a check on the phone app's version.
//
// The update file (docs/latest.json, LINKS.manifest) says the newest version of each app and the
// oldest one still allowed. Below "min" the update is required: the app shows a screen that
// blocks everything but the download. Below "latest" it is optional: a banner, which can be put
// off until the next version.
// The phone says its app version when it links; below MIN_PHONE_VERSION (or the file's android
// min) the PC asks for the phone app to be updated (the phone blocks itself as well).
import { app, net } from 'electron'
import QRCode from 'qrcode'
import { cmpVersion, LINKS, MIN_PHONE_VERSION } from '@shared/links'
import { openUrlSafely } from '../safety'
import type { Ctx } from '../context'

type Kind = 'snap' | 'appimage' | 'deb' | 'exe' | 'msstore' | 'other'
export interface UpdateState {
  current: string
  kind: Kind
  latest?: string
  min?: string
  notes?: string
  available: boolean // a newer version exists
  force: boolean // this version is no longer allowed
  phone?: { version?: string; latest?: string; old: boolean; tooOld: boolean }
  checkedAt?: number
}

const kind = (): Kind =>
  process.platform === 'win32' ? ((process as any).windowsStore ? 'msstore' : 'exe') : process.platform !== 'linux' ? 'other' : process.env.SNAP ? 'snap' : process.env.APPIMAGE ? 'appimage' : 'deb'

export function updates(ctx: Ctx): void {
  let manifest: any = null
  let checkedAt = 0

  const state = (): UpdateState => {
    const current = app.getVersion()
    const d = manifest?.desktop || {}
    const a = manifest?.android || {}
    const pv = ctx.hub.session?.device.app
    const phoneMin = [MIN_PHONE_VERSION, a.min].filter(Boolean).sort((x, y) => cmpVersion(y, x))[0]
    return {
      current,
      kind: kind(),
      latest: d.latest,
      min: d.min,
      notes: d.notes,
      available: !!d.latest && cmpVersion(current, d.latest) < 0,
      force: !!d.min && cmpVersion(current, d.min) < 0,
      // old phone apps don't say their version: then nothing is known
      phone: pv ? { version: pv, latest: a.latest, old: !!a.latest && cmpVersion(pv, a.latest) < 0, tooOld: cmpVersion(pv, phoneMin) < 0 } : undefined,
      checkedAt
    }
  }
  const push = (): void => ctx.emit('update', state())

  const check = async (): Promise<UpdateState> => {
    try {
      const r = await net.fetch(LINKS.manifest, { cache: 'no-cache' } as any)
      if (r.ok) {
        manifest = await r.json()
        checkedAt = Date.now()
      }
    } catch {
      // offline, or the file isn't public: nothing to say
    }
    push()
    return state()
  }

  ctx.handle('updateState', () => state())
  ctx.handle('updateCheck', () => check())
  // where the new version comes from, for how this copy was installed
  ctx.handle('updateOpen', () => {
    const d = manifest?.desktop || {}
    const k = kind()
    const url = k === 'msstore' ? 'https://apps.microsoft.com/detail/9N981DC1LCQ6' : k === 'snap' ? d.snap || 'https://snapcraft.io/d-connect' : k === 'exe' ? d.exe : k === 'appimage' ? d.appimage : k === 'deb' ? d.deb : undefined
    openUrlSafely(url || d.page || LINKS.pcApp)
  })
  ctx.handle('phoneAppLink', async () => ({ url: LINKS.phoneApp, qr: await QRCode.toDataURL(LINKS.phoneApp, { margin: 1, width: 360, color: { dark: '#0b1020', light: '#ffffff' } }) }))
  ctx.handle('openPhoneAppLink', () => openUrlSafely(LINKS.phoneApp))

  ctx.hub.on('connected', () => setTimeout(push, 500))
  setTimeout(check, 8000)
  setInterval(check, 6 * 60 * 60 * 1000)
}
