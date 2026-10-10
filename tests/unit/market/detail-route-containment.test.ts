import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ReactStart from '@tanstack/react-start'

const requestState = vi.hoisted(() => ({ request: new Request('https://example.com/market') }))
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => requestState.request }))

const sources = vi.hoisted(() => ({ search: vi.fn(), tool: vi.fn(), evidence: vi.fn(), rate: vi.fn(), service: vi.fn(), page: vi.fn(), offering: vi.fn(), canonical: vi.fn() }))

vi.mock('@tanstack/react-start', async importOriginal => ({
  ...(await importOriginal<typeof ReactStart>()),
  createServerFn: () => ({
    validator: () => ({ handler: (fn: (input: { data: never }) => Promise<unknown>) => (input: { data: never }) => fn(input) }),
  }),
}))
vi.mock('@/modules/capability-supply/tool-source', () => ({ readCapabilityToolDetail: sources.tool }))
vi.mock('@/modules/market/server', () => ({ readToolListingEvidence: sources.evidence }))
vi.mock('@/modules/money/reference-rate.server', () => ({ readPersistedReferenceRate: sources.rate }))
vi.mock('@/modules/registry/tools.actions', () => ({ registryToolsSearchAction: { run: sources.search } }))
vi.mock('@/modules/registry/registry.actions', () => ({ registryServicesDetailAction: { run: sources.service } }))
vi.mock('@/lib/server/owner-status.functions', () => ({ readPublicBusinessPageServer: sources.page }))
vi.mock('@/modules/registry/registry.functions', () => ({ readPublicOfferingRegistryBusinessDetail: sources.offering }))
vi.mock('@/lib/server/canonical-url.functions', () => ({ readCanonicalBaseUrlServer: sources.canonical }))

