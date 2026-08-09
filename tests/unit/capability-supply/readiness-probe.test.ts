import { describe, expect, it, vi } from 'vitest'

import { runCapabilityReadinessProbe } from '@/modules/capability-supply/internal/readiness-probe'

const providerAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:test-capability',
  providerRef: 'provider:test-capability',
} as const
const keylessAuthority = { kind: 'keyless' } as const

const target = {
  publicationRef: 'offering:test:lookup', revision: 1,
  bindingId: 'binding:test:http', capabilityId: 'test.lookup',
  endpointUrl: 'https://provider.example.test/capability',
  authority: providerAuthority, adapterId: 'http-json:v1',
}

describe('capability readiness probe', () => {
  it('records ready and healthy only after a credentialed public endpoint responds successfully', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('authorization')).toBe(null)
      expect(request.redirect).toBe('manual')
      await expect(request.json()).resolves.toMatchObject({
        protocolVersion: 'ae-capability:v1', operation: 'quote', bindingId: target.bindingId,
      })
      return Response.json({
        kind: 'quoted',
        expectedCost: { currency: 'AUD', units: '1200', exponent: 2 },
        maximumCost: { currency: 'AUD', units: '1200', exponent: 2 },
        expectedLatencyMs: 120, dataFields: [], disclosures: [],
      })
    })
    const result = await runCapabilityReadinessProbe(target, {
      resolveProviderConnectionCredential: async () => 'test-secret',
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
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.has('Authorization')).toBe(false)
      return Response.json({
        kind: 'quoted',
        expectedCost: { currency: 'AUD', units: '1200', exponent: 2 },
        maximumCost: { currency: 'AUD', units: '1200', exponent: 2 },
        expectedLatencyMs: 120, dataFields: [], disclosures: [],
      })
    })
    const resolveProviderConnectionCredential = vi.fn(async () => 'must-not-be-used')
    const result = await runCapabilityReadinessProbe({ ...target, authority: keylessAuthority }, {
      resolveProviderConnectionCredential, validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result).toEqual({
      outcome: 'healthy',
      credentialState: 'ready', healthState: 'healthy', validUntil: 310_000,
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:http_2xx'],
    })
    expect(resolveProviderConnectionCredential).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledOnce()
  })

  it('fails closed without resolving or transmitting a credential', async () => {
    const send = vi.fn()
    await expect(runCapabilityReadinessProbe(target, {
      resolveProviderConnectionCredential: async () => undefined,
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
      resolveProviderConnectionCredential: async () => 'test-secret', validateTarget: async () => true,
      send: async () => response, now: () => 10_000,
    })).resolves.toEqual({
      outcome,
      credentialState, healthState: 'unhealthy', validUntil: 70_000,
      evidenceRefs: ['probe:credential_resolved', 'probe:target_public', evidence],
    })
  })

  it('never sends when DNS validation rejects the target', async () => {
    const resolveProviderConnectionCredential = vi.fn(async () => 'must-not-be-used')
    const validateTarget = vi.fn(async () => false)
    const send = vi.fn()
    await expect(runCapabilityReadinessProbe(target, {
      resolveProviderConnectionCredential, validateTarget,
      send, now: () => 10_000,
    })).resolves.toEqual({
      outcome: 'target_not_public',
      credentialState: 'ready', healthState: 'unhealthy', validUntil: 70_000,
      evidenceRefs: ['probe:target_not_public'],
    })
    expect(validateTarget).toHaveBeenCalledOnce()
    expect(resolveProviderConnectionCredential).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses missing or mismatched credential placement before DNS or send', async () => {
    const missingValidateTarget = vi.fn(async () => true)
    const missingSend = vi.fn()
    const missingResolve = vi.fn(async () => 'must-not-be-used')
    const missing = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      probeKind: 'openapi_http',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'probe', value: '1' }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'bearer' },
      }),
    }, {
      resolveProviderConnectionCredential: missingResolve,
      validateTarget: missingValidateTarget,
      send: missingSend,
      now: () => 10_000,
    })
    expect(missing).toMatchObject({
      outcome: 'credential_unavailable',
      credentialState: 'unavailable',
      healthState: 'unhealthy',
    })
    expect(missingResolve).not.toHaveBeenCalled()
    expect(missingValidateTarget).not.toHaveBeenCalled()
    expect(missingSend).not.toHaveBeenCalled()

    const mismatchedValidateTarget = vi.fn(async () => true)
    const mismatchedSend = vi.fn()
    const mismatchedResolve = vi.fn(async () => 'provider-secret')
    const mismatched = await runCapabilityReadinessProbe({
      ...target,
      probeKind: 'openapi_http',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'probe', value: '1' }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
    }, {
      resolveProviderConnectionCredential: mismatchedResolve,
      validateTarget: mismatchedValidateTarget,
      send: mismatchedSend,
      now: () => 10_000,
    })
    expect(mismatched).toMatchObject({
      outcome: 'credential_unavailable',
      credentialState: 'unavailable',
      healthState: 'unhealthy',
    })
    expect(mismatchedResolve).not.toHaveBeenCalled()
    expect(mismatchedValidateTarget).not.toHaveBeenCalled()
    expect(mismatchedSend).not.toHaveBeenCalled()
  })

  it('refuses an opaque environment locator after DNS and before send', async () => {
    const locator = 'env:TEST_CAPABILITY_KEY'
    const events: string[] = []
    const resolveProviderConnectionCredential = vi.fn(async () => {
      events.push('resolve')
      return locator
    })
    const validateTarget = vi.fn(async () => {
      events.push('dns')
      return true
    })
    const send = vi.fn(async () => {
      events.push('send')
      return Response.json({})
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      probeKind: 'openapi_http',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'probe', value: '1' }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'bearer' },
      }),
    }, {
      resolveProviderConnectionCredential,
      validateTarget,
      send,
      now: () => 10_000,
    })

    expect(result).toMatchObject({
      outcome: 'credential_unavailable',
      credentialState: 'unavailable',
      healthState: 'unhealthy',
    })
    expect(JSON.stringify(result)).not.toContain(locator)
    expect(resolveProviderConnectionCredential).toHaveBeenCalledOnce()
    expect(validateTarget).toHaveBeenCalledOnce()
    expect(events).toEqual(['dns', 'resolve'])
    expect(send).not.toHaveBeenCalled()
  })

  it('fails closed for a malformed endpoint before network access', async () => {
    const send = vi.fn()
    const result = await runCapabilityReadinessProbe({ ...target, endpointUrl: 'not a url' }, {
      resolveProviderConnectionCredential: async () => 'test-secret', validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result.outcome).toBe('target_not_public')
    expect(send).not.toHaveBeenCalled()
  })

  it('requires a valid MCP tools/list response', async () => {
    const result = await runCapabilityReadinessProbe({ ...target, adapterId: 'mcp-jsonrpc:v1', probeKind: 'mcp' }, {
      resolveProviderConnectionCredential: async () => 'test-secret', validateTarget: async () => true,
      send: async () => Response.json({}), now: () => 10_000,
    })
    expect(result.outcome).toBe('response_invalid')
  })

  it('accepts extension metadata at MCP response extension points', async () => {
    const result = await runCapabilityReadinessProbe({ ...target, adapterId: 'mcp-jsonrpc:v1', probeKind: 'mcp' }, {
      resolveProviderConnectionCredential: async () => 'test-secret', validateTarget: async () => true,
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
      expect(request.headers.get('Authorization')).toBe('Bearer test-secret')
      return Response.json({ rates: { USD: 1.08 } })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      probeKind: 'openapi_http',
      probeQuery: [{ parameter: 'providers', value: 'ECB' }],
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'providers', value: 'ECB' }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'bearer' },
      }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { rates: { type: 'object' } },
        required: ['rates'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => 'test-secret', validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result.outcome).toBe('healthy')
  })

  it('omits absent optional query inputs while probing the same request shape as execution', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://provider.example.test/capability?ids=bitcoin')
      return Response.json({ ok: true })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'http-json:v1',
      probeKind: 'openapi_http',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        query: [
          { inputPointer: '/ids', parameter: 'ids' },
          { inputPointer: '/include_24hr_change', parameter: 'include_24hr_change' },
        ],
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ ids: 'bitcoin' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result.outcome).toBe('healthy')
    expect(send).toHaveBeenCalledOnce()
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
      resolveProviderConnectionCredential: async () => 'funded-private-key',
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
