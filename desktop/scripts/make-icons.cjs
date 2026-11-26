// Renders the D-Connect logo (a laptop with a D on its screen and a phone beside it) to PNGs (app icon, tray, Android launcher) with an offscreen window.
// Run: npx electron scripts/make-icons.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
<defs><linearGradient id="a" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="62" y2="62"><stop offset="0" stop-color="#8b6cff"/><stop offset=".55" stop-color="#35e0ff"/><stop offset="1" stop-color="#3ddc97"/></linearGradient>
<radialGradient id="s" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect x="2" y="2" width="60" height="60" rx="18" fill="url(#a)"/><rect x="2" y="2" width="60" height="60" rx="18" fill="url(#s)"/>
<g transform="translate(3 -1)" fill="none" stroke="#f4f6ff" stroke-linecap="round" stroke-linejoin="round">
<path d="M10 38V20a3.5 3.5 0 0 1 3.5-3.5h23a3.5 3.5 0 0 1 3.5 3.5v4.5" stroke-width="3.4"/>
<path d="M6 42.5h27" stroke-width="3.4"/>
<path d="M20 22.5h3c3.3 0 5.5 2.2 5.5 5s-2.2 5-5.5 5h-3z" stroke-width="3"/>
<path d="M41.5 27h7a3.5 3.5 0 0 1 3.5 3.5v16a3.5 3.5 0 0 1-3.5 3.5h-7a3.5 3.5 0 0 1-3.5-3.5v-16a3.5 3.5 0 0 1 3.5-3.5z" stroke-width="3.4"/>
<path d="M43.5 31h3" stroke-width="2.4"/></g>
</svg>`

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
