import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { internal } from '../../convex/_generated/api'
import type { IndexedSource } from '../../convex/lib/x402DirectoryIndex/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { setPublicSourceTransportForTests, type ConvexSourceTransport } from '@/lib/server/convex-source'
import { handleApiRegistryRequest, Route as RegistryRoute } from '@/routes/api.v1.registry'
import { handleMarketToolListRequest, Route as MarketToolListRoute } from '@/routes/api.v1.market-tools.list'
import { handleMarketToolSearchRequest, Route as MarketToolSearchRoute } from '@/routes/api.v1.market-tools.search'
import { handleDurableListBusinessesRequest, Route as BusinessesRoute } from '@/routes/api.businesses'
import { readCapabilityToolSearch } from '@/modules/capability-supply/tool-source'
import { convexTestWithMarketComponents, type ConvexFixtureBackend } from '../helpers/convex-fixtures'
import { installLocalE2eRegistrySourceForTests } from '../helpers/registry-local-e2e'
import {
  EMOJI_QUERY_300,
  INVALID_LIMIT_STRINGS,
  MALFORMED_CURSOR,
  OVERSIZED_CURSOR,
  expectProblemJson,
} from '../helpers/catalogue-hostile-inputs'

// Shared hostile-input table (Well 4, criterion 3, C5+C22): the same class of
// bad limit/cursor/query input is thrown at every catalogue read route. Each
// section below adapts the shared fixtures (tests/helpers/catalogue-hostile-inputs.ts)
// to that route's own request shape (query string for registry/businesses,
// JSON body for market-tools) rather than forcing one runner over routes that
// genuinely differ.

vi.mock('@/modules/capability-supply/tool-source', () => ({
  readCapabilityToolSearch: vi.fn(async () => ({
    kind: 'no_candidates' as const,
    schemaVersion: 'registry-tools:v3' as const,
    query: '',
    appliedFilters: {},
    matchedCount: 0,
    ranking: [],
    navigation: [],
  })),
  readCapabilityToolDetail: vi.fn(async () => ({ kind: 'not_found' as const })),
  readCapabilityToolCompare: vi.fn(async () => ({ kind: 'unavailable' as const, reason: 'tool_not_found' as const })),
}))

