import { describe, expect, it, vi } from 'vitest'

import { runCapabilityReadinessProbe } from '@/modules/capability-supply/internal/readiness-probe'

import { keylessAuthority, target } from './readiness-probe-harness'

describe('capability readiness probe', () => {
  it('records ready and healthy only after a credentialed public endpoint responds successfully', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('authorization')).toBe('Bearer test-secret')
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
    expect(result).toMatchObject({
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
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, credential: { kind: 'none' },
      }),
    }, {
      resolveProviderConnectionCredential, validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result).toMatchObject({
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
    })).resolves.toMatchObject({
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
    })).resolves.toMatchObject({
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
    })).resolves.toMatchObject({
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
})
