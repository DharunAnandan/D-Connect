// mDNS: announce this PC as _dconnect._tcp so a paired phone finds it after an IP change.
import { Bonjour, Service } from 'bonjour-service'
import { MDNS_TYPE } from '@shared/protocol'

export class Discovery {
  private bonjour: Bonjour | null = null
  private service: Service | null = null

  start(name: string, port: number, id: string, fp: string): void {
    try {
      this.bonjour = new Bonjour()
      this.service = this.bonjour.publish({ name: `${name}-${id.slice(0, 4)}`, type: MDNS_TYPE, port, txt: { id, fp: fp.slice(0, 16), n: name } })
    } catch {
      // no multicast here: the phone still finds us by the IPs in the QR
    }
  }

  stop(): void {
    this.service?.stop?.()
    this.bonjour?.destroy()
  }
}
