import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  encodeGovernedAction,
  encodeGovernedActionJson,
  verifyGovernedActionBytes,
  type GovernedActionPayload,
} from '@/modules/governed-action/public'
import vectors from '@/modules/governed-action/vectors.json'

type ValidVector = (typeof vectors.valid)[number]
type RefusalVector = (typeof vectors.refused)[number]

const textEncoder = new TextEncoder()

describe('governed action canonical wire format', () => {
  it.each(vectors.valid)('matches valid vector $id with both implementations', (vector: ValidVector) => {
    const encoded = encodeGovernedAction({
      commitmentKind: 'generic',
      schemaVersion: vector.schemaVersion,
      actionClass: vector.actionClass,
      payload: vector.payload as GovernedActionPayload,
    })

    expect(encoded.kind).toBe('encoded')
    if (encoded.kind !== 'encoded') return
    expect(new TextDecoder().decode(encoded.canonicalBytes)).toBe(vector.canonical)
    expect(encoded.digest).toBe(vector.digest)
    expect(verifyGovernedActionBytes(encoded.canonicalBytes, vector.digest)).toBe(true)

    const independentJson = independentCanonicalize({
      wireFormat: 'ae-governed-action:v1',
      schemaVersion: vector.schemaVersion,
      actionClass: vector.actionClass,
      payload: vector.payload,
    })
    const independentBytes = textEncoder.encode(independentJson)
    const independentDigest = `sha256:${createHash('sha256').update(independentBytes).digest('hex')}`
    expect(independentJson).toBe(vector.canonical)
    expect(independentBytes).toEqual(encoded.canonicalBytes)
    expect(independentDigest).toBe(vector.digest)
  })

  it.each(vectors.refused)('returns typed refusal for $id', (vector: RefusalVector) => {
    let constructedPayload: unknown = null
    if ('constructedCase' in vector && vector.constructedCase === 'symbol-key') {
      constructedPayload = { value: 'valid', [Symbol('key')]: 'invalid' }
    } else if ('constructedCase' in vector && vector.constructedCase === 'non-enumerable') {
      constructedPayload = Object.defineProperty({}, 'hidden', { value: true, enumerable: false })
    } else if ('constructedCase' in vector && vector.constructedCase === 'deep-array') {
      constructedPayload = null
      for (let depth = 0; depth < 101; depth += 1) constructedPayload = [constructedPayload]
    }
    const result = 'inputJson' in vector
      ? encodeGovernedActionJson({ schemaVersion: 1, actionClass: 'test', payloadJson: vector.inputJson })
      : encodeGovernedAction({
          commitmentKind: 'generic',
          schemaVersion: 1,
          actionClass: 'test',
          payload: constructedPayload as GovernedActionPayload,
        })

    expect(result).toMatchObject({ kind: 'refused', code: vector.code })
  })

  it('binds key order identically and revisions differently', () => {
    const byId = Object.fromEntries(vectors.valid.map((vector) => [vector.id, vector.digest]))
    expect(byId['key-order-a']).toBe(byId['key-order-b'])
    expect(byId['revision-one']).not.toBe(byId['revision-two'])
  })

  it('verifies exact bytes and refuses malformed or altered digests', () => {
    const vector = vectors.valid[0]
    expect(vector).toBeDefined()
    if (vector === undefined) return
    const bytes = textEncoder.encode(vector.canonical)
    const altered = textEncoder.encode(`${vector.canonical} `)
    expect(verifyGovernedActionBytes(bytes, vector.digest)).toBe(true)
    expect(verifyGovernedActionBytes(altered, vector.digest)).toBe(false)
    expect(verifyGovernedActionBytes(bytes, vector.digest.toUpperCase())).toBe(false)
    expect(verifyGovernedActionBytes(bytes, 'sha256:not-a-digest')).toBe(false)
  })
})

function independentCanonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(independentCanonicalize).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => (
    `${JSON.stringify(key)}:${independentCanonicalize(object[key])}`
  )).join(',')}}`
}
