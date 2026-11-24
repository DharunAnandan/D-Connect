// The TLS identity of this PC: a self-signed cert made once. The phone pins its fingerprint
// from the pairing QR, so no CA is needed and nobody else on the network can pose as this PC.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import forge from 'node-forge'

export interface Identity {
  key: string
  cert: string
  fingerprint: string
  id: string
}

export function fingerprintOf(certPem: string): string {
  return new crypto.X509Certificate(certPem).fingerprint256.replace(/:/g, '').toLowerCase()
}

export function loadIdentity(dir: string, hostname: string): Identity {
  const file = path.join(dir, 'identity.json')
  try {
    const id = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (id.key && id.cert && id.id) return { ...id, fingerprint: fingerprintOf(id.cert) }
  } catch {
    // make one
  }
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01' + crypto.randomBytes(8).toString('hex')
  cert.validity.notBefore = new Date(Date.now() - 86400000)
  cert.validity.notAfter = new Date(Date.now() + 20 * 365 * 86400000)
  const attrs = [{ name: 'commonName', value: `D-Connect ${hostname}` }, { name: 'organizationName', value: 'D-Connect' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const out = {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
    id: crypto.randomUUID()
  }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify(out), { mode: 0o600 })
  return { ...out, fingerprint: fingerprintOf(out.cert) }
}
