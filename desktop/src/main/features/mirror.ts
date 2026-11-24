// Screen mirror: H.264 from the phone's hardware encoder, decoded in the renderer by WebCodecs.
// Mouse and keys go back and the phone's accessibility service turns them into touches.
import { Channel } from '@shared/protocol'
import type { Ctx } from '../context'

export function mirror(ctx: Ctx, video: (header: any, payload: Buffer) => void): void {
  let active = false
  ctx.hub.on('binary', (channel, header, payload) => {
    if (channel === Channel.Video && active) video(header, payload)
  })
  ctx.hub.on('message', (type, data) => {
    if (type === 'mirror.started') {
      active = true
      ctx.emit('mirror', { state: 'on', ...data })
    } else if (type === 'mirror.stopped' || type === 'mirror.denied') {
      active = false
      ctx.emit('mirror', { state: type === 'mirror.denied' ? 'denied' : 'off', ...data })
    } else if (type === 'mirror.control') {
      ctx.emit('mirror.control', !!data?.control)
    } else if (type === 'mirror.error') {
      active = false
      ctx.emit('mirror', { state: 'error', ...data })
    }
  })
  ctx.hub.on('disconnected', () => {
    active = false
    ctx.emit('mirror', { state: 'off' })
  })
  ctx.handle('mirrorStart', (o: { maxSize?: number; bitrate?: number; fps?: number }) => {
    ctx.emit('mirror', { state: 'starting' })
    ctx.hub.send('mirror.start', { maxSize: o?.maxSize ?? 1600, bitrate: o?.bitrate ?? 8_000_000, fps: o?.fps ?? 60 })
  })
  ctx.handle('mirrorStop', () => ctx.hub.send('mirror.stop'))
  ctx.handle('openPhoneSetting', (which: string) => ctx.hub.send('open.setting', { which }))
  ctx.handle('mirrorKeyframe', () => ctx.hub.send('mirror.keyframe'))
  ctx.handle('inputTouch', (e: { action: string; x: number; y: number }) => ctx.hub.send('input.touch', e))
  ctx.handle('inputScroll', (e: { x: number; y: number; dy: number }) => ctx.hub.send('input.scroll', e))
  ctx.handle('inputKey', (action: string) => ctx.hub.send('input.key', { action }))
  ctx.handle('inputText', (text: string) => ctx.hub.send('input.text', { text }))
}
