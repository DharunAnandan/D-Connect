// Small guards for anything that leaves the app: links from the phone or the page, and files
// that came from the phone.
import { app, shell } from 'electron'
import path from 'path'

// only web pages and mail links; never file:, smb:, javascript: or app protocols
export function openUrlSafely(url: string): boolean {
  try {
    const u = new URL(String(url))
    if (!['https:', 'http:', 'mailto:'].includes(u.protocol)) return false
    void shell.openExternal(u.toString())
    return true
  } catch {
    return false
  }
}

// files that would run something when "opened": show them in their folder instead
const RUNS = /\.(exe|msi|bat|cmd|com|scr|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|lnk|url|reg|cpl|jar|sh|bash|zsh|run|bin|appimage|desktop|deb|rpm|apk|py|pl|rb|command|app|dmg|pkg)$/i
export function openFileSafely(file: string): void {
  if (RUNS.test(file)) shell.showItemInFolder(file)
  else void shell.openPath(file)
}

export const isMedia = (file: string): boolean => /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif|mp4|mov|mkv|webm|3gp|m4v)$/i.test(path.basename(file))

// no window may navigate away from the app or open new windows/webviews by itself
export function lockNavigation(): void {
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-navigate', (ev, url) => {
      if (!url.startsWith('file:') && !url.startsWith('data:') && !/^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url)) ev.preventDefault()
    })
    wc.on('will-attach-webview', (ev) => ev.preventDefault())
    wc.setWindowOpenHandler(({ url }) => {
      openUrlSafely(url)
      return { action: 'deny' }
    })
  })
}
