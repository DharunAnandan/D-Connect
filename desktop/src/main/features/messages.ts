// SMS threads and calls: the phone does the telephony, the PC is the screen and keyboard.
import type { CallState } from '@shared/protocol'
import type { Ctx } from '../context'

export function messages(ctx: Ctx, openCall: (c: CallState) => void, closeCall: () => void, answeredHere: () => void = () => {}, muteHere: (m: boolean) => void = () => {}): void {
  let call: CallState = { state: 'idle' }

  ctx.hub.on('message', (type, data) => {
    if (type === 'sms.received') {
      ctx.emit('sms.received', data)
      ctx.toast({
        id: 'sms:' + data.id,
        kind: 'sms',
        title: data.name || data.address,
        body: data.body,
        reply: { kind: 'sms', address: data.address }
      })
    } else if (type === 'call.route.result' && ['hold', 'swap', 'merge'].includes(data?.action) && !data.ok) {
      // hold / swap / merge couldn't be pressed on the phone's call screen: say so on the card
      ctx.emit('call.hint', `Couldn't ${data.action} from here: the phone's call screen had no ${data.action === 'hold' ? 'Hold' : data.action === 'swap' ? 'Swap' : 'Merge'} button. Use the phone for this one.`)
    } else if (type === 'call.state') {
      call = data
      // the call card window merges in an app call waiting on top, and sends it to every window
      if (call.state === 'ringing' || call.state === 'offhook' || call.state === 'dialing') openCall(call)
      else {
        ctx.emit('call', call)
        closeCall()
      }
    }
  })
  ctx.hub.on('disconnected', () => {
    call = { state: 'idle' }
    ctx.emit('call', call)
    closeCall()
  })

  ctx.handle('smsThreads', () => ctx.hub.request('sms.threads.get', {}))
  ctx.handle('smsMessages', (threadId: string) => ctx.hub.request('sms.messages.get', { threadId }))
  ctx.handle('smsSend', (address: string, body: string) => ctx.hub.request('sms.send', { address, body }))
  ctx.handle('contacts', (q: string) => ctx.hub.request('contacts.search', { q }))
  ctx.handle('callLog', () => ctx.hub.request('calllog.get', {}))
  ctx.handle('call', () => call)
  ctx.handle('callAnswer', () => {
    answeredHere() // audio for this call plays on the PC
    ctx.hub.send('call.answer')
  })
  ctx.handle('callReject', () => ctx.hub.send('call.reject'))
  ctx.handle('callEnd', () => ctx.hub.send('call.end'))
  ctx.handle('callDial', (number: string, sim?: number) => {
    answeredHere()
    ctx.hub.send('call.dial', { number, sim })
  })
  ctx.handle('sims', async () => ((await ctx.hub.request('calls.sims', {}).catch(() => null)) as any)?.sims || [])
  ctx.handle('callControl', (action: 'hold' | 'swap' | 'merge') => ctx.hub.request('call.control', { action }).catch(() => ({ ok: false })))
  ctx.handle('callMute', (muted: boolean) => {
    muteHere(muted) // the laptop mic, when the call is on this PC
    ctx.hub.send('call.mute', { muted }) // and the phone's own mic
  })
}
