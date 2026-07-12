import { describe, expect, it } from 'vitest'

import {
  incidentFactPublicKey,
  signIncidentFact,
  verifyIncidentFact,
} from '@/modules/routing-kernel/internal/incident-fact-signing'

const privateKey = '1f'.repeat(32)

describe('incident Kernel Fact signing', () => {
  it('signs a fact digest with a rotation-addressable Ed25519 key and verifies it against trusted key material', () => {
    const publicKey = incidentFactPublicKey(privateKey)
    const signed = signIncidentFact('sha256:abc', { keyId: 'incident-facts:2026-07', privateKey })

    expect(signed).toEqual({
      signingKeyId: 'incident-facts:2026-07',
      signingPublicKey: publicKey,
      factSignature: expect.stringMatching(/^ed25519:[0-9a-f]{128}$/),
    })
    expect(verifyIncidentFact('sha256:abc', signed, [{ keyId: 'incident-facts:2026-07', publicKey }])).toBe(true)
    expect(verifyIncidentFact('sha256:changed', signed, [{ keyId: 'incident-facts:2026-07', publicKey }])).toBe(false)
  })

  it('rejects a valid signature when its key is not in the trusted lifecycle set', () => {
    const signed = signIncidentFact('sha256:abc', { keyId: 'incident-facts:retired', privateKey })
    expect(verifyIncidentFact('sha256:abc', signed, [])).toBe(false)
  })

  it('parses one active private key and rotation verification keys without accepting malformed material', async () => {
    const { resolveIncidentFactKeyring } = await import('@/modules/routing-kernel/internal/incident-fact-signing')
    const publicKey = incidentFactPublicKey(privateKey)
    expect(resolveIncidentFactKeyring({
      ROUTING_KERNEL_FACT_SIGNING_KEY: `incident-facts:active:${privateKey}`,
      ROUTING_KERNEL_FACT_PREVIOUS_PUBLIC_KEYS: `incident-facts:previous:${publicKey}`,
    })).toMatchObject({
      active: { keyId: 'incident-facts:active', privateKey },
      trusted: [{ keyId: 'incident-facts:active' }, { keyId: 'incident-facts:previous' }],
    })
    expect(() => resolveIncidentFactKeyring({ ROUTING_KERNEL_FACT_SIGNING_KEY: 'malformed' })).toThrow('incident_fact_signing_key_invalid')
  })
})
