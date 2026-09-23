import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readCapabilityToolSearch } from '@/modules/capability-supply/tool-source'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import * as decisionEngine from '@/modules/decision-engine/public'
import { toolCatalogSearchInputSchema } from '@/modules/registry/tool-choice-contracts'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'
import {
  ERC20_QUERY,
  TIMEZONE_QUERY,
  TOOL_CRYPTO_TX,
  TOOL_CURRENCY,
  TOOL_TIMEZONE,
  jevAnswersForTool,
  jevSystemOneResponse,
  misorderedSearchResult,
} from '../../helpers/tool-search-rerank-fixtures'

vi.mock('@/modules/capability-supply/tool-source', () => ({
  readCapabilityToolSearch: vi.fn(),
  readCapabilityToolDetail: vi.fn(),
  readCapabilityToolCompare: vi.fn(),
}))

async function runSearch(query: string, request?: Request) {
  const data = toolCatalogSearchInputSchema.parse({ query, limit: 10 })
  return registryToolsSearchAction.run({
    data,
    context: { caller: 'http', ...(request === undefined ? {} : { request }) },
  })
}

function stubJevFetch(implementation: typeof fetch) {
  vi.stubGlobal('fetch', implementation)
}

describe('registryToolsSearchAction Jev re-rank wiring', () => {
  afterEach(() => {
    setPublicSourceTransportForTests(undefined)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.mocked(readCapabilityToolSearch).mockReset()
  })

  beforeEach(() => {
    setPublicSourceTransportForTests({
      query: async () => Date.now() - 60_000,
      mutation: async () => undefined,
      action: async () => undefined,
    } as never)
  })

  it.each(['before', 'during'])('preserves discovery when the HTTP request is cancelled %s inference', async timing => {
    const source = misorderedSearchResult(ERC20_QUERY)
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(source)
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        controller.abort()
      })
    })
    stubJevFetch(fetcher)
    if (timing === 'before') controller.abort()
    const result = await runSearch(ERC20_QUERY, new Request('https://ae.test/api/v1/market-tools/search', { signal: controller.signal }))
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.items.map(item => item.toolRef)).toEqual(source.items.map(item => item.toolRef))
    expect(fetcher).toHaveBeenCalledTimes(timing === 'before' ? 0 : 1)
    if (timing === 'during') expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('reads candidates, scores them through the Decision Gateway, and returns Jev order', async () => {
    const searchResult = misorderedSearchResult(ERC20_QUERY)
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(searchResult)
    const gateway = vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one',
      model: '~typesafe/jev-latest',
      answers: jevAnswersForTool('operation:v1:crypto_tx_lookup', [0.07, 0.93, 0.12]) as never,
      usage: { inputTokens: 160, outputTokens: 0, estimatedCostAud: 'A$0.000007' },
      durationMs: 48,
      attemptedTiers: ['jev_system_one'],
    })

    const result = await runSearch(ERC20_QUERY)

    expect(readCapabilityToolSearch).toHaveBeenCalledWith({
      query: ERC20_QUERY,
      limit: 10,
    })
    expect(gateway).toHaveBeenCalledOnce()
    expect(gateway.mock.calls[0]?.[0]).toMatchObject({
      state: { query: ERC20_QUERY },
      questions: {
        match_0: { type: 'noul' },
        match_1: { type: 'noul' },
        match_2: { type: 'noul' },
        best_match: { type: 'choice' },
      },
    })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.items.map((item) => item.toolRef)).toEqual([
      'operation:v1:crypto_tx_lookup',
      'operation:v1:currency_exchange',
      'operation:v1:timezone_converter',
    ])
    expect(result.items[0]?.title).toBe(TOOL_CRYPTO_TX.listing.label)
  })

  it('places the timezone converter first for a London-to-Sydney query', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(misorderedSearchResult(TIMEZONE_QUERY))
    vi.spyOn(decisionEngine, 'executeDecisionGateway').mockResolvedValue({
      tier: 'jev_system_one',
      model: '~typesafe/jev-latest',
      answers: jevAnswersForTool('operation:v1:timezone_converter', [0.95, 0.05, 0.04]) as never,
      usage: { inputTokens: 140, outputTokens: 0, estimatedCostAud: 'A$0.000006' },
      durationMs: 41,
      attemptedTiers: ['jev_system_one'],
    })

    const result = await runSearch(TIMEZONE_QUERY)

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.items[0]?.toolRef).toBe('operation:v1:timezone_converter')
    expect(result.items[0]?.title).toBe(TOOL_TIMEZONE.listing.label)
  })

  it('keeps search successful when Jev and the secondary LLM both return 500', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(misorderedSearchResult(ERC20_QUERY))
    stubJevFetch(vi.fn(async (url: string | URL) => {
      const href = url.toString()
      if (href.includes('/decisions') || href.includes('/v1/systemone') || href.includes('/api/v1/chat/completions')) {
        return new Response('Internal Server Error', { status: 500 })
      }
      throw new Error(`Unexpected url: ${href}`)
    }) as unknown as typeof fetch)

    const previousKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-not-a-live-credential'
    try {
      const result = await runSearch(ERC20_QUERY)
      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') return
      expect(result.items).toHaveLength(3)
      expect(result.items.map((item) => item.toolRef)).toEqual(expect.arrayContaining([
        TOOL_CRYPTO_TX.toolRef,
        TOOL_TIMEZONE.toolRef,
        TOOL_CURRENCY.toolRef,
      ]))
    } finally {
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = previousKey
    }
  })

  it('keeps search successful when Jev times out with 504', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(misorderedSearchResult(TIMEZONE_QUERY))
    stubJevFetch(vi.fn(async () => new Response('Gateway Timeout', { status: 504 })) as unknown as typeof fetch)

    const previousKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-not-a-live-credential'
    try {
      await expect(runSearch(TIMEZONE_QUERY)).resolves.toMatchObject({
        kind: 'ok',
        query: TIMEZONE_QUERY,
        count: 3,
      })
    } finally {
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = previousKey
    }
  })

  it('re-ranks through a mocked Jev fetch without calling the live network', async () => {
    vi.mocked(readCapabilityToolSearch).mockResolvedValue(misorderedSearchResult(ERC20_QUERY))
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString()
      if (href.includes('/decisions') || href.includes('/v1/systemone')) {
        return jevSystemOneResponse(jevAnswersForTool('operation:v1:crypto_tx_lookup', [0.06, 0.91, 0.14]))
      }
      throw new Error(`Unexpected url: ${href}`)
    })
    stubJevFetch(fetchImpl as unknown as typeof fetch)

    const previousKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-not-a-live-credential'
    try {
      const result = await runSearch(ERC20_QUERY)
      expect(fetchImpl).toHaveBeenCalled()
      expect(result.kind).toBe('ok')
      if (result.kind !== 'ok') return
      expect(result.items[0]?.toolRef).toBe('operation:v1:crypto_tx_lookup')
    } finally {
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = previousKey
    }
  })
})
