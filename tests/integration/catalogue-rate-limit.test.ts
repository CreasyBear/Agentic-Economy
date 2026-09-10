import { getFunctionName, type FunctionReference } from 'convex/server'
import { MINUTE, RateLimiter, type RateLimitConfig } from '@convex-dev/rate-limiter'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { components } from '../../convex/_generated/api'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleMarketToolListRequest } from '@/routes/api.v1.market-tools.list'
import { convexTestWithMarketComponents, type ConvexFixtureBackend } from '../helpers/convex-fixtures'

const searchResult = {
  kind: 'no_candidates' as const,
  schemaVersion: 'registry-tools:v3' as const,
  query: '',
  appliedFilters: {},
  matchedCount: 0,
  ranking: [],
  navigation: [],
}

// Mirrors tests/unit/server/tool-market-routes.test.ts: the catalogue route's
// business logic is mocked away so only rate-limit admission is exercised for
// real below.
vi.mock('@/modules/capability-supply/tool-source', () => ({
  readCapabilityToolSearch: vi.fn(async () => searchResult),
  readCapabilityToolDetail: vi.fn(async () => ({ kind: 'not_found' })),
  readCapabilityToolCompare: vi.fn(async () => ({ kind: 'unavailable', reason: 'tool_not_found' })),
}))

// One admission per minute drives the exact same @convex-dev/rate-limiter
// component and token-bucket algorithm production's "public-read" limit uses
// (convex/lib/rateLimit.ts assertAdmission -> rateLimiter.limit), just with a
// budget small enough to exhaust in two requests instead of the real 120/min.
const TINY_BUDGET: RateLimitConfig = { kind: 'token bucket', rate: 1, period: MINUTE, capacity: 1 }

function installRealRateLimiterTransport(backend: ConvexFixtureBackend) {
  const tinyLimiter = new RateLimiter(components.rateLimiter)
  const mutation = (
    mutationRef: FunctionReference<'mutation'>,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    if (getFunctionName(mutationRef) !== 'rateLimit:admitHttp') return backend.mutation(mutationRef, args)
    const name = args.name as string
    const key = args.key as string
    return backend.run(async (ctx) => {
      const admission = await tinyLimiter.limit(ctx, name, { key, config: TINY_BUDGET })
      return admission.ok
        ? (admission.retryAfter === undefined ? { ok: true } : { ok: true, retryAfter: admission.retryAfter })
        : { ok: false, retryAfter: admission.retryAfter }
    })
  }
  return {
    query: (queryRef: FunctionReference<'query'>, args: Record<string, unknown>) => backend.query(queryRef, args),
    mutation,
    action: (actionRef: FunctionReference<'action'>, args: Record<string, unknown>) => backend.action(actionRef, args),
  }
}

function catalogueRequest(apiKey: string): Request {
  return new Request('https://ae.test/api/v1/market-tools/list', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: '{}',
  })
}

describe('catalogue route real rate limiting', () => {
  beforeEach(() => {
    // tests/setup/http-rate-limit.ts stubs admission to always-ok before
    // every test via setHttpRateLimitAdmissionForTests. Calling it again here
    // with `undefined` is the documented opt-out: assertHttpAdmission (see
    // src/lib/server/rate-limit.ts:59-87) then falls through to the real
    // callPublicSourceMutation('rateLimit:admitHttp', ...) path, which
    // installRealRateLimiterTransport below resolves against a real
    // @convex-dev/rate-limiter component instance.
    setHttpRateLimitAdmissionForTests(undefined)
  })

  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.clearAllMocks()
  })

  it('429s a client past a tiny real budget with an RFC 9457 problem and Retry-After, while a different client is still admitted', async () => {
    const backend = convexTestWithMarketComponents()
    setPublicSourceTransportForTests(installRealRateLimiterTransport(backend) as never)

    const admitted = await handleMarketToolListRequest(catalogueRequest('client-a-secret-key'))
    expect(admitted.status).toBe(200)

    const limited = await handleMarketToolListRequest(catalogueRequest('client-a-secret-key'))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('content-type')).toContain('application/problem+json')
    const retryAfterSeconds = Number(limited.headers.get('retry-after'))
    expect(Number.isFinite(retryAfterSeconds)).toBe(true)
    expect(retryAfterSeconds).toBeGreaterThan(0)
    await expect(limited.json()).resolves.toMatchObject({ status: 429, code: 'rate_limited' })

    const otherClient = await handleMarketToolListRequest(catalogueRequest('client-b-secret-key'))
    expect(otherClient.status).toBe(200)
  })
})
