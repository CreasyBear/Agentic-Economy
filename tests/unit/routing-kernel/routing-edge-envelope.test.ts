import { describe, expect, it } from 'vitest'

import { createRoutingEdgeEnvelope, verifyRoutingEdgeEnvelope } from '@/modules/routing-kernel/routing-edge-envelope'

const key = 'test-edge-origin-key-with-enough-entropy'
const observedAt = 1_783_818_000_000

describe('routing edge origin envelope', () => {
  it('reconstructs the caller-signed public URL only for a fresh valid edge envelope', async () => {
    const headers = new Headers({ 'Content-Digest': 'sha-256=:digest:' })
    const envelope = await createRoutingEdgeEnvelope({
      key, method: 'POST', path: '/v1/route', authority: 'route.agentic-economy.test',
      contentDigest: 'sha-256=:digest:', requestId: 'edge-request-1', timestamp: observedAt,
    })
    headers.set('X-AE-Edge-Authority', envelope.authority)
    headers.set('X-AE-Edge-Request-Id', envelope.requestId)
    headers.set('X-AE-Edge-Timestamp', String(envelope.timestamp))
    headers.set('X-AE-Edge-Signature', envelope.signature)

    await expect(verifyRoutingEdgeEnvelope(new Request('https://kernel.example/v1/route', { method: 'POST', headers }), {
      key, now: observedAt + 1_000, requiredAuthority: 'route.agentic-economy.test',
    })).resolves.toEqual({ kind: 'verified', publicUrl: 'https://route.agentic-economy.test/v1/route', requestId: 'edge-request-1' })
  })

  it('refuses missing, stale, wrong-authority, and tampered envelopes', async () => {
    const request = new Request('https://kernel.example/v1/route', { method: 'POST', headers: {
      'Content-Digest': 'sha-256=:digest:',
      'X-AE-Edge-Authority': 'route.agentic-economy.test',
      'X-AE-Edge-Request-Id': 'edge-request-1',
      'X-AE-Edge-Timestamp': String(observedAt),
      'X-AE-Edge-Signature': 'tampered',
    } })

    await expect(verifyRoutingEdgeEnvelope(new Request('https://kernel.example/v1/route', { method: 'POST' }), { key, now: observedAt })).resolves.toEqual({ kind: 'refused', reason: 'edge_envelope_missing' })
    await expect(verifyRoutingEdgeEnvelope(request, { key, now: observedAt + 31_000 })).resolves.toEqual({ kind: 'refused', reason: 'edge_envelope_stale' })
    await expect(verifyRoutingEdgeEnvelope(request, { key, now: observedAt, requiredAuthority: 'other.example' })).resolves.toEqual({ kind: 'refused', reason: 'edge_authority_mismatch' })
    await expect(verifyRoutingEdgeEnvelope(request, { key, now: observedAt })).resolves.toEqual({ kind: 'refused', reason: 'edge_signature_invalid' })
  })
})
