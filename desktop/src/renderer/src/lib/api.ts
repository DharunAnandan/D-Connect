import { useEffect, useState } from 'react'

export const dc = window.dc
export const call = <T = any>(name: string, ...args: any[]): Promise<T> => dc.invoke<T>(name, ...args)

// Load with an rpc and keep fresh with an event.
export function useLive<T>(rpc: string | null, event: string, initial: T, ...args: any[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial)
  useEffect(() => {
    let alive = true
    if (rpc) call<T>(rpc, ...args).then((x) => alive && x !== undefined && setV(x)).catch(() => {})
    const off = dc.on(event, (d) => setV(d))
    return () => {
      alive = false
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, event])
  return [v, setV]
}

export function useEvent(event: string, cb: (d: any) => void): void {
  useEffect(() => dc.on(event, cb), [event, cb])
}
