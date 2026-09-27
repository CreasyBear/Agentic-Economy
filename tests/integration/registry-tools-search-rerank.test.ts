import { afterEach, describe, expect, it, vi } from 'vitest'

import { readCapabilityToolSearch } from '@/modules/capability-supply/tool-source'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { rerankToolSearchResult } from '@/modules/registry/tool-reranker'
import { handleMarketToolSearchRequest } from '@/routes/api.v1.market-tools.search'
import {
  ERC20_QUERY,
  TIMEZONE_QUERY,
  TOOL_CRYPTO_TX,
  jevAnswersForTool,
  jevSystemOneResponse,
  misorderedSearchResult,
} from '../helpers/tool-search-rerank-fixtures'

vi.mock('@/modules/capability-supply/tool-source', () => ({
  readCapabilityToolSearch: vi.fn(),
  readCapabilityToolDetail: vi.fn(),
  readCapabilityToolCompare: vi.fn(),
}))

const liveJevEnabled = process.env.AE_LIVE_JEV === 'true'
  && Boolean(process.env.OPENROUTER_API_KEY?.startsWith('sk-or-'))

async function postSearch(query: string): Promise<Response> {
  return handleMarketToolSearchRequest(new Request('https://ae.test/api/v1/market-tools/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ae-request-id': 'rerank-route' },
    body: JSON.stringify({ query, limit: 8, source: 'current' }),
  }))
}

describe('POST /api/v1/market-tools/search Jev re-rank', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.mocked(readCapabilityToolSearch).mockReset()
  })

  it('returns a compact assessed callable Tool with an exact describe continuation', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    setPublicSourceTransportForTests({
      query: async () => Date.now() - 60_000,
      mutation: async () => undefined,
      action: async () => undefined,
    } as never)
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(misorderedSearchResult(ERC20_QUERY))
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const href = url.toString()
      if (href.includes('/decisions') || href.includes('/v1/systemone')) {
        return jevSystemOneResponse(jevAnswersForTool('operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [0.05, 0.96, 0.2]))
      }
      throw new Error(`Unexpected url: ${href}`)
    }) as unknown as typeof fetch)

    const previousKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-not-a-live-credential'
    try {
      const response = await postSearch(ERC20_QUERY)
      expect(response.status).toBe(200)
      const body = await response.json() as {
        kind: string
        results: readonly { toolRef: string; access: string; next: readonly { action: string }[] }[]
      }
      expect(body.kind).toBe('match')
      expect(body.results.map(item => item.toolRef)).toEqual([TOOL_CRYPTO_TX.toolRef])
      expect(body.results[0]).toMatchObject({ access: 'ae_callable', next: [{ action: 'describe' }] })
      expect(body).not.toHaveProperty('recommendation')
    } finally {
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = previousKey
    }
  })

  it('returns unavailable without unassessed candidates when Jev fails', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    setPublicSourceTransportForTests({
      query: async () => Date.now() - 60_000,
      mutation: async () => undefined,
      action: async () => undefined,
    } as never)
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(misorderedSearchResult(TIMEZONE_QUERY))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Internal Server Error', { status: 500 })) as unknown as typeof fetch)

    const previousKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-not-a-live-credential'
    try {
      const startedAt = Date.now()
      const response = await postSearch(TIMEZONE_QUERY)
      const elapsedMs = Date.now() - startedAt
      expect(response.status).toBe(200)
      expect(response.status).not.toBe(500)
      const body = await response.json() as {
        kind: string
        query: string
        results: readonly { toolRef: string }[]
      }
      expect(body.kind).toBe('unavailable')
      expect(body.query).toBe(TIMEZONE_QUERY)
      expect(body.results).toHaveLength(0)
      expect(body).not.toHaveProperty('recommendation')
      expect(elapsedMs).toBeLessThan(8_000)
    } finally {
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = previousKey
    }
  })
})

describe.runIf(liveJevEnabled)('live OpenRouter Jev re-rank (AE_LIVE_JEV=true)', () => {
  it('ranks the ERC-20 transfer tool first for a transfer-lookup query', async () => {
    const startedAt = Date.now()
    const reranked = await rerankToolSearchResult(
      misorderedSearchResult(ERC20_QUERY),
      ERC20_QUERY,
      {
        timeoutMs: 5_000,
        disableSecondaryLlm: true,
      },
    )
    const elapsedMs = Date.now() - startedAt

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return
    expect(reranked.items[0]?.toolRef).toBe('operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(reranked.ranking[0]?.rank).toBe(1)
    expect(elapsedMs).toBeLessThan(8_000)
  }, 15_000)

  it('ranks the timezone converter first for a London-to-Sydney query', async () => {
    const startedAt = Date.now()
    const reranked = await rerankToolSearchResult(
      misorderedSearchResult(TIMEZONE_QUERY),
      TIMEZONE_QUERY,
      {
        timeoutMs: 5_000,
        disableSecondaryLlm: true,
      },
    )
    const elapsedMs = Date.now() - startedAt

    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok') return
    expect(reranked.items[0]?.toolRef).toBe('operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    expect(reranked.ranking[0]?.rank).toBe(1)
    expect(elapsedMs).toBeLessThan(8_000)
  }, 15_000)
})
