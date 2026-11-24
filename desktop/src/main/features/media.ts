// Media both ways. PC players over MPRIS (Linux) for the phone's remote; the phone's
// MediaSession shown on the PC with play/pause/next.
import type { MediaCmd, MediaPlayerState } from '@shared/protocol'
import type { Ctx } from '../context'

type Bus = any

async function mprisBus(): Promise<Bus | null> {
  if (process.platform !== 'linux') return null
  try {
    const dbus = await import('dbus-next')
    return dbus.sessionBus()
  } catch {
    return null
  }
}

function v(x: any): any {
  return x && typeof x === 'object' && 'value' in x ? x.value : x
}

export function media(ctx: Ctx): void {
  let bus: Bus | null = null
  let pcPlayers: MediaPlayerState[] = []
  let phone: MediaPlayerState | null = null

  const listPlayers = async (): Promise<MediaPlayerState[]> => {
    bus = bus || (await mprisBus())
    if (!bus) return []
    const dbusObj = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
    const names: string[] = await dbusObj.getInterface('org.freedesktop.DBus').ListNames()
    const out: MediaPlayerState[] = []
    for (const name of names.filter((n) => n.startsWith('org.mpris.MediaPlayer2.'))) {
      try {
        const obj = await bus.getProxyObject(name, '/org/mpris/MediaPlayer2')
        const props = obj.getInterface('org.freedesktop.DBus.Properties')
        const all = await props.GetAll('org.mpris.MediaPlayer2.Player')
        const meta = v(all.Metadata) || {}
        const root = await props.Get('org.mpris.MediaPlayer2', 'Identity').catch(() => null)
        out.push({
          id: name,
          app: v(root) || name.replace('org.mpris.MediaPlayer2.', '').split('.')[0],
          title: v(meta['xesam:title']) || 'Unknown',
          artist: (v(meta['xesam:artist']) || []).join(', '),
          album: v(meta['xesam:album']),
          art: v(meta['mpris:artUrl']),
          playing: v(all.PlaybackStatus) === 'Playing',
          position: Number(v(all.Position) || 0) / 1e6,
          length: Number(v(meta['mpris:length']) || 0) / 1e6
        })
      } catch {
        // a player that went away mid-query
      }
    }
    return out
  }

  const pcCommand = async (id: string, cmd: MediaCmd): Promise<void> => {
    bus = bus || (await mprisBus())
    if (!bus) return
    const obj = await bus.getProxyObject(id, '/org/mpris/MediaPlayer2')
    const p = obj.getInterface('org.mpris.MediaPlayer2.Player')
    const map: Record<string, string> = { play: 'Play', pause: 'Pause', toggle: 'PlayPause', next: 'Next', prev: 'Previous' }
    if (map[cmd]) await p[map[cmd]]()
    setTimeout(refresh, 300)
  }

  const refresh = async (): Promise<void> => {
    const list = await listPlayers().catch(() => [])
    if (JSON.stringify(list) === JSON.stringify(pcPlayers)) return
    pcPlayers = list
    ctx.emit('media.pc', pcPlayers)
    ctx.hub.send('media.pc.state', { players: pcPlayers.map(({ art, ...p }) => ({ ...p, art: art?.startsWith('http') ? art : undefined })) })
  }
  setInterval(() => ctx.hub.session && refresh(), 2500)
  ctx.hub.on('connected', () => {
    pcPlayers = []
    refresh()
  })

  ctx.hub.on('message', (type, data) => {
    if (type === 'media.pc.cmd') pcCommand(data.id || pcPlayers.find((p) => p.playing)?.id || pcPlayers[0]?.id, data.cmd).catch(() => {})
    else if (type === 'media.phone.state') {
      phone = data.title ? data : null
      ctx.emit('media.phone', phone)
    }
  })
  ctx.hub.on('disconnected', () => {
    phone = null
    ctx.emit('media.phone', null)
  })

  ctx.handle('mediaPc', () => pcPlayers)
  ctx.handle('mediaPhone', () => phone)
  ctx.handle('mediaPhoneCmd', (cmd: MediaCmd) => ctx.hub.send('media.phone.cmd', { cmd }))
  ctx.handle('mediaPcCmd', (id: string, cmd: MediaCmd) => pcCommand(id, cmd))
}
