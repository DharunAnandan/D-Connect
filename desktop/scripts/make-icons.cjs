// Renders the D-Connect logo (a computer with a D on its screen and a phone in front) to PNGs (app icon, tray, Android launcher) with an offscreen window.
// Run: npx electron scripts/make-icons.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
<defs><linearGradient id="a" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="62" y2="62"><stop offset="0" stop-color="#8b6cff"/><stop offset=".55" stop-color="#35e0ff"/><stop offset="1" stop-color="#3ddc97"/></linearGradient>
<radialGradient id="s" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect x="2" y="2" width="60" height="60" rx="18" fill="url(#a)"/><rect x="2" y="2" width="60" height="60" rx="18" fill="url(#s)"/>
<path d="M35 39H14a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4h26a4 4 0 0 1 4 4v3" fill="none" stroke="#0b1020" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M27 39v5M20 45.5h13" fill="none" stroke="#0b1020" stroke-width="4" stroke-linecap="round"/>
<path d="M19 20.5h4c4.2 0 7 2.6 7 6s-2.8 6-7 6h-4z" fill="none" stroke="#0b1020" stroke-width="3.2" stroke-linejoin="round"/>
<path fill-rule="evenodd" d="M41.5 25h8a3.5 3.5 0 0 1 3.5 3.5v19a3.5 3.5 0 0 1-3.5 3.5h-8a3.5 3.5 0 0 1-3.5-3.5v-19a3.5 3.5 0 0 1 3.5-3.5zM41.9 29.2h7.2a1.6 1.6 0 0 1 1.6 1.6v14.4a1.6 1.6 0 0 1-1.6 1.6h-7.2a1.6 1.6 0 0 1-1.6-1.6v-14.4a1.6 1.6 0 0 1 1.6-1.6zM43.75 26.6h3.5a.55 .55 0 0 1 0 1.1h-3.5a.55 .55 0 0 1 0-1.1z" fill="#0b1020"/>
<rect x="40.3" y="29.2" width="10.4" height="17.6" rx="1.6" fill="rgba(255,255,255,0.9)"/>
<rect x="43.2" y="26.6" width="4.6" height="1.1" rx=".55" fill="rgba(255,255,255,0.9)"/></svg>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${SVG}</body></html>`))
  await new Promise((r) => setTimeout(r, 400))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  const out = path.join(__dirname, '..', 'resources')
  fs.writeFileSync(path.join(out, 'icon.png'), img.resize({ width: 512 }).toPNG())
  fs.writeFileSync(path.join(out, 'tray.png'), img.resize({ width: 24 }).toPNG())
  fs.writeFileSync(path.join(out, 'tray@2x.png'), img.resize({ width: 48 }).toPNG())
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true })
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), img.resize({ width: 512 }).toPNG())
  fs.writeFileSync(path.join(out, 'icon-1024.png'), img.toPNG())
  console.log('icons written')
  app.quit()
})
