// Development only (DC_DEV_CONTROL=<dir>): drive the running app from a file so screens can be
// checked without clicking. Write lines like "nav /messages" or "snap home" to <dir>/cmd.
import fs from 'fs'
import path from 'path'
import { BrowserWindow } from 'electron'

export function devControl(getMain: () => BrowserWindow | null, rpc: (name: string, ...a: any[]) => any): void {
  const dir = process.env.DC_DEV_CONTROL
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'cmd')
  fs.writeFileSync(file, '')
  const log = path.join(dir, 'console.log')
  const hook = (w: BrowserWindow): void => {
    w.webContents.on('console-message', (e: any) => {
      if (e.level === 'error' || e.level === 'warning') fs.appendFileSync(log, `[${e.level}] ${e.message}\n`)
    })
  }
  setInterval(() => {
    for (const w of BrowserWindow.getAllWindows()) if (!(w as any).__hooked) { (w as any).__hooked = true; hook(w) }
  }, 500)
  let busy = false
  setInterval(async () => {
    if (busy) return
    const text = fs.readFileSync(file, 'utf8').trim()
    if (!text) return
    busy = true
    fs.writeFileSync(file, '')
    for (const line of text.split('\n')) {
      const [cmd, ...rest] = line.trim().split(' ')
      const arg = rest.join(' ')
      const main = getMain()
      try {
        if (cmd === 'nav') main?.webContents.send('evt', 'navigate', arg)
        else if (cmd === 'snap') {
          const img = await main!.webContents.capturePage()
          fs.writeFileSync(path.join(dir, `${arg || 'snap'}.png`), img.toPNG())
        } else if (cmd === 'snapall') {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isVisible()) continue
            const img = await w.webContents.capturePage()
            fs.writeFileSync(path.join(dir, `${arg}-${w.id}.png`), img.toPNG())
          }
        } else if (cmd === 'rpc') {
          const [name, ...args] = arg.split(' ')
          const r = await rpc(name, ...args.map((a) => (a === 'true' ? true : a === 'false' ? false : isNaN(+a) ? a : +a)))
          fs.writeFileSync(path.join(dir, `rpc-${name}.json`), JSON.stringify(r ?? null, null, 2))
        } else if (cmd === 'evalall') {
          const out: Record<string, any> = {}
          for (const w of BrowserWindow.getAllWindows()) if (w.isVisible()) out[`${w.id}:${w.webContents.getURL().split('#')[1] || '/'}`] = await w.webContents.executeJavaScript(arg).catch((e) => String(e))
          fs.writeFileSync(path.join(dir, 'evalall.json'), JSON.stringify(out, null, 2))
        } else if (cmd === 'eval') {
          const r = await main!.webContents.executeJavaScript(arg)
          fs.writeFileSync(path.join(dir, 'eval.json'), JSON.stringify(r ?? null))
        }
      } catch (e) {
        fs.writeFileSync(path.join(dir, 'error.txt'), String(e))
      }
    }
    busy = false
  }, 300)
}
