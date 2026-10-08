import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ReactStart from '@tanstack/react-start'

const requestState = vi.hoisted(() => ({ request: new Request('https://example.com/market') }))
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => requestState.request }))

const sources = vi.hoisted(() => ({ tool: vi.fn(), evidence: vi.fn(), rate: vi.fn(), service: vi.fn(), page: vi.fn(), offering: vi.fn(), canonical: vi.fn() }))

vi.mock('@tanstack/react-start', async importOriginal => ({
  ...(await importOriginal<typeof ReactStart>()),
  createServerFn: () => ({
    validator: () => ({ handler: (fn: (input: { data: never }) => Promise<unknown>) => (input: { data: never }) => fn(input) }),
  }),
}))
vi.mock('@/modules/capability-supply/tool-source', () => ({ readCapabilityToolDetail: sources.tool }))
vi.mock('@/modules/market/server', () => ({ readToolListingEvidence: sources.evidence }))
vi.mock('@/modules/money/reference-rate.server', () => ({ readPersistedReferenceRate: sources.rate }))
vi.mock('@/modules/registry/registry.actions', () => ({ registryServicesDetailAction: { run: sources.service } }))
vi.mock('@/lib/server/owner-status.functions', () => ({ readPublicBusinessPageServer: sources.page }))
vi.mock('@/modules/registry/registry.functions', () => ({ readPublicOfferingRegistryBusinessDetail: sources.offering }))
vi.mock('@/lib/server/canonical-url.functions', () => ({ readCanonicalBaseUrlServer: sources.canonical }))

import { readPublicToolDetailRouteServer } from '@/modules/market/tool-detail-route.functions'
import { readPublicBusinessRouteServer } from '@/lib/server/public-business-route.functions'
import { buildPublicBusinessPageHead } from '@/modules/seo/public-route'

const descriptor = {
  kind: 'found' as const,
  tool: {
    toolRef: 'operation:v1:public',
    business: { slug: 'provider', businessId: 'business-1' },
    commercial: { price: { kind: 'fixed', amount: { currency: 'USDC', value: '1' } } },
  },
}

afterEach(() => { for (const mock of Object.values(sources)) mock.mockReset(); requestState.request = new Request('https://example.com/market') })

describe('public detail containment', () => {
  it('cancels a pending descriptor and prevents late evidence, link, and rate reads', async () => {
    const controller = new AbortController()
    requestState.request = new Request('https://example.com/market', { signal: controller.signal })
    const detail = Promise.withResolvers<typeof descriptor>()
    sources.tool.mockReturnValue(detail.promise)
    const pending = readPublicToolDetailRouteServer({ data: { toolRef: descriptor.tool.toolRef } })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const options = sources.tool.mock.calls[0]?.[1] as { signal: AbortSignal }
    controller.abort(new DOMException('Comparison cancelled', 'AbortError'))
    await rejected
    expect(options.signal.aborted).toBe(true)
    detail.resolve(descriptor)
    await detail.promise
    await Promise.resolve()
    expect(sources.evidence).not.toHaveBeenCalled()
    expect(sources.service).not.toHaveBeenCalled()
    expect(sources.rate).not.toHaveBeenCalled()
  })

  it('passes the same cancellation into optional comparison source owners', async () => {
    const controller = new AbortController()
    requestState.request = new Request('https://example.com/market', { signal: controller.signal })
    sources.tool.mockResolvedValue(descriptor)
    sources.evidence.mockResolvedValue(undefined)
    sources.service.mockResolvedValue(undefined)
    sources.rate.mockResolvedValue(undefined)
    expect(await readPublicToolDetailRouteServer({ data: { toolRef: descriptor.tool.toolRef } })).toEqual(descriptor)
    const options = sources.tool.mock.calls[0]?.[1] as { signal: AbortSignal }
    expect(sources.evidence).toHaveBeenCalledWith(descriptor.tool, '30d', options)
    expect(sources.rate).toHaveBeenCalledWith(options)
    const serviceContext = sources.service.mock.calls[0]?.[0].context as { request: Request }
    controller.abort()
    expect(options.signal.aborted).toBe(true)
    expect(serviceContext.request.signal.aborted).toBe(true)
  })

  it('retains the exact Tool descriptor when evidence, public link, and display FX fail', async () => {
    sources.tool.mockResolvedValue(descriptor)
    sources.evidence.mockRejectedValue(new Error('evidence query failed'))
    sources.service.mockRejectedValue(new Error('business enrichment failed'))
    sources.rate.mockRejectedValue(new Error('FX observation unavailable'))

    const result = await readPublicToolDetailRouteServer({ data: { toolRef: descriptor.tool.toolRef } })
    expect(result).toEqual(descriptor)
    expect(sources.tool).toHaveBeenCalledTimes(1)
  })

  it('keeps canonical provider identity when supply, SEO origin and service enrichment fail', async () => {
    const page = { kind: 'available' as const, catalog: { slug: 'provider', name: 'Provider' } }
    sources.page.mockResolvedValue(page)
    sources.offering.mockRejectedValue(new Error('supply read failed'))
    sources.canonical.mockRejectedValue(new Error('canonical origin missing'))
    sources.service.mockRejectedValue(new Error('service detail failed'))

    const result = await readPublicBusinessRouteServer({ data: { slug: 'provider' } })
    expect(result).toEqual({ kind: 'available', page })
    if (result.kind !== 'available') throw new Error('provider_identity_missing')
    const head = buildPublicBusinessPageHead(result)
    expect(head.meta).toContainEqual({ title: 'Provider Tools | Agentic Economy' })
    expect(head.links).toBeUndefined()
  })

  it('does not turn an absent provider identity into an available page', async () => {
    sources.page.mockResolvedValue({ kind: 'not_found', reason: 'not_public' })
    expect(await readPublicBusinessRouteServer({ data: { slug: 'missing' } })).toEqual({ kind: 'not_found', reason: 'not_public' })
    expect(sources.offering).not.toHaveBeenCalled()
  })
})
