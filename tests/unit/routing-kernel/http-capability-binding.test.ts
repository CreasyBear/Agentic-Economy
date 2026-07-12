import { describe, expect, it, vi } from 'vitest'

import { createHttpCapabilityBinding } from '@/modules/routing-kernel/http-capability-binding'

const registration = {
  binding: {
    bindingId: 'binding:acme-shipping:v1', nodeId: 'business:acme-shipping', networkId: 'network:au-first',
    capabilityContractId: 'capability:parcel-label-purchase:v1', operation: 'purchase_label',
    admission: 'admitted' as const, conformance: 'conformant' as const, queryTerms: ['parcel', 'label'],
    adapterFeatures: { requestCancellation: 'supported' as const },
  },
  endpointUrl: 'https://agent.acme.example/ae/capability', credentialRef: 'credential:acme:v1',
}

describe('BYO HTTP capability binding', () => {
  it('quotes and executes through the registered endpoint without exposing its credential', async () => {
    const requests: Request[] = []
    const binding = createHttpCapabilityBinding(registration, {
      validateTarget: async () => true,
      resolveCredential: async () => 'secret-token',
      send: async (request) => {
        requests.push(request)
        const body = await request.clone().json() as { operation: string }
        return Response.json(body.operation === 'quote'
          ? { kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 1_100 }, maximumCost: { currency: 'AUD', amountMinor: 1_200 }, expectedLatencyMs: 800, dataFields: ['recipient_address'], disclosures: ['Recipient address is released to Acme Shipping.'] }
          : { kind: 'effect_committed', providerReference: 'label:acme-1', reportedCost: { currency: 'AUD', amountMinor: 1_175 }, outcome: { labelUrl: 'https://agent.acme.example/labels/1' } })
      },
    })
    expect(await binding.quote({ query: 'parcel label' })).toMatchObject({ kind: 'quoted', maximumCost: { amountMinor: 1_200 }, dataFields: ['recipient_address'] })
    expect(await binding.execute({ rootRunId: 'root:1', leafRunId: 'leaf:1', stepGrantId: 'grant:1', idempotencyKey: 'idem:1', data: { recipient_address: '1 Main St' } })).toMatchObject({ kind: 'effect_committed', providerReference: 'label:acme-1', reportedCost: { currency: 'AUD', amountMinor: 1_175 } })
    expect(requests).toHaveLength(2)
    expect(requests[1]?.headers.get('Authorization')).toBe('Bearer secret-token')
    expect(requests[1]?.headers.get('Idempotency-Key')).toBe('idem:1')
    expect(JSON.stringify(registration)).not.toContain('secret-token')
  })

  it('maps ambiguous transport failure to outcome_unknown and never invents failure certainty', async () => {
    const binding = createHttpCapabilityBinding(registration, { validateTarget: async () => true, resolveCredential: async () => 'secret', send: async () => { throw new Error('connection reset') } })
    expect(await binding.execute({ rootRunId: 'root:1', leafRunId: 'leaf:1', stepGrantId: 'grant:1', idempotencyKey: 'idem:1', data: {} })).toEqual({ kind: 'outcome_unknown' })
  })

  it('reports provider wait independently for returned and indeterminate transport calls', async () => {
    let now = 1_000
    const measurements: unknown[] = []
    const binding = createHttpCapabilityBinding(registration, {
      validateTarget: async () => true,
      resolveCredential: async () => 'secret',
      now: () => now,
      observeProviderWait: async (measurement) => { measurements.push(measurement) },
      send: async (request) => {
        now += 75
        const body = await request.clone().json() as { operation: string }
        if (body.operation === 'execute') throw new Error('indeterminate')
        return Response.json({ kind: 'refused', reason: 'no_quote' })
      },
    })
    await binding.quote({ query: 'parcel label' })
    await binding.execute({ rootRunId: 'root:timed', leafRunId: 'leaf:timed', stepGrantId: 'grant:timed', idempotencyKey: 'timed:1', data: {} })
    expect(measurements).toEqual([
      { bindingId: registration.binding.bindingId, operation: 'quote', providerWaitMs: 75, outcome: 'returned' },
      { bindingId: registration.binding.bindingId, operation: 'execute', providerWaitMs: 75, outcome: 'indeterminate' },
    ])
  })

  it('carries the exact expiring provider quote reference into execution and reconciliation', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const binding = createHttpCapabilityBinding(registration, {
      ...dependencies(),
      send: async (request) => {
        const body = await request.clone().json() as Record<string, unknown>
        bodies.push(body)
        if (body.operation === 'quote') return Response.json({
          kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 1_100 },
          maximumCost: { currency: 'AUD', amountMinor: 1_200 }, expectedLatencyMs: 800,
          dataFields: [], disclosures: [], providerQuoteRef: 'rate:shippo:exact-1',
          providerQuoteExpiresAt: 1_750_000_030_000,
        })
        return Response.json({ kind: 'reconciliation_pending' })
      },
    })
    const quoted = await binding.quote({ query: 'parcel label' })
    expect(quoted).toMatchObject({ providerQuoteRef: 'rate:shippo:exact-1', providerQuoteExpiresAt: 1_750_000_030_000 })
    await binding.execute({
      rootRunId: 'root:quote-ref', leafRunId: 'leaf:quote-ref', stepGrantId: 'grant:quote-ref',
      idempotencyKey: 'idem:quote-ref', providerQuoteRef: 'rate:shippo:exact-1', data: {},
    })
    await binding.reconcile({
      rootRunId: 'root:quote-ref', leafRunId: 'leaf:quote-ref', stepGrantId: 'grant:quote-ref',
      idempotencyKey: 'idem:quote-ref', providerQuoteRef: 'rate:shippo:exact-1',
    })
    expect(bodies.slice(1)).toEqual([
      expect.objectContaining({ operation: 'execute', providerQuoteRef: 'rate:shippo:exact-1' }),
      expect.objectContaining({ operation: 'reconcile', providerQuoteRef: 'rate:shippo:exact-1' }),
    ])
  })

  it('projects cancellation through the original released identities and idempotency key', async () => {
    let request: Request | undefined
    const binding = createHttpCapabilityBinding(registration, {
      ...dependencies(),
      send: async (candidate) => { request = candidate; return Response.json({ kind: 'cancellation_accepted', providerReference: 'cancel:1' }) },
    })
    await expect(binding.requestCancellation?.({ rootRunId: 'root:1', leafRunId: 'leaf:1', stepGrantId: 'grant:1', idempotencyKey: 'cancel:idem:1' })).resolves.toEqual({ kind: 'cancellation_accepted', providerReference: 'cancel:1' })
    expect(request?.headers.get('Idempotency-Key')).toBe('cancel:idem:1')
    await expect(request?.clone().json()).resolves.toMatchObject({ operation: 'cancel', rootRunId: 'root:1', leafRunId: 'leaf:1', stepGrantId: 'grant:1' })
  })

  it('refuses non-HTTPS, unapproved targets, redirects, oversized bodies, and invalid provider claims', async () => {
    expect(() => createHttpCapabilityBinding({ ...registration, endpointUrl: 'http://agent.acme.example/ae' }, dependencies())).toThrow('https_required')
    const blocked = createHttpCapabilityBinding(registration, { ...dependencies(), validateTarget: async () => false })
    expect(await blocked.quote({ query: 'parcel label' })).toEqual({ kind: 'refused', reason: 'endpoint_not_public' })
    const redirected = createHttpCapabilityBinding(registration, { ...dependencies(), send: async () => new Response(null, { status: 302 }) })
    expect(await redirected.execute({ rootRunId: 'r', leafRunId: 'l', stepGrantId: 'g', idempotencyKey: 'i', data: {} })).toEqual({ kind: 'outcome_unknown' })
    const invalid = createHttpCapabilityBinding(registration, { ...dependencies(), send: async () => Response.json({ kind: 'effect_committed' }) })
    expect(await invalid.execute({ rootRunId: 'r', leafRunId: 'l', stepGrantId: 'g', idempotencyKey: 'i', data: {} })).toEqual({ kind: 'outcome_unknown' })
  })
})

function dependencies() {
  return { validateTarget: vi.fn(async () => true), resolveCredential: vi.fn(async () => 'secret'), send: vi.fn(async () => Response.json({ kind: 'refused', reason: 'no_quote' })) }
}
