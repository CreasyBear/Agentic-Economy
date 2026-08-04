import { describe, expect, it, vi } from 'vitest'

import { runCapabilityReadinessProbe } from '@/modules/capability-supply/internal/readiness-probe'

const target = {
  publicationRef: 'offering:test:lookup', revision: 1,
  bindingId: 'binding:test:http', capabilityId: 'test.lookup',
  endpointUrl: 'https://provider.example.test/capability',
  credentialRef: 'env:TEST_CAPABILITY_KEY', adapterId: 'http-json:v1',
}

describe('capability readiness probe', () => {
  it('records ready and healthy only after a credentialed public endpoint responds successfully', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('Authorization')).toBe('Bearer test-secret')
      expect(request.redirect).toBe('manual')
      await expect(request.json()).resolves.toMatchObject({
        protocolVersion: 'ae-capability:v1', operation: 'quote', bindingId: target.bindingId,
      })
      return Response.json({
        kind: 'quoted',
        expectedCost: { currency: 'AUD', amountMinor: 1_200 },
        maximumCost: { currency: 'AUD', amountMinor: 1_200 },
        expectedLatencyMs: 120, dataFields: [], disclosures: [],
      })
    })
    const result = await runCapabilityReadinessProbe(target, {
      resolveCredential: async () => 'test-secret',
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toEqual({
      outcome: 'healthy',
      credentialState: 'ready', healthState: 'healthy', validUntil: 310_000,
      evidenceRefs: ['probe:credential_resolved', 'probe:target_public', 'probe:http_2xx'],
    })
    expect(send).toHaveBeenCalledOnce()
  })

  it('probes a public HTTP endpoint without resolving or sending a credential', async () => {
    const resolveCredential = vi.fn(async () => 'must-not-be-used')
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.has('Authorization')).toBe(false)
      return Response.json({
        kind: 'quoted',
        expectedCost: { currency: 'AUD', amountMinor: 1_200 },
        maximumCost: { currency: 'AUD', amountMinor: 1_200 },
        expectedLatencyMs: 120, dataFields: [], disclosures: [],
      })
    })
    const result = await runCapabilityReadinessProbe({ ...target, credentialRef: 'none' }, {
      resolveCredential, validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result).toEqual({
      outcome: 'healthy',
      credentialState: 'ready', healthState: 'healthy', validUntil: 310_000,
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:http_2xx'],
    })
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledOnce()
  })

  it('fails closed without resolving or transmitting a credential', async () => {
    const send = vi.fn()
    await expect(runCapabilityReadinessProbe(target, {
      resolveCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })).resolves.toEqual({
      outcome: 'credential_unavailable',
      credentialState: 'unavailable', healthState: 'unhealthy', validUntil: 70_000,
      evidenceRefs: ['probe:credential_unavailable'],
    })
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    { response: new Response(null, { status: 401 }), credentialState: 'unavailable', outcome: 'credential_rejected', evidence: 'probe:credential_rejected' },
    { response: new Response(null, { status: 503 }), credentialState: 'ready', outcome: 'http_5xx', evidence: 'probe:http_5xx' },
  ] as const)('fails closed for an unhealthy response', async ({ response, credentialState, outcome, evidence }) => {
    await expect(runCapabilityReadinessProbe(target, {
      resolveCredential: async () => 'test-secret', validateTarget: async () => true,
      send: async () => response, now: () => 10_000,
    })).resolves.toEqual({
      outcome,
      credentialState, healthState: 'unhealthy', validUntil: 70_000,
      evidenceRefs: ['probe:credential_resolved', 'probe:target_public', evidence],
    })
  })

  it('never sends when DNS validation rejects the target', async () => {
    const send = vi.fn()
    await expect(runCapabilityReadinessProbe(target, {
      resolveCredential: async () => 'test-secret', validateTarget: async () => false,
      send, now: () => 10_000,
    })).resolves.toEqual({
      outcome: 'target_not_public',
      credentialState: 'ready', healthState: 'unhealthy', validUntil: 70_000,
      evidenceRefs: ['probe:credential_resolved', 'probe:target_not_public'],
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('fails closed for a malformed endpoint before network access', async () => {
    const send = vi.fn()
    const result = await runCapabilityReadinessProbe({ ...target, endpointUrl: 'not a url' }, {
      resolveCredential: async () => 'test-secret', validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result.outcome).toBe('target_not_public')
    expect(send).not.toHaveBeenCalled()
  })

  it('requires a valid MCP tools/list response', async () => {
    const result = await runCapabilityReadinessProbe({ ...target, adapterId: 'mcp-jsonrpc:v1', probeKind: 'mcp' }, {
      resolveCredential: async () => 'test-secret', validateTarget: async () => true,
      send: async () => Response.json({}), now: () => 10_000,
    })
    expect(result.outcome).toBe('response_invalid')
  })

  it('accepts extension metadata at MCP response extension points', async () => {
    const result = await runCapabilityReadinessProbe({ ...target, adapterId: 'mcp-jsonrpc:v1', probeKind: 'mcp' }, {
      resolveCredential: async () => 'test-secret', validateTarget: async () => true,
      send: async () => Response.json({
        jsonrpc: '2.0', id: 'ae-readiness-probe', extension: 'outer',
        result: { extension: 'result', tools: [{ name: 'reference.lookup', extension: 'tool' }] },
      }),
      now: () => 10_000,
    })
    expect(result.outcome).toBe('healthy')
  })

  it('uses the declared read-only GET with fixed query parameters for imported HTTP descriptions', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('GET')
      expect(request.url).toBe('https://provider.example.test/capability?providers=ECB')
      return new Response(null, { status: 204 })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      probeKind: 'openapi_http',
      probeQuery: [{ parameter: 'providers', value: 'ECB' }],
      probeMethod: 'GET',
    }, {
      resolveCredential: async () => 'test-secret', validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result.outcome).toBe('healthy')
  })

  it('uses an unpaid POST to verify an x402 payment challenge', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('POST')
      await expect(request.json()).resolves.toEqual({})
      expect(request.headers.has('Payment-Signature')).toBe(false)
      return new Response(null, { status: 402 })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      adapterId: 'x402-fetch:v2',
      probeKind: 'x402',
    }, {
      resolveCredential: async () => 'funded-private-key',
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result).toEqual({
      outcome: 'healthy',
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: 310_000,
      evidenceRefs: ['probe:credential_resolved', 'probe:target_public', 'probe:x402_payment_required'],
    })
  })
})
