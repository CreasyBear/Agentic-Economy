import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleMarketToolCompareRequest } from '@/routes/api.v1.market-tools.compare'
import { handleMarketToolDescribeRequest } from '@/routes/api.v1.market-tools.describe'
import { handleMarketToolListRequest } from '@/routes/api.v1.market-tools.list'
import { handleMarketToolSearchRequest } from '@/routes/api.v1.market-tools.search'
import {
  handleApiRegistryRequest,
  Route as RegistryRoute,
} from '@/routes/api.v1.registry'
import { encodeOpaqueCursor } from '@/modules/registry/opaque-cursor'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'
import { toolChoiceSearchOutputSchema } from '@/modules/registry/tool-choice-contracts'
import { handleMarketMetricsRequest } from '@/routes/api.v1.market-metrics'
import { handleApiRegistryDetailRequest } from '@/routes/api.v1.registry.detail'

const searchResult = {
  kind: 'no_candidates' as const,
  schemaVersion: 'registry-tools:v3' as const,
  query: 'reference lookup',
  appliedFilters: {},
  matchedCount: 0,
  ranking: [],
  navigation: [],
}

const detailResult = {
  kind: 'not_found' as const,
  schemaVersion: 'registry-tools:v3' as const,
  toolRef: 'operation:v1:' + 'f'.repeat(64),
  navigation: [],
}
const compareResult = {
  kind: 'unavailable' as const,
  schemaVersion: 'registry-tools:v3' as const,
  reason: 'tool_not_found' as const,
  navigation: [],
}

vi.mock('@/modules/capability-supply/tool-source', () => ({
  readCapabilityToolSearch: vi.fn(async () => searchResult),
  readCapabilityToolDetail: vi.fn(async () => detailResult),
  readCapabilityToolCompare: vi.fn(async () => compareResult),
}))

describe('public market Tool routes', () => {
  it.each(['?extra=1', '?window=24h&window=30d'])('rejects unsupported or repeated metrics parameters: %s', async query => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const result = await handleMarketMetricsRequest(new Request(`https://ae.test/api/v1/market-metrics${query}`))
    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('runs anonymous bounded search through the registry action and preserves correlation', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleMarketToolSearchRequest(new Request('https://ae.test/api/v1/market-tools/search', {
      method: 'POST',
      headers: { 'content-type': 'Application/JSON;charset=UTF-8', 'x-ae-request-id': 'route-test' },
      body: JSON.stringify({ query: 'reference lookup', source: 'current', limit: 1 }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-ae-request-id')).toBe('route-test')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'noMatch',
      schemaVersion: 'registry-tools:v3',
      query: 'reference lookup',
      assessed: { source: 'current', coverage: 'complete' },
      results: [],
      partialResults: false,
      pagination: { limit: 1, hasMore: false },
      next: [],
      freshness: { source: 'supply_projection', state: 'absent', staleAfterMs: 3 * 60 * 60 * 1000 },
    })
  })

  it('preserves the opaque search cursor and complete source/filter scope', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const cursor = 'opaque:scope-bound:cursor'
    const args = { query: 'reference lookup', cursor, source: 'current' as const, limit: 1, filters: { category: 'Research' } }
    const complete = toolChoiceSearchOutputSchema.parse({
      kind: 'scoped', reason: 'bounded page', schemaVersion: 'registry-tools:v3', query: args.query,
      partialResults: true, assessed: { source: 'current', scope: 'page', examined: 1, coverage: 'partial' },
      results: [], pagination: { limit: 1, hasMore: true, nextCursor: cursor },
      next: [{ action: 'registry.tools.search', args, authority: 'public' }],
    })
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(complete)
    const body = { query: args.query, source: args.source, limit: args.limit, filters: args.filters }
    const response = await handleMarketToolSearchRequest(new Request('https://ae.test/api/v1/market-tools/search', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(complete)
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ data: body }))
  })

  it('reports supply_projection freshness from the latest reconcile completion for list and search', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const completedAt = Date.now() - 5 * 60 * 1000
    const query = vi.fn(async (ref: unknown) => {
      const name = getFunctionName(ref as never)
      if (name === 'capabilitySupplyProjection:latestReconcileBusinessSupplyProjectionsCompletion') return completedAt
      throw new Error(`unexpected query ${name}`)
    })
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)

    const listResponse = await handleMarketToolListRequest(new Request('https://ae.test/api/v1/market-tools/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    }))
    const listBody = await listResponse.json()
    expect(listBody.freshness).toEqual({
      source: 'supply_projection',
      state: 'fresh',
      completedAt,
      staleAfterMs: 3 * 60 * 60 * 1000,
    })

    const searchResponse = await handleMarketToolSearchRequest(new Request('https://ae.test/api/v1/market-tools/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'reference lookup', source: 'current', limit: 1 }),
    }))
    const searchBody = await searchResponse.json()
    expect(searchBody.freshness).toEqual({
      source: 'supply_projection',
      state: 'fresh',
      completedAt,
      staleAfterMs: 3 * 60 * 60 * 1000,
    })
  })

  it('rejects malformed describe input as RFC9457 problem details', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const response = await handleMarketToolDescribeRequest(new Request('https://ae.test/api/v1/market-tools/describe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toolRef: 'historical-or-malformed' }),
    }))

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
  })

  it.each([
    ['list', handleMarketToolListRequest],
    ['search', handleMarketToolSearchRequest],
    ['describe', handleMarketToolDescribeRequest],
    ['compare', handleMarketToolCompareRequest],
  ])('returns local input errors for %s even when remote admission is unavailable', async (route, handler) => {
    const admit = vi.fn(async () => { throw new Error('rate limit source unavailable') })
    setHttpRateLimitAdmissionForTests(admit)
    const endpoint = `https://ae.test/api/v1/market-tools/${route}`

    for (const request of [
      new Request(endpoint, { method: 'POST', body: '{}' }),
      new Request(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;note=application/json' },
        body: '{}',
      }),
      new Request(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/jsonp' },
        body: '{}',
      }),
    ]) {
      const unsupported = await handler(request)
      expect(unsupported.status).toBe(415)
      await expect(unsupported.json()).resolves.toMatchObject({
        kind: 'UNSUPPORTED_MEDIA_TYPE',
        code: 'invalid_content_type',
      })
    }

    const malformed = await handler(new Request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }))
    expect(malformed.status).toBe(400)
    await expect(malformed.json()).resolves.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_json',
    })
    expect(admit).not.toHaveBeenCalled()
  })
  it('runs anonymous compare through the canonical POST path with exact refs', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const refs = [
      `operation:v1:${'a'.repeat(64)}`,
      `operation:v1:${'b'.repeat(64)}`,
    ]
    const response = await handleMarketToolCompareRequest(new Request('https://ae.test/api/v1/market-tools/compare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toolRefs: refs }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      kind: 'unavailable',
      schemaVersion: 'registry-tools:v3',
      reason: 'tool_not_found',
    })
  })
})

