// Renders the Android adaptive-icon foreground (the laptop-and-phone mark with its D, on transparent, inside the 66dp safe
// zone of the 108dp canvas). The gradient background is a drawable, so no white plate.
// Run: npm run icons:android
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const glyph = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-2.5 -2.5 69 69">
<g transform="translate(3 -1)" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">
<path d="M10 38V20a3.5 3.5 0 0 1 3.5-3.5h23a3.5 3.5 0 0 1 3.5 3.5v4.5" stroke-width="3.4"/>
<path d="M6 42.5h27" stroke-width="3.4"/>
<path d="M20 22.5h3c3.3 0 5.5 2.2 5.5 5s-2.2 5-5.5 5h-3z" stroke-width="3"/>
<path d="M41.5 27h7a3.5 3.5 0 0 1 3.5 3.5v16a3.5 3.5 0 0 1-3.5 3.5h-7a3.5 3.5 0 0 1-3.5-3.5v-16a3.5 3.5 0 0 1 3.5-3.5z" stroke-width="3.4"/>
<path d="M43.5 31h3" stroke-width="2.4"/></g></svg>`
const RES = path.join(__dirname, '..', '..', 'mobile', 'android', 'app', 'src', 'main', 'res')
const SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  for (const [name, color] of [['ic_launcher_foreground', '#f4f6ff'], ['ic_launcher_monochrome', '#ffffff']]) {
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
