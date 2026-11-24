// Decode an H.264 Annex-B stream (as sent by the phone's encoder) onto a canvas with WebCodecs.
export function codecFromSps(config: Uint8Array): string {
  for (let i = 0; i < config.length - 6; i++) {
    if (config[i] === 0 && config[i + 1] === 0 && config[i + 2] === 1 && (config[i + 3] & 0x1f) === 7) {
      const h = (b: number): string => b.toString(16).padStart(2, '0')
      return `avc1.${h(config[i + 4])}${h(config[i + 5])}${h(config[i + 6])}`
    }
  }
  return 'avc1.42E01F'
}

export class StreamDecoder {
  private decoder: VideoDecoder | null = null
  private config: Uint8Array | null = null
  private waitingKey = true
  frames = 0

  constructor(private canvas: () => HTMLCanvasElement | null, private onSize?: (w: number, h: number) => void) {}

  push(h: { config?: boolean; key?: boolean; pts?: number }, data: Uint8Array): void {
    if (h.config) return this.setup(data)
    if (!this.decoder || this.decoder.state !== 'configured') return
    if (this.waitingKey && !h.key) return
    let chunk = data
    if (h.key && this.config) {
      chunk = new Uint8Array(this.config.length + data.length)
      chunk.set(this.config)
      chunk.set(data, this.config.length)
    }
    this.waitingKey = false
    if (this.decoder.decodeQueueSize > 6) return
    this.decoder.decode(new EncodedVideoChunk({ type: h.key ? 'key' : 'delta', timestamp: h.pts || 0, data: chunk }))
  }

  private setup(cfg: Uint8Array): void {
    this.decoder?.close()
    this.config = new Uint8Array(cfg)
    this.waitingKey = true
    this.decoder = new VideoDecoder({
      output: (frame) => {
        const c = this.canvas()
        if (c) {
          if (c.width !== frame.displayWidth || c.height !== frame.displayHeight) {
            c.width = frame.displayWidth
            c.height = frame.displayHeight
            this.onSize?.(c.width, c.height)
          }
          c.getContext('2d')!.drawImage(frame, 0, 0)
        }
        frame.close()
        this.frames++
      },
      error: () => {
        this.waitingKey = true
      }
    })
    this.decoder.configure({ codec: codecFromSps(cfg), optimizeForLatency: true })
  }

  close(): void {
    this.decoder?.close()
  }
}