describe('public external registry route', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.clearAllMocks()
  })

  const registryId = (index: number) => `registry:${index.toString(16).padStart(64, '0')}`
  const registryEntry = (index: number, summary = 'Search company data.') => ({
    id: registryId(index),
    source: 'coinbase' as const,
    toolRef: registryId(index),
    choice: { access: 'ae_callable' as const, toolRef: registryId(index) },
    title: `Companies search ${index}`,
    summary,
    provider: 'Treg provider',
    actionClass: 'retrieve',
    objectClass: 'data',
    category: 'data',
    completedAt: 1,
    // A buggy index cannot accidentally make raw snapshots appear in browse.
    entry: { metadataJson: 'secret source JSON', input: { schemaJson: 'secret schema' } },
  })

  it('returns a compact page, default 8 / max 12, source freshness and no raw metadata', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const directoryCompletedAt = Date.now() - 5 * 60 * 1000
    const query = vi.fn(async (ref: unknown) => {
      if (getFunctionName(ref as never) === 'x402DirectoryIndex:status') {
        return { kind: 'ready', coverage: { generation: 'g1', completedAt: directoryCompletedAt }, refreshState: 'complete' }
      }
      expect(getFunctionName(ref as never)).toBe('x402DirectoryIndex:searchCompact')
      return {
        kind: 'ok', coverage: { generation: 'g1', completedAt: directoryCompletedAt },
        page: [registryEntry(1)], isDone: true, continueCursor: '',
      }
    })
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)
    const get = await handleApiRegistryRequest(new Request(
      'https://ae.test/api/v1/registry?query=companies',
      { headers: { 'x-ae-request-id': 'registry-route-test' } },
    ))
    expect(get.status).toBe(200)
    expect(get.headers.get('x-ae-request-id')).toBe('registry-route-test')
    const body = await get.json()
    expect(body).toMatchObject({
      schemaVersion: 'api-registry:v4', query: 'companies', kind: 'ok',
      pagination: { limit: 8, hasMore: false },
      page: [{ id: registryEntry(1).id, access: 'ae_callable', toolRef: registryEntry(1).id, detailRef: `/api/v1/registry/detail?id=${encodeURIComponent(registryEntry(1).id)}` }],
    })
    expect(body.freshness).toEqual({
      source: 'x402_directory', state: 'fresh', completedAt: directoryCompletedAt,
      staleAfterMs: 36 * 60 * 60 * 1000,
    })
    expect(JSON.stringify(body)).not.toMatch(/metadataJson|schemaJson|secret source|secret schema|searchMethod/u)
    expect(query).toHaveBeenCalledWith(
      expect.anything(), { query: 'companies', paginationOpts: { cursor: null, numItems: 8 } },
    )

    const head = await handleApiRegistryRequest(
      new Request('https://ae.test/api/v1/registry', { method: 'HEAD' }), true,
    )
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('rewinds a large page at the index until JSON fits 16 KiB, preserving the correct cursor', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const nativePage = Array.from({ length: 12 }, (_, index) => registryEntry(index, '界'.repeat(680)))
    const query = vi.fn(async (ref: unknown, args: { paginationOpts: { numItems: number } }) => {
      if (getFunctionName(ref as never) === 'x402DirectoryIndex:status') {
        return { kind: 'ready', coverage: { generation: 'g1', completedAt: Date.now() }, refreshState: 'complete' }
      }
      return {
        kind: 'ok', coverage: { generation: 'g1', completedAt: Date.now() },
        page: nativePage.slice(0, args.paginationOpts.numItems),
        isDone: false, continueCursor: `after-${args.paginationOpts.numItems}`,
      }
    })
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)
    const response = await handleApiRegistryRequest(new Request('https://ae.test/api/v1/registry?limit=12'))
    expect(response.status).toBe(200)
    const bytes = new TextEncoder().encode(await response.clone().text())
    expect(bytes.byteLength).toBeLessThanOrEqual(16 * 1024)
    const body = await response.json()
    expect(body.page.length).toBeLessThan(12)
    expect(body.page.length).toBeGreaterThan(0)
    expect(body.pagination).toEqual({
      limit: 12, hasMore: true,
      nextCursor: encodeOpaqueCursor({ kind: 'registry', scope: 'g1', cursor: `after-${body.page.length}` }),
    })
    expect(query).toHaveBeenCalledWith(expect.anything(), {
      query: '', paginationOpts: { cursor: null, numItems: body.page.length },
    })
    const hugeRow = registryEntry(0, '界'.repeat(7_000))
    query.mockImplementation(async (ref: unknown) => getFunctionName(ref as never) === 'x402DirectoryIndex:status'
      ? { kind: 'ready', coverage: { generation: 'g1', completedAt: Date.now() }, refreshState: 'complete' }
      : { kind: 'ok', coverage: { generation: 'g1', completedAt: Date.now() }, page: [hugeRow], isDone: true, continueCursor: '' })
    const tooLarge = await handleApiRegistryRequest(new Request('https://ae.test/api/v1/registry?limit=1'))
    expect(tooLarge.status).toBe(503)
    await expect(tooLarge.json()).resolves.toMatchObject({ code: 'registry_unavailable' })
  })

  it('binds continuation to the index generation and rejects stale or foreign cursors', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    let generation = 'g1'
    let projectionGeneration = 'g1'
    const query = vi.fn(async (ref: unknown, args?: { query?: string }) => {
      if (getFunctionName(ref as never) === 'x402DirectoryIndex:status') {
        return { kind: 'ready', coverage: { generation, completedAt: Date.now() }, refreshState: 'complete' }
      }
      if (args?.query === 'changed') return { kind: 'unavailable', reason: 'cursor_invalid' }
      return { kind: 'ok', coverage: { generation: projectionGeneration, completedAt: Date.now() }, page: [registryEntry(1)], isDone: false, continueCursor: 'native-next' }
    })
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)
    const first = await handleApiRegistryRequest(new Request('https://ae.test/api/v1/registry'))
    const body = await first.json()
    expect(body.pagination.nextCursor).toBe(encodeOpaqueCursor({ kind: 'registry', scope: 'g1', cursor: 'native-next' }))
    generation = 'g2'
    const stale = await handleApiRegistryRequest(new Request(`https://ae.test/api/v1/registry?cursor=${encodeURIComponent(body.pagination.nextCursor)}`))
    expect(stale.status).toBe(400)
    await expect(stale.json()).resolves.toMatchObject({ code: 'invalid_cursor' })
    expect(query.mock.calls.filter(([ref]) => getFunctionName(ref as never) === 'x402DirectoryIndex:searchCompact')).toHaveLength(1)
    generation = 'g1'
    projectionGeneration = 'g2'
    const rotatedDuringRead = await handleApiRegistryRequest(new Request(`https://ae.test/api/v1/registry?cursor=${encodeURIComponent(body.pagination.nextCursor)}`))
    expect(rotatedDuringRead.status).toBe(400)
    await expect(rotatedDuringRead.json()).resolves.toMatchObject({ code: 'invalid_cursor' })
    projectionGeneration = 'g1'
    const shiftedQuery = await handleApiRegistryRequest(new Request(`https://ae.test/api/v1/registry?query=changed&cursor=${encodeURIComponent(body.pagination.nextCursor)}`))
    expect(shiftedQuery.status).toBe(400)
    await expect(shiftedQuery.json()).resolves.toMatchObject({ code: 'invalid_cursor' })
    const foreign = await handleApiRegistryRequest(new Request('https://ae.test/api/v1/registry?cursor=malformed'))
    expect(foreign.status).toBe(400)
  })

  it('loads exact source metadata/schema only by indexed ID and names the listing ref Quote accepts', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const id = registryEntry(1).id
    const query = vi.fn(async (ref: unknown) => {
      if (getFunctionName(ref as never) === 'x402DirectoryIndex:status') {
        return { kind: 'ready', coverage: { generation: 'g1', completedAt: Date.now() }, refreshState: 'complete' }
      }
      expect(getFunctionName(ref as never)).toBe('x402DirectoryIndex:detailById')
      return {
        kind: 'found', coverage: { generation: 'g1', completedAt: Date.now() },
        item: { choice: { access: 'ae_callable', toolRef: id }, entry: { metadataJson: '{"source":"verbatim"}', input: { schemaJson: '{"type":"object"}' } } },
      }
    })
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)
    const response = await handleApiRegistryDetailRequest(new Request(`https://ae.test/api/v1/registry/detail?id=${id}`))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      schemaVersion: 'api-registry-detail:v1', id, kind: 'found', access: 'ae_callable',
      item: { entry: { metadataJson: '{"source":"verbatim"}', input: { schemaJson: '{"type":"object"}' } } },
    })
    expect(body.item.choice).toEqual({ access: 'ae_callable', toolRef: id })
    expect(body).not.toHaveProperty('warning')
    expect(query).toHaveBeenCalledWith(expect.anything(), { id })
    const missing = await handleApiRegistryDetailRequest(new Request('https://ae.test/api/v1/registry/detail?id=nope'))
    expect(missing.status).toBe(400)
    const repeated = await handleApiRegistryDetailRequest(new Request(`https://ae.test/api/v1/registry/detail?id=${id}&id=${id}`))
    expect(repeated.status).toBe(400)
    expect(query.mock.calls.filter(([ref]) => getFunctionName(ref as never) === 'x402DirectoryIndex:detailById')).toHaveLength(1)
  })

  it('maps unavailable, missing and invalid inputs without leaking metadata', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const query = vi.fn(async (): Promise<{ kind: string; reason?: string }> => ({ kind: 'unavailable', reason: 'index_unavailable' }))
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never)
    for (const url of ['?limit=13', `?query=${'x'.repeat(201)}`, '?access=provider_account']) {
      const invalid = await handleApiRegistryRequest(new Request(`https://ae.test/api/v1/registry${url}`))
      expect(invalid.status).toBe(400)
      await expect(invalid.json()).resolves.toMatchObject({ code: 'invalid_query_parameter' })
    }
    expect(query).not.toHaveBeenCalled()
    const unavailable = await handleApiRegistryRequest(new Request('https://ae.test/api/v1/registry'))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get('retry-after')).toBe('30')
    const id = registryEntry(1).id
    query.mockResolvedValue({ kind: 'not_found' })
    const notFound = await handleApiRegistryDetailRequest(new Request(`https://ae.test/api/v1/registry/detail?id=${id}`))
    expect(notFound.status).toBe(404)

    const handlers = RegistryRoute.options.server?.handlers
    const post = typeof handlers === 'object' && handlers !== null && 'POST' in handlers ? handlers.POST : undefined
    if (typeof post !== 'function') throw new Error('POST handler missing')
    const refused = await post({ request: new Request('https://ae.test/api/v1/registry', { method: 'POST' }) } as never)
    if (!(refused instanceof Response)) throw new Error('POST response missing')
    expect(refused.status).toBe(405)
    expect(refused.headers.get('allow')).toBe('GET, HEAD')
  })
})