import { readPublicToolDetailRouteServer } from '@/modules/market/tool-detail-route.functions'
import { searchMarketToolsServer } from '@/modules/market/market-tool-search.functions'
import { readPublicBusinessRouteServer } from '@/lib/server/public-business-route.functions'
import { buildPublicBusinessPageHead } from '@/modules/seo/public-route'
import { SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'

const descriptor = {
  kind: 'found' as const,
  tool: {
    toolRef: 'operation:v1:public',
    business: { slug: 'provider', businessId: 'business-1' },
    commercial: { price: { kind: 'fixed', amount: { currency: 'USDC', value: '1' } } },
  },
}

afterEach(() => { for (const mock of Object.values(sources)) mock.mockReset(); vi.restoreAllMocks(); requestState.request = new Request('https://example.com/market') })

/** Nitro/srvx hands server functions a NodeRequest: Request.prototype without undici state, so `new Request(it)` throws. */
function srvxLikeRequest(url: string, signal = new AbortController().signal): Request {
  const request = Object.create(Request.prototype) as Request
  const headers = new Headers({ accept: 'application/json' })
  Object.defineProperties(request, {
    url: { get: () => url },
    method: { get: () => 'GET' },
    headers: { get: () => headers },
    signal: { get: () => signal },
  })
  return request
}

describe('srvx runtime requests', () => {
  it('searches the Market when the runtime request is not an undici Request', async () => {
    requestState.request = srvxLikeRequest('https://example.com/_serverFn/search')
    sources.search.mockResolvedValue({ kind: 'results' })
    expect(await searchMarketToolsServer({ data: {} as never })).toEqual({ kind: 'results' })
    const context = sources.search.mock.calls[0]?.[0].context as { request: Request }
    expect(context.request.url).toBe('https://example.com/_serverFn/search')
    expect(context.request.headers.get('accept')).toBe('application/json')
  })

  it('reads the public business link when the runtime request is not an undici Request', async () => {
    requestState.request = srvxLikeRequest('https://example.com/market')
    sources.tool.mockResolvedValue(descriptor)
    sources.evidence.mockResolvedValue(undefined)
    sources.service.mockResolvedValue(undefined)
    sources.rate.mockResolvedValue(undefined)
    expect(await readPublicToolDetailRouteServer({ data: { toolRef: descriptor.tool.toolRef } })).toEqual(descriptor)
    expect(sources.service).toHaveBeenCalledTimes(1)
  })
})

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
    const options = sources.evidence.mock.calls[0]?.[2] as { signal: AbortSignal }
    expect(sources.evidence).toHaveBeenCalledWith(descriptor.tool, '30d', options)
    expect(sources.rate).toHaveBeenCalledWith(options)
    const serviceContext = sources.service.mock.calls[0]?.[0].context as { request: Request }
    controller.abort()
    expect(options.signal.aborted).toBe(true)
    expect(serviceContext.request.signal.aborted).toBe(true)
  })

  it.each(['optional', 'remaining page'] as const)('retains the loaded descriptor when the %s deadline expires during enrichment', async deadline => {
    const pageDeadline = new AbortController()
    const optionalDeadline = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      if (ms === SOURCE_READ_TIMEOUT_MS) return pageDeadline.signal
      if (ms === 3_000) return optionalDeadline.signal
      throw new Error(`unexpected_timeout:${ms}`)
    })
    const started = Promise.withResolvers<void>()
    sources.tool.mockResolvedValue(descriptor)
    sources.evidence.mockReturnValue(new Promise(() => {}))
    sources.service.mockReturnValue(new Promise(() => {}))
    sources.rate.mockImplementation(() => { started.resolve(); return new Promise(() => {}) })
    const pending = readPublicToolDetailRouteServer({ data: { toolRef: descriptor.tool.toolRef } })
    await started.promise
    const elapsedDeadline = deadline === 'optional' ? optionalDeadline : pageDeadline
    elapsedDeadline.abort(new DOMException('Read deadline', 'TimeoutError'))
    expect(await pending).toEqual(descriptor)
    expect(timeout).toHaveBeenCalledWith(SOURCE_READ_TIMEOUT_MS)
    expect(timeout).toHaveBeenCalledWith(3_000)
    const evidenceOptions = sources.evidence.mock.calls[0]?.[2] as { signal: AbortSignal }
    const serviceContext = sources.service.mock.calls[0]?.[0].context as { request: Request }
    const rateOptions = sources.rate.mock.calls[0]?.[0] as { signal: AbortSignal }
    expect(evidenceOptions.signal.aborted).toBe(true)
    expect(serviceContext.request.signal.aborted).toBe(true)
    expect(rateOptions.signal.aborted).toBe(true)
    expect(sources.tool).toHaveBeenCalledTimes(1)
  })

  it('keeps the essential descriptor deadline and never starts optional reads after it expires', async () => {
    const deadline = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    sources.tool.mockReturnValue(new Promise(() => {}))
    const pending = readPublicToolDetailRouteServer({ data: { toolRef: descriptor.tool.toolRef } })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    deadline.abort(new DOMException('Read deadline', 'TimeoutError'))
    await rejected
    expect(sources.evidence).not.toHaveBeenCalled()
    expect(sources.service).not.toHaveBeenCalled()
    expect(sources.rate).not.toHaveBeenCalled()
  })

  it('rejects visitor cancellation during enrichment rather than returning the loaded descriptor', async () => {
    const controller = new AbortController()
    requestState.request = new Request('https://example.com/market', { signal: controller.signal })
    const started = Promise.withResolvers<void>()
    sources.tool.mockResolvedValue(descriptor)
    sources.evidence.mockReturnValue(new Promise(() => {}))
    sources.service.mockReturnValue(new Promise(() => {}))
    sources.rate.mockImplementation(() => { started.resolve(); return new Promise(() => {}) })
    const pending = readPublicToolDetailRouteServer({ data: { toolRef: descriptor.tool.toolRef } })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    controller.abort()
    await rejected
    const options = sources.evidence.mock.calls[0]?.[2] as { signal: AbortSignal }
    expect(options.signal.aborted).toBe(true)
    expect(sources.tool).toHaveBeenCalledTimes(1)
  })

  it('rejects cancellation between primary settlement and a not-found return', async () => {
    const controller = new AbortController()
    requestState.request = new Request('https://example.com/market', { signal: controller.signal })
    const detail = Promise.withResolvers<{ kind: 'not_found' }>()
    sources.tool.mockReturnValue(detail.promise)
    const pending = readPublicToolDetailRouteServer({ data: { toolRef: descriptor.tool.toolRef } })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    detail.resolve({ kind: 'not_found' })
    queueMicrotask(() => controller.abort())
    await rejected
    expect(sources.evidence).not.toHaveBeenCalled()
    expect(sources.service).not.toHaveBeenCalled()
    expect(sources.rate).not.toHaveBeenCalled()
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
