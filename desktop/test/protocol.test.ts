import { describe, expect, it } from 'vitest'
import { Channel, decodeBinary, encodeBinary, pairUri, parsePairUri } from '../src/shared/protocol'

describe('protocol', () => {
  it('round-trips binary frames', () => {
    const payload = new Uint8Array([1, 2, 3, 250])
    const f = encodeBinary(Channel.File, { fid: 'abc', seq: 7 }, payload)
    const d = decodeBinary(f)
    expect(d.channel).toBe(Channel.File)
    expect(d.header).toEqual({ fid: 'abc', seq: 7 })
    expect([...d.payload]).toEqual([1, 2, 3, 250])
  })
  it('round-trips the pairing URI', () => {
    const p = { v: 1, name: 'My PC', hosts: ['192.168.1.4', '10.0.0.2'], port: 47820, fp: 'ab'.repeat(32), token: 'tok_-x', id: 'id1' }
    expect(parsePairUri(pairUri(p))).toEqual(p)
  })
  it('rejects other URIs', () => {
    expect(parsePairUri('https://example.com')).toBeNull()
  })
})
