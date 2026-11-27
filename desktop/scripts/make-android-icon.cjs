// Renders the Android adaptive-icon foreground (the laptop-and-phone mark with its D, on transparent, inside the 66dp safe
// zone of the 108dp canvas). The gradient background is a drawable, so no white plate.
// Run: npm run icons:android
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

// the mark alone (monochrome / themed icons), or on the colour tile (the launcher icon; the
// adaptive background behind it is black, so it sits in a black rounded box)
const glyph = (color, tile) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-6 -6 76 76">
<defs><linearGradient id="a" gradientUnits="userSpaceOnUse" x1="11" y1="11" x2="53" y2="53"><stop offset="0" stop-color="#8a6dfc"/><stop offset=".55" stop-color="#45c9f7"/><stop offset="1" stop-color="#3fd8a8"/></linearGradient>
<radialGradient id="s" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
${tile ? '<rect x="11" y="11" width="42" height="42" rx="11.5" fill="url(#a)"/><rect x="11" y="11" width="42" height="42" rx="11.5" fill="url(#s)"/>' : ''}
<g transform="translate(32 32) scale(${tile ? 0.74 : 0.9}) translate(-27 -30.5)">
<path d="M30 36H12a3 3 0 0 1-3-3V18a3 3 0 0 1 3-3h24a3 3 0 0 1 3 3v3.5" fill="none" stroke="${color}" stroke-width="4.3" stroke-linecap="round" stroke-linejoin="round"/>
<path fill-rule="evenodd" d="M7 39.5h24.3v4.2h-21.3a3 3 0 0 1-3-3zM21 39.5h6v.9a.6 .6 0 0 1-.6 .6h-4.8a.6 .6 0 0 1-.6-.6z" fill="${color}"/>
<path d="M18 20.5h2.8c3 0 5 2.1 5 4.8s-2 4.8-5 4.8h-2.8z" fill="none" stroke="${color}" stroke-width="3.9" stroke-linejoin="round"/>
<path d="M38 24h6a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-16a3 3 0 0 1 3-3z" fill="none" stroke="${color}" stroke-width="4.3" stroke-linejoin="round"/>
<path d="M39.6 27.8h2.8" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/></g></svg>`
const RES = path.join(__dirname, '..', '..', 'mobile', 'android', 'app', 'src', 'main', 'res')
const SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  for (const [name, color, tile] of [['ic_launcher_foreground', '#0b1020', true], ['ic_launcher_monochrome', '#ffffff', false]]) {
    await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${glyph(color, tile)}</body></html>`))
    await new Promise((r) => setTimeout(r, 300))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
    for (const [d, s] of Object.entries(SIZES)) {
      fs.mkdirSync(path.join(RES, `mipmap-${d}`), { recursive: true })
      fs.writeFileSync(path.join(RES, `mipmap-${d}`, `${name}.png`), img.resize({ width: s, quality: 'best' }).toPNG())
    }
  }
  console.log('android icon layers written')
  app.quit()
})
