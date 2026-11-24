// The phone as touchpad, keyboard and presenter for the PC.
// Linux: our uinput helper (Wayland and X11), else xdotool. Windows: a resident PowerShell
// driving SendInput through user32.
import { ChildProcessWithoutNullStreams, execFile, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app, clipboard } from 'electron'
import type { Ctx } from '../context'

interface Backend {
  name: string
  send(m: any): void
  stop(): void
}

function resource(name: string): string {
  const base = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources') : path.join(app.getAppPath(), 'resources')
  return path.join(base, name)
}

function uinputBackend(): Backend | null {
  try {
    fs.accessSync('/dev/uinput', fs.constants.W_OK)
  } catch {
    return null
  }
  let proc: ChildProcessWithoutNullStreams | null = null
  const ensure = (): ChildProcessWithoutNullStreams => {
    if (proc && !proc.killed && proc.exitCode === null) return proc
    proc = spawn('python3', [resource('uinput_helper.py')], { stdio: 'pipe' })
    proc.on('error', () => (proc = null))
    proc.stderr.on('data', () => {})
    return proc
  }
  return {
    name: 'uinput',
    send: (m) => ensure().stdin.write(JSON.stringify(m) + '\n'),
    stop: () => proc?.kill()
  }
}

function xdotoolBackend(): Backend | null {
  if (process.env.XDG_SESSION_TYPE === 'wayland') return null
  const x = (args: string[]): void => {
    execFile('xdotool', args, () => {})
  }
  const btn: Record<string, string> = { left: '1', middle: '2', right: '3' }
  const keymap: Record<string, string> = { enter: 'Return', backspace: 'BackSpace', esc: 'Escape', tab: 'Tab', space: 'space', up: 'Up', down: 'Down', left: 'Left', right: 'Right', home: 'Home', end: 'End', pageup: 'Prior', pagedown: 'Next', delete: 'Delete', volumeup: 'XF86AudioRaiseVolume', volumedown: 'XF86AudioLowerVolume', mute: 'XF86AudioMute', playpause: 'XF86AudioPlay', nextsong: 'XF86AudioNext', previoussong: 'XF86AudioPrev', leftctrl: 'ctrl', leftalt: 'alt', leftshift: 'shift', leftmeta: 'super', f5: 'F5' }
  let acc = 0
  return {
    name: 'xdotool',
    send: (m) => {
      if (m.t === 'move') x(['mousemove_relative', '--', String(m.dx), String(m.dy)])
      else if (m.t === 'btn') x([m.s === 'down' ? 'mousedown' : m.s === 'up' ? 'mouseup' : 'click', btn[m.b] || '1'])
      else if (m.t === 'scroll') {
        acc += m.dy || 0
        while (Math.abs(acc) >= 120) {
          x(['click', acc > 0 ? '4' : '5'])
          acc -= Math.sign(acc) * 120
        }
      } else if (m.t === 'key') x(['key', keymap[m.k] || m.k])
      else if (m.t === 'combo') x(['key', m.k.map((k: string) => keymap[k] || k).join('+')])
      else if (m.t === 'text') x(['type', '--delay', '4', m.s])
    },
    stop: () => {}
  }
}

function windowsBackend(): Backend | null {
  if (process.platform !== 'win32') return null
  const ps = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-Command', '-'], { stdio: 'pipe' })
  ps.stdin.write(`Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class DC { [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, int f, int e); }
"@
`)
  const vk: Record<string, number> = { enter: 0x0d, backspace: 0x08, esc: 0x1b, tab: 0x09, space: 0x20, left: 0x25, up: 0x26, right: 0x27, down: 0x28, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, delete: 0x2e, volumeup: 0xaf, volumedown: 0xae, mute: 0xad, playpause: 0xb3, nextsong: 0xb0, previoussong: 0xb1, leftctrl: 0x11, leftshift: 0x10, leftalt: 0x12, leftmeta: 0x5b, f5: 0x74, v: 0x56 }
  const flags: Record<string, [number, number]> = { left: [0x02, 0x04], right: [0x08, 0x10], middle: [0x20, 0x40] }
  const run = (s: string): void => {
    ps.stdin.write(s + '\n')
  }
  return {
    name: 'sendinput',
    send: (m) => {
      if (m.t === 'move') run(`[DC]::mouse_event(1, ${m.dx | 0}, ${m.dy | 0}, 0, 0)`)
      else if (m.t === 'btn') {
        const [d, u] = flags[m.b] || flags.left
        if (m.s !== 'up') run(`[DC]::mouse_event(${d},0,0,0,0)`)
        if (m.s !== 'down') run(`[DC]::mouse_event(${u},0,0,0,0)`)
      } else if (m.t === 'scroll') run(`[DC]::mouse_event(0x0800,0,0,${-(m.dy | 0)},0)`)
      else if (m.t === 'key' && vk[m.k] !== undefined) run(`[DC]::keybd_event(${vk[m.k]},0,0,0); [DC]::keybd_event(${vk[m.k]},0,2,0)`)
      else if (m.t === 'combo') {
        const codes = m.k.map((k: string) => vk[k] ?? k.toUpperCase().charCodeAt(0))
        run(codes.map((c: number) => `[DC]::keybd_event(${c},0,0,0)`).join(';') + ';' + codes.reverse().map((c: number) => `[DC]::keybd_event(${c},0,2,0)`).join(';'))
      } else if (m.t === 'text') {
        const esc = m.s.replace(/'/g, "''").replace(/[+^%~(){}[\]]/g, '{$&}')
        run(`[System.Windows.Forms.SendKeys]::SendWait('${esc}')`)
      }
    },
    stop: () => ps.kill()
  }
}

export function remoteInput(ctx: Ctx): void {
  let backend: Backend | null = null
  const get = (): Backend | null => (backend = backend || windowsBackend() || uinputBackend() || xdotoolBackend())

  const send = async (m: any): Promise<void> => {
    const b = get()
    if (!b) return
    // anything a keyboard layout can't type goes in by paste
    if (m.t === 'text' && /[^\x20-\x7e\n\t]/.test(m.s)) {
      const before = await clipboard.readText()
      await clipboard.writeText(m.s)
      b.send({ t: 'combo', k: ['leftctrl', 'v'] })
      setTimeout(() => clipboard.writeText(before), 400)
      return
    }
    b.send(m)
  }

  ctx.hub.on('message', (type, data) => {
    switch (type) {
      case 'pc.mouse.move':
        return void send({ t: 'move', dx: Math.round(data.dx), dy: Math.round(data.dy) })
      case 'pc.mouse.button':
        return void send({ t: 'btn', b: data.button || 'left', s: data.state || 'click' })
      case 'pc.mouse.scroll':
        return void send({ t: 'scroll', dy: Math.round(data.dy || 0), dx: Math.round(data.dx || 0) })
      case 'pc.key':
        return void send({ t: 'key', k: data.key })
      case 'pc.combo':
        return void send({ t: 'combo', k: data.keys })
      case 'pc.text':
        return void send({ t: 'text', s: data.text })
      case 'pc.slide':
        return void send({ t: 'key', k: data.dir === 'prev' ? 'left' : data.dir === 'start' ? 'f5' : data.dir === 'end' ? 'esc' : 'right' })
    }
  })

  ctx.handle('inputBackend', () => get()?.name || 'none')
}
