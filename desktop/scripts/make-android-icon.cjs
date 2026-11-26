// Renders the Android adaptive-icon foreground (the computer-and-phone mark with its D, on transparent, inside the 66dp safe
// zone of the 108dp canvas). The gradient background is a drawable, so no white plate.
// Run: npm run icons:android
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const glyph = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-3.5 -2.5 70 70">
<path d="M35 39H14a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4h26a4 4 0 0 1 4 4v3" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M27 39v5M20 45.5h13" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
<path d="M19 20.5h4c4.2 0 7 2.6 7 6s-2.8 6-7 6h-4z" fill="none" stroke="${color}" stroke-width="3.2" stroke-linejoin="round"/>
<path fill-rule="evenodd" d="M41.5 25h8a3.5 3.5 0 0 1 3.5 3.5v19a3.5 3.5 0 0 1-3.5 3.5h-8a3.5 3.5 0 0 1-3.5-3.5v-19a3.5 3.5 0 0 1 3.5-3.5zM41.9 29.2h7.2a1.6 1.6 0 0 1 1.6 1.6v14.4a1.6 1.6 0 0 1-1.6 1.6h-7.2a1.6 1.6 0 0 1-1.6-1.6v-14.4a1.6 1.6 0 0 1 1.6-1.6zM43.75 26.6h3.5a.55 .55 0 0 1 0 1.1h-3.5a.55 .55 0 0 1 0-1.1z" fill="${color}"/>
<rect x="40.3" y="29.2" width="10.4" height="17.6" rx="1.6" fill="${color === '#ffffff' ? 'transparent' : 'rgba(255,255,255,0.9)'}"/>
<rect x="43.2" y="26.6" width="4.6" height="1.1" rx=".55" fill="${color === '#ffffff' ? 'transparent' : 'rgba(255,255,255,0.9)'}"/></svg>`
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