describe('GET /api/v1/registry hostile inputs', () => {
  function source(index: number): IndexedSource {
    const resource = `https://provider.test/tools/${index}`
    const raw = { resource, type: 'http', description: `Research tool ${index}` }
    return {
      resource,
      sourceJson: JSON.stringify(raw),
      sourceDigest: canonicalDigest(raw),
      entry: {
        resource, title: `Research tool ${index}`, description: 'Search public research', protocol: 'http',
        provider: 'provider.test', metadataJson: '', category: 'Research', tags: ['search'],
        activity: { calls30d: index },
        provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: new Date(1700000000000 + index).toISOString() },
        prices: [{ network: 'base', scheme: 'exact', amount: '1000000', decimalAmount: '1', symbol: 'USDC' }],
      },
    }
  }

  async function seedCompletedGeneration(backend: ConvexFixtureBackend, generation: string, count: number) {
    await backend.run(async ctx => {
      await ctx.db.insert('marketExternalRegistryGenerations', { generation, source: 'coinbase', status: 'refreshing', startedAt: 1, ingestedCount: 0, nextOffset: 0 })
      const state = await ctx.db.query('marketExternalRegistryState').withIndex('by_key', q => q.eq('key', 'coinbase')).unique()
      if (state === null) await ctx.db.insert('marketExternalRegistryState', { key: 'coinbase', lastAttemptAt: 1, refreshGeneration: generation, lastAttemptStatus: 'refreshing' })
      else await ctx.db.patch(state._id, { refreshGeneration: generation, lastAttemptStatus: 'refreshing' })
    })
    const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
    const items = Array.from({ length: count }, (_, index) => source(index + 1))
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: count, observedAt: 2, workload, items })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: count, observedAt: 3, workload, items: [] })
  }

  async function setup() {
    const backend = convexTestWithMarketComponents()
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const transport: ConvexSourceTransport = {
      query: backend.query as ConvexSourceTransport['query'],
      mutation: backend.mutation as ConvexSourceTransport['mutation'],
      action: backend.action as ConvexSourceTransport['action'],
    }
    setPublicSourceTransportForTests(transport)
    return backend
  }

  afterEach(() => {
    setPublicSourceTransportForTests(undefined)
  })

  function registryRequest(params: Readonly<Record<string, string | readonly string[]>>): Request {
    const url = new URL('https://ae.test/api/v1/registry')
    for (const [key, value] of Object.entries(params)) {
      for (const one of Array.isArray(value) ? value : [value]) url.searchParams.append(key, one)
    }
    return new Request(url)
  }

  it.each(INVALID_LIMIT_STRINGS)('rejects limit=%s as 400 invalid_query_parameter', async (limit) => {
    const backend = await setup()
    await seedCompletedGeneration(backend, `gen-limit-${limit}`, 2)
    const response = await handleApiRegistryRequest(registryRequest({ limit }))
    // Unified code (Well 4, criterion 3): every query-validation failure on
    // this route reports `invalid_query_parameter`, not a route-private
    // `invalid_registry_query` literal.
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  it('rejects a limit over the maximum (51) as 400 invalid_query_parameter', async () => {
    const backend = await setup()
    await seedCompletedGeneration(backend, 'gen-over-max', 2)
    const response = await handleApiRegistryRequest(registryRequest({ limit: '51' }))
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  it('rejects an unknown query key as 400 invalid_query_parameter', async () => {
    const backend = await setup()
    await seedCompletedGeneration(backend, 'gen-unknown-key', 2)
    const response = await handleApiRegistryRequest(registryRequest({ bogus: 'x' }))
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  // Fixed: the route now decodes the incoming cursor through the shared
  // opaque-cursor contract (`@/modules/registry/opaque-cursor`) BEFORE ever
  // calling the paginate engine. A structurally malformed token never reaches
  // Convex, so it can never surface as 503 - it is rejected as 400
  // invalid_cursor up front.
  it('rejects a malformed cursor as 400 invalid_cursor, never 503/200', async () => {
    const backend = await setup()
    await seedCompletedGeneration(backend, 'gen-malformed-cursor', 2)
    const response = await handleApiRegistryRequest(registryRequest({ cursor: MALFORMED_CURSOR }))
    expect(response.status).not.toBe(503)
    expect(response.status).not.toBe(200)
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_cursor' })
  })

  it('rejects a 513-char cursor before it ever reaches the index (schema bound, not invalid_cursor)', async () => {
    const backend = await setup()
    await seedCompletedGeneration(backend, 'gen-oversized-cursor', 2)
    const response = await handleApiRegistryRequest(registryRequest({ cursor: OVERSIZED_CURSOR }))
    // The 512-char zod bound on `cursor` fires first, so an oversized cursor
    // is reported as `invalid_query_parameter` (unified code), not
    // `invalid_cursor`. Still 400 problem+json, never 503/200.
    expect(response.status).not.toBe(503)
    expect(response.status).not.toBe(200)
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  // Fixed: a foreign-route cursor is not shaped like this route's opaque
  // envelope (wrong/missing `kind`), so it fails decode structurally - it is
  // rejected as 400 invalid_cursor before ever reaching Convex.
  it('rejects a valid cursor issued by /api/businesses as 400 invalid_cursor', async () => {
    const backend = await setup()
    await seedCompletedGeneration(backend, 'gen-foreign-cursor', 2)
    // "1" is the continueCursor shape /api/businesses issues (a small decimal
    // offset) - not this route's opaque cursor envelope.
    const response = await handleApiRegistryRequest(registryRequest({ cursor: '1' }))
    expect(response.status).not.toBe(503)
    expect(response.status).not.toBe(200)
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_cursor' })
  })

  // Fixed (the most serious finding in this file): the opaque cursor binds to
  // the directory generation it was issued against (`scope`). When a new
  // generation completes and becomes active, a cursor minted against the old
  // generation fails the scope check and is rejected as 400 invalid_cursor
  // instead of silently resuming inside the new generation's rows.
  it('rejects a cursor issued by a previous directory generation as 400 invalid_cursor', async () => {
    const backend = await setup()
    await seedCompletedGeneration(backend, 'gen-cross-a', 13)
    const first = await handleApiRegistryRequest(registryRequest({ limit: '24' }))
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    const staleCursor = firstBody.pagination.nextCursor as string
    expect(typeof staleCursor).toBe('string')

    // A new generation completes and becomes active; the old generation's
    // cursor no longer matches any index range the route can browse.
    await seedCompletedGeneration(backend, 'gen-cross-b', 2)

    const replay = await handleApiRegistryRequest(registryRequest({ cursor: staleCursor }))
    expect(replay.status).not.toBe(503)
    expect(replay.status).not.toBe(200)
    await expectProblemJson(replay, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_cursor' })
  })

  it('rejects a repeated limit param as 400 invalid_query_parameter naming the parameter', async () => {
    const backend = await setup()
    await seedCompletedGeneration(backend, 'gen-repeated-limit', 2)
    const response = await handleApiRegistryRequest(registryRequest({ limit: ['1', '999'] }))
    // Fixed: registry and businesses used to disagree on which repeated value
    // wins (last vs first); both now refuse the request outright.
    const body = await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
    expect(body.detail).toContain('limit')
  })

  it('rejects a 300-char emoji query as 400, never silently truncated', async () => {
    const backend = await setup()
    await seedCompletedGeneration(backend, 'gen-emoji-query', 2)
    const response = await handleApiRegistryRequest(registryRequest({ query: EMOJI_QUERY_300 }))
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  it('refuses POST with 405 and an Allow header carrying a detail', async () => {
    const handlers = RegistryRoute.options.server?.handlers
    const post = typeof handlers === 'object' && handlers !== null && 'POST' in handlers ? handlers.POST : undefined
    if (typeof post !== 'function') throw new Error('POST handler missing')
    const response = await post({ request: new Request('https://ae.test/api/v1/registry', { method: 'POST' }) } as never)
    if (!(response instanceof Response)) throw new Error('POST response missing')
    expect(response.headers.get('allow')).toBe('GET, HEAD')
    await expectProblemJson(response, { status: 405, kind: 'METHOD_NOT_ALLOWED', code: 'method_not_allowed' })
  })

  it.todo('rejects a wrong Content-Type: registry is a GET/HEAD-only route that never reads a body, so this case does not apply here (covered on the market-tools POST routes instead)')
})

describe('POST /api/v1/market-tools/list and /search hostile inputs', () => {
  beforeEach(() => {
    vi.mocked(readCapabilityToolSearch).mockClear()
  })

  const routes = [
    { name: 'list', handler: handleMarketToolListRequest, route: MarketToolListRoute, path: '/api/v1/market-tools/list', overMax: 101, base: {} },
    { name: 'search', handler: handleMarketToolSearchRequest, route: MarketToolSearchRoute, path: '/api/v1/market-tools/search', overMax: 21, base: { query: 'reference lookup' } },
  ] as const

  function jsonRequest(path: string, body: unknown): Request {
    return new Request(`https://ae.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  function rawJsonRequest(path: string, rawBody: string): Request {
    return new Request(`https://ae.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: rawBody,
    })
  }

  for (const route of routes) {
    describe(route.name, () => {
      it.each([
        ['limit: 0', 0],
        ['limit: -5', -5],
        ['limit: 1.5', 1.5],
        ['limit: "not-a-number"', 'not-a-number'],
      ])('rejects %s as 400 invalid_body', async (_label, limit) => {
        const response = await route.handler(jsonRequest(route.path, { ...route.base, limit }))
        await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
      })

      // `JSON.parse` rejects bare NaN/Infinity tokens outright, so this never
      // reaches the limit schema at all - it is `invalid_json`, not
      // `invalid_body`. Fixed: the shared `problem()` helper now guarantees a
      // non-empty `detail` on every problem body, so this is no longer the
      // one code path missing it.
      for (const token of ['NaN', 'Infinity']) {
        it(`rejects a literal ${token} limit token as invalid JSON (400) with a detail`, async () => {
          const response = await route.handler(rawJsonRequest(route.path, `{${Object.entries(route.base).map(([k, v]) => `"${k}":${JSON.stringify(v)}`).join(',')}${Object.keys(route.base).length > 0 ? ',' : ''}"limit":${token}}`))
          await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_json' })
        })
      }

      it(`rejects limit over the maximum (${route.overMax}) as 400 invalid_body`, async () => {
        const response = await route.handler(jsonRequest(route.path, { ...route.base, limit: route.overMax }))
        await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
      })

      it('rejects an unknown body key as 400 invalid_body (strictObject)', async () => {
        const response = await route.handler(jsonRequest(route.path, { ...route.base, bogus: 'x' }))
        await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
      })

      it('rejects an oversized (8193-char) cursor as 400 invalid_body', async () => {
        const response = await route.handler(jsonRequest(route.path, { ...route.base, cursor: 'x'.repeat(8193) }))
        await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
      })

      // Fixed: a malformed opaque cursor is schema-valid (any string up to
      // 8192 chars), but `tools.actions.ts` now decodes it through the shared
      // opaque-cursor contract BEFORE ever calling `readCapabilityToolSearch`
      // - the mock below is never invoked. Decode failure throws
      // `InvalidOpaqueCursorError`, which the route maps to 400 invalid_cursor
      // instead of falling through to the generic 503 tool_read_unavailable.
      it('rejects a malformed cursor as 400 invalid_cursor, never 503', async () => {
        vi.mocked(readCapabilityToolSearch).mockImplementationOnce(async () => {
          const error = new Error('InvalidCursor: failed to parse cursor') as Error & { data?: unknown }
          error.data = { paginationError: 'InvalidCursor' }
          throw error
        })
        const response = await route.handler(jsonRequest(route.path, { ...route.base, cursor: MALFORMED_CURSOR }))
        expect(response.status).not.toBe(503)
        await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_cursor' })
      })

      it('refuses GET with 405 and an Allow header carrying a detail', async () => {
        const handlers = route.route.options.server?.handlers
        const get = typeof handlers === 'object' && handlers !== null && 'GET' in handlers ? handlers.GET : undefined
        if (typeof get !== 'function') throw new Error('GET handler missing')
        const response = await get({ request: new Request(`https://ae.test${route.path}`, { method: 'GET' }) } as never)
        if (!(response instanceof Response)) throw new Error('GET response missing')
        expect(response.headers.get('allow')).toBe('POST')
        await expectProblemJson(response, { status: 405, kind: 'METHOD_NOT_ALLOWED', code: 'method_not_allowed' })
      })

      // Fixed: the shared `problem()` helper now guarantees a non-empty
      // `detail` on every problem body, including this 415.
      it('rejects a non-JSON Content-Type as a 415 problem carrying a detail', async () => {
        const response = await route.handler(new Request(`https://ae.test${route.path}`, {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: '{}',
        }))
        await expectProblemJson(response, { status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type' })
      })
    })
  }
})

describe('GET /api/businesses hostile inputs', () => {
  let restoreLocalSource: (() => void) | undefined

  beforeEach(() => {
    vi.stubEnv('CONVEX_URL', undefined)
    vi.stubEnv('VITE_CONVEX_URL', undefined)
    restoreLocalSource = installLocalE2eRegistrySourceForTests()
  })

  afterEach(() => {
    restoreLocalSource?.()
    restoreLocalSource = undefined
    vi.unstubAllEnvs()
  })

  function businessesRequest(params: Readonly<Record<string, string | readonly string[]>>): Request {
    const url = new URL('https://ae.example/api/businesses')
    for (const [key, value] of Object.entries(params)) {
      for (const one of Array.isArray(value) ? value : [value]) url.searchParams.append(key, one)
    }
    return new Request(url)
  }

  it.each(INVALID_LIMIT_STRINGS)('rejects limit=%s as 400 invalid_query_parameter', async (limit) => {
    const response = await handleDurableListBusinessesRequest(businessesRequest({ limit }))
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  it('rejects a limit over the maximum (51) as 400 invalid_query_parameter', async () => {
    const response = await handleDurableListBusinessesRequest(businessesRequest({ limit: '51' }))
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  it('rejects an unknown query key as 400 unsupported_query_parameter', async () => {
    const response = await handleDurableListBusinessesRequest(businessesRequest({ q: 'plumber' }))
    // Finding: this endpoint names the code `unsupported_query_parameter`
    // (kind FAILED_PRECONDITION) rather than `invalid_query_parameter` -
    // it wants callers redirected to /api/businesses/search instead of just
    // told the key is bad.
    await expectProblemJson(response, { status: 400, kind: 'FAILED_PRECONDITION', code: 'unsupported_query_parameter' })
  })

  it('rejects a malformed cursor as 400 invalid_cursor, never 503/200', async () => {
    const response = await handleDurableListBusinessesRequest(businessesRequest({ cursor: MALFORMED_CURSOR }))
    expect(response.status).not.toBe(503)
    expect(response.status).not.toBe(200)
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_cursor' })
  })

  it('rejects a 513-char cursor before it reaches pagination (schema bound, not invalid_cursor)', async () => {
    const response = await handleDurableListBusinessesRequest(businessesRequest({ cursor: OVERSIZED_CURSOR }))
    expect(response.status).not.toBe(503)
    expect(response.status).not.toBe(200)
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
  })

  it('rejects a valid cursor issued by /api/v1/registry as 400 invalid_cursor', async () => {
    // A Convex opaque pagination cursor is not `Number()`-parseable, so it
    // fails this route's own offset-cursor decode the same way a garbage
    // string would.
    const foreignCursor = Buffer.from(JSON.stringify({ id: 'k17abc', generation: 'coinbase-gen-x' })).toString('base64')
    const response = await handleDurableListBusinessesRequest(businessesRequest({ cursor: foreignCursor }))
    expect(response.status).not.toBe(503)
    expect(response.status).not.toBe(200)
    await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_cursor' })
  })

  it('rejects a repeated limit param as 400 invalid_query_parameter naming the parameter', async () => {
    const response = await handleDurableListBusinessesRequest(businessesRequest({ limit: ['1', '999'] }))
    // Fixed: registry and businesses used to disagree on which duplicate wins
    // (last value vs `URLSearchParams.get`'s first value); both now refuse
    // the request outright instead of silently picking a winner.
    const body = await expectProblemJson(response, { status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
    expect(body.detail).toContain('limit')
  })

  it.todo('rejects a 300-char emoji query: /api/businesses accepts no query term at all (browse-only) - see /api/businesses/search for the query-length case, which is out of this scope\'s named routes')

  it('refuses POST with 405 and an Allow header carrying a detail', async () => {
    const handlers = BusinessesRoute.options.server?.handlers
    const post = typeof handlers === 'object' && handlers !== null && 'POST' in handlers ? handlers.POST : undefined
    if (typeof post !== 'function') throw new Error('POST handler missing')
    const response = await post({ request: new Request('https://ae.example/api/businesses', { method: 'POST' }) } as never)
    if (!(response instanceof Response)) throw new Error('POST response missing')
    expect(response.headers.get('allow')).toBe('GET')
    await expectProblemJson(response, { status: 405, kind: 'METHOD_NOT_ALLOWED', code: 'method_not_allowed' })
  })

  it.todo('rejects a wrong Content-Type: /api/businesses is a GET-only route that never reads a body, so this case does not apply here (covered on the market-tools POST routes instead)')
})
