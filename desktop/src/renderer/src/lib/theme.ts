// Colour themes. The fixed ones are plain CSS (index.css, [data-theme]). "auto" blends through
// all of them, one every 5 seconds (held ~3.5 s, then a 1.5 s fade), by setting the colour
// variables on the page; every window follows the same clock so they change together.
type Rgb = [number, number, number]
type Palette = Record<string, Rgb>

const P: Record<string, Palette> = {
  aurora: { 'ink-950': [5, 7, 15], 'ink-900': [7, 10, 20], 'ink-850': [11, 16, 32], 'ink-800': [16, 23, 43], 'ink-700': [24, 33, 58], violet: [124, 92, 255], 'violet-soft': [160, 139, 255], cyan: [53, 224, 255], 'cyan-soft': [139, 233, 255], mint: [61, 220, 151], pink: [255, 92, 168] },
  sunset: { 'ink-950': [14, 6, 10], 'ink-900': [20, 9, 15], 'ink-850': [30, 14, 22], 'ink-800': [42, 20, 30], 'ink-700': [58, 28, 40], violet: [255, 107, 107], 'violet-soft': [255, 160, 150], cyan: [255, 179, 71], 'cyan-soft': [255, 210, 140], mint: [255, 214, 102], pink: [255, 92, 168] },
  ocean: { 'ink-950': [2, 8, 18], 'ink-900': [4, 12, 26], 'ink-850': [8, 20, 40], 'ink-800': [12, 28, 54], 'ink-700': [18, 40, 74], violet: [56, 132, 255], 'violet-soft': [125, 175, 255], cyan: [45, 212, 191], 'cyan-soft': [125, 235, 220], mint: [94, 234, 212], pink: [129, 140, 248] },
  forest: { 'ink-950': [4, 10, 7], 'ink-900': [6, 14, 10], 'ink-850': [10, 22, 16], 'ink-800': [15, 32, 23], 'ink-700': [22, 46, 33], violet: [52, 211, 153], 'violet-soft': [120, 230, 185], cyan: [163, 230, 53], 'cyan-soft': [200, 240, 120], mint: [110, 231, 183], pink: [250, 204, 21] },
  graphite: { 'ink-950': [8, 8, 10], 'ink-900': [12, 12, 15], 'ink-850': [20, 20, 24], 'ink-800': [28, 28, 34], 'ink-700': [40, 40, 48], violet: [160, 170, 190], 'violet-soft': [200, 206, 220], cyan: [226, 232, 240], 'cyan-soft': [240, 244, 250], mint: [134, 239, 172], pink: [244, 114, 182] }
}
const ORDER = ['aurora', 'ocean', 'forest', 'sunset', 'graphite']
const STEP = 5000 // ms per theme
const FADE = 0.3 // the last 30% of each step blends into the next

let timer: ReturnType<typeof setInterval> | null = null

function paint(): void {
  const t = Date.now() / STEP
  const i = Math.floor(t) % ORDER.length
  const k = t - Math.floor(t)
  const f = k < 1 - FADE ? 0 : (k - (1 - FADE)) / FADE
  const e = f * f * (3 - 2 * f) // smooth
  const a = P[ORDER[i]]
  const b = P[ORDER[(i + 1) % ORDER.length]]
  const root = document.documentElement.style
  for (const key of Object.keys(a)) {
    const c = a[key].map((v, j) => Math.round(v + (b[key][j] - v) * e))
    root.setProperty(`--c-${key}`, c.join(' '))
  }
}

export function applyTheme(name?: string): void {
  const theme = name || 'aurora'
  document.documentElement.dataset.theme = theme
  if (theme === 'auto') {
    paint()
    if (!timer) timer = setInterval(paint, 80)
  } else {
    if (timer) clearInterval(timer)
    timer = null
    // back to the stylesheet's colours for the chosen theme
    for (const key of Object.keys(P.aurora)) document.documentElement.style.removeProperty(`--c-${key}`)
  }
}
