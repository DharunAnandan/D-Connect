// Renders the Android adaptive-icon foreground (the laptop-and-phone mark with its D, on transparent, inside the 66dp safe
// zone of the 108dp canvas). The gradient background is a drawable, so no white plate.
// Run: npm run icons:android
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const glyph = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-2.5 -2.5 69 69">
<g transform="translate(3 1)">
<path d="M8 39V21a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v18" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M4 41.5h36" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
<path d="M18 23.5h3.5c3.6 0 6 2.2 6 5s-2.4 5-6 5h-3.5z" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>
<path fill-rule="evenodd" d="M45.2 24h6.6a3.2 3.2 0 0 1 3.2 3.2v19.6a3.2 3.2 0 0 1-3.2 3.2h-6.6a3.2 3.2 0 0 1-3.2-3.2v-19.6a3.2 3.2 0 0 1 3.2-3.2zM45.6 28.2h5.8a1.4 1.4 0 0 1 1.4 1.4v15a1.4 1.4 0 0 1-1.4 1.4h-5.8a1.4 1.4 0 0 1-1.4-1.4v-15a1.4 1.4 0 0 1 1.4-1.4zM47 25.5h3a.5 .5 0 0 1 0 1h-3a.5 .5 0 0 1 0-1z" fill="${color}"/></g></svg>`
const RES = path.join(__dirname, '..', '..', 'mobile', 'android', 'app', 'src', 'main', 'res')
const SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  for (const [name, color] of [['ic_launcher_foreground', '#0b1020'], ['ic_launcher_monochrome', '#ffffff']]) {
    await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${glyph(color)}</body></html>`))
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
