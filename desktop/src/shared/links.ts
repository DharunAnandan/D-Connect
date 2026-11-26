// Where updates and the other app come from. Change these when the store pages are live.
export const LINKS = {
  // update info for both apps (see docs/latest.json); must be publicly readable
  manifest: 'https://raw.githubusercontent.com/DharunAnandan/D-Connect/main/docs/latest.json',
  // the phone app (Play Store page once published)
  phoneApp: 'https://play.google.com/store/apps/details?id=com.dharun.dconnect',
  // the PC app (downloads page: Ubuntu, Windows)
  pcApp: 'https://github.com/DharunAnandan/D-Connect/releases/latest'
}

// the oldest phone app this PC app works with (raise it when the protocol changes)
export const MIN_PHONE_VERSION = '1.0.0'

// "1.2.10" vs "1.10.0": -1, 0, 1 (anything after a + or - is ignored)
export function cmpVersion(a: string, b: string): number {
  const p = (v: string): number[] => String(v || '0').split(/[+-]/)[0].split('.').map((x) => parseInt(x, 10) || 0)
  const x = p(a)
  const y = p(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0)
    if (d) return d < 0 ? -1 : 1
  }
  return 0
}
