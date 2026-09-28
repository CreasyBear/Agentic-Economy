import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ReactStart from '@tanstack/react-start'

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

afterEach(() => { for (const mock of Object.values(sources)) mock.mockReset() })

describe('public detail containment', () => {
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
