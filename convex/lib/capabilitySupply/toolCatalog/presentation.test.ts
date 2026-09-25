import { afterEach, describe, expect, it, vi } from 'vitest'
import { serializeToolSearchResult } from '@/modules/capability-supply/public'
import { ERC20_QUERY, jevSystemOneResponse, misorderedSearchResult } from '../../../../tests/helpers/tool-search-rerank-fixtures'
import { presentSearch } from './presentation'

describe('tool catalog presentation', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('returns the unchanged wire page without fetching when discovery is disabled', async () => {
    vi.stubEnv('AE_JEV_DISCOVERY_ENABLED', 'false')
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const result = serializeToolSearchResult(misorderedSearchResult(ERC20_QUERY))

    await expect(presentSearch({ result, query: ERC20_QUERY })).resolves.toEqual({ result, use: null, belowMatch: [] })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('aborts a remote attempt within the local deadline without a caller signal', async () => {
    vi.stubEnv('AE_JEV_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const signal = init?.signal
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })
    vi.stubGlobal('fetch', fetcher)
    const result = serializeToolSearchResult(misorderedSearchResult(ERC20_QUERY))
    const startedAt = Date.now()

    await expect(presentSearch({ result, query: ERC20_QUERY })).resolves.toEqual({ result, use: null, belowMatch: [] })
    expect(Date.now() - startedAt).toBeLessThan(2000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('assesses only twenty candidates while retaining the twenty-first and pagination on the wire', async () => {
    vi.stubEnv('AE_JEV_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
    const source = misorderedSearchResult(ERC20_QUERY)
    const items = Array.from({ length: 21 }, (_, index) => ({
      ...source.items[0]!,
      toolRef: `operation:v1:${index.toString(16).padStart(64, '0')}` as typeof source.items[number]['toolRef'],
    }))
    const result = serializeToolSearchResult({
      ...source,
      items,
      pagination: { limit: 21, hasMore: true, nextCursor: 'opaque-next-page' },
    })
    const answers = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`match_${index}`, { type: 'noul', noul: 0 }]))
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => jevSystemOneResponse({
      ...answers,
      use: { type: 'choice', choice: 'chat.clarify', confidence: 0.9, probabilities: { 'chat.clarify': 0.9 } },
    }))
    vi.stubGlobal('fetch', fetcher)

    const presented = await presentSearch({ result, query: ERC20_QUERY })
    expect(presented.use).toBe('chat.clarify')
    expect(presented.result.kind).toBe('ok')
    if (presented.result.kind !== 'ok' || result.kind !== 'ok') throw new Error('expected_search_page')
    expect(presented.result.items).toEqual(result.items)
    expect(presented.result.pagination).toEqual(result.pagination)
    expect(presented.result.ranking.map(({ toolRef }) => toolRef)).toEqual(items.slice(0, 20).map(({ toolRef }) => toolRef))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
