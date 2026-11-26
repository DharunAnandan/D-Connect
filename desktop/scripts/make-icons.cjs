// Renders the D-Connect logo (a laptop with a D on its screen and a phone beside it) to PNGs (app icon, tray, Android launcher) with an offscreen window.
// Run: npx electron scripts/make-icons.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
<defs><linearGradient id="a" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="62" y2="62"><stop offset="0" stop-color="#8a6dfc"/><stop offset=".55" stop-color="#45c9f7"/><stop offset="1" stop-color="#3fd8a8"/></linearGradient>
<radialGradient id="s" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.8" stdDeviation="1.1" flood-color="#000" flood-opacity="0.55"/></filter><rect x="3.5" y="3.5" width="57" height="57" rx="17" fill="url(#a)" filter="url(#sh)"/><rect x="3.5" y="3.5" width="57" height="57" rx="17" fill="url(#s)"/><rect x="3.75" y="3.75" width="56.5" height="56.5" rx="16.8" fill="none" stroke="#000" stroke-opacity="0.28" stroke-width="0.6"/>
<g transform="translate(32 32) scale(0.9) translate(-25.5 -30.5)">
<path d="M31 36H12a3 3 0 0 1-3-3V18a3 3 0 0 1 3-3h24a3 3 0 0 1 3 3v3.5" fill="none" stroke="#0b1020" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
<path fill-rule="evenodd" d="M7 39.5h25.5v4.2h-22.5a3 3 0 0 1-3-3zM21 39.5h6v.9a.6 .6 0 0 1-.6 .6h-4.8a.6 .6 0 0 1-.6-.6z" fill="#0b1020"/>
<path d="M18 20.5h2.8c3 0 5 2.1 5 4.8s-2 4.8-5 4.8h-2.8z" fill="none" stroke="#0b1020" stroke-width="2.8" stroke-linejoin="round"/>
<path d="M38 24h6a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-16a3 3 0 0 1 3-3z" fill="none" stroke="#0b1020" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M39.6 27.8h2.8" fill="none" stroke="#0b1020" stroke-width="2.2" stroke-linecap="round"/></g>
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
