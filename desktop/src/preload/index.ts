import { contextBridge, ipcRenderer, webUtils } from 'electron'

ipcRenderer.setMaxListeners(100) // every live view subscribes to 'evt'

const api = {
  platform: process.platform,
  invoke: <T = any>(name: string, ...args: any[]): Promise<T> => ipcRenderer.invoke('rpc', name, ...args),
  on: (channel: string, cb: (data: any) => void): (() => void) => {
    const l = (_e: unknown, ch: string, data: any): void => {
      if (ch === channel) cb(data)
    }
    ipcRenderer.on('evt', l)
    return () => ipcRenderer.removeListener('evt', l)
  },
  onVideo: (cb: (header: any, payload: Uint8Array) => void): (() => void) => {
    const l = (_e: unknown, h: any, p: Uint8Array): void => cb(h, p)
    ipcRenderer.on('video', l)
    return () => ipcRenderer.removeListener('video', l)
  },
  pathForFile: (f: File): string => webUtils.getPathForFile(f),
  // eye break overlay (side-eye's bridge)
  eyeBreakDone: (result: string): void => ipcRenderer.send('eyebreak:done', result),
  onEyeBreakEnd: (cb: () => void): void => {
    ipcRenderer.on('eyebreak:end', () => cb())
  }
}

contextBridge.exposeInMainWorld('dc', api)
export type DcApi = typeof api
