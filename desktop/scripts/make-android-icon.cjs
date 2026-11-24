// Renders the Android adaptive-icon foreground (the "D" on transparent, inside the 66dp safe
// zone of the 108dp canvas). The gradient background is a drawable, so no white plate.
// Run: npm run icons:android
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const glyph = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-8.5 -11 83.5 83.5">
<path d="M22 18h9c9 0 15 6 15 14s-6 14-15 14h-9z" fill="none" stroke="${color}" stroke-width="5.5" stroke-linejoin="round"/>
<circle cx="31" cy="32" r="4.5" fill="${color}"/></svg>`
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
