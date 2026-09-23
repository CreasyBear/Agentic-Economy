import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', async (original) => ({ ...await original<typeof import('@coinbase/cdp-sdk')>(), listX402DiscoveryResources: sdk.list, searchX402Resources: sdk.search }))
import { fetchCatalogPage, rerank, search } from '../../../convex/capabilityToolCatalog'

import { serializeToolSearchResult, type ToolSearchWireResult } from '@/modules/capability-supply/public'
import { ERC20_QUERY, jevSystemOneResponse, misorderedSearchResult } from '../../helpers/tool-search-rerank-fixtures'
import { timezonePaymentRequired20260819Fixture } from '@/modules/capability-supply/public'

const rerankHandler = (rerank as unknown as { _handler: (ctx: unknown, args: { result: ToolSearchWireResult; query: string }) => Promise<ToolSearchWireResult> })._handler
const searchHandler = (search as unknown as { _handler: (ctx: unknown, args: { source: 'coinbase'; query: string }) => Promise<ToolSearchWireResult> })._handler

describe('SDK-backed catalogue discovery', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('returns the original wire page without inference when discovery is disabled', async () => {
    vi.stubEnv('AE_JEV_DISCOVERY_ENABLED', 'false')
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const result = serializeToolSearchResult(misorderedSearchResult(ERC20_QUERY))
    await expect(rerankHandler(null, { result, query: ERC20_QUERY })).resolves.toEqual(result)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('bounds a remote Node inference attempt even without a caller signal', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
    let signal: AbortSignal | null | undefined
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      signal = init?.signal
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }))
    })
    vi.stubGlobal('fetch', fetcher)
    const result = serializeToolSearchResult(misorderedSearchResult(ERC20_QUERY))
    const startedAt = Date.now()
    await expect(rerankHandler(null, { result, query: ERC20_QUERY })).resolves.toEqual(result)
    expect(Date.now() - startedAt).toBeLessThan(2000)
    expect(signal?.aborted).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps the twenty-first Tool unassessed across the Node wire boundary', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
    const source = misorderedSearchResult(ERC20_QUERY)
    const items = Array.from({ length: 21 }, (_, index) => ({
      ...source.items[0]!, toolRef: `operation:v1:${index.toString(16).padStart(64, '0')}` as typeof source.items[number]['toolRef'],
    }))
    const answers = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`match_${index}`, { type: 'noul', noul: 0 }]))
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jevSystemOneResponse(answers))
    vi.stubGlobal('fetch', fetcher)
    const result = serializeToolSearchResult({ ...source, items, pagination: { limit: 21, hasMore: true, nextCursor: 'opaque-next-page' } })
    const reranked = await rerankHandler(null, { result, query: ERC20_QUERY })
    expect(reranked.kind).toBe('ok')
    if (reranked.kind !== 'ok' || result.kind !== 'ok') throw new Error('expected_search_page')
    expect(reranked.items).toEqual(result.items)
    expect(reranked.pagination).toEqual(result.pagination)
    expect(reranked.ranking).toHaveLength(20)
    expect(reranked.ranking.every(entry => entry.score === 0)).toBe(true)
    expect(reranked.ranking.some(entry => entry.toolRef === items[20]!.toolRef)).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reads source results from the ingested snapshot without a reconciliation mutation', async () => {
    sdk.list.mockResolvedValue({
      items: [structuredClone(timezonePaymentRequired20260819Fixture.paymentRequired)],
      pagination: { offset: 0, total: 1 },
    })
    const runMutation = vi.fn().mockResolvedValue({ toolRefs: [] })
    const runQuery = vi.fn(async (reference: unknown) => {
      if (getFunctionName(reference as never) === 'capabilityToolCatalogData:sourceSnapshot') {
        return { toolRefs: [], incomplete: true }
      }
      return { name: 'refresh facilitator discovery' }
    })
    const result = await searchHandler({ runQuery, runMutation }, { source: 'coinbase', query: '' })
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      candidates: [expect.objectContaining({ sourceRouteRef: expect.any(String) })],
    })
    expect(runMutation).not.toHaveBeenCalled()
    expect(result).toMatchObject({ kind: 'ok', items: [], partialResults: true })
  })

  it('uses Coinbase search and preserves its truncation without inventing a continuation', async () => {
    sdk.search.mockResolvedValue({ resources: [{ resource: 'https://provider.test/tool' }], partialResults: true, x402Version: 2 })
    const page = await fetchCatalogPage({ source: 'coinbase', query: 'weather', limit: 100 })
    expect(sdk.search).toHaveBeenCalledWith({ query: 'weather', limit: 20, scheme: 'exact' })
    expect(page).toEqual({ items: [{ resource: 'https://provider.test/tool' }], partialResults: true, limit: 20 })
    expect(sdk.list).not.toHaveBeenCalled()
  })

  it('continues native browsing beyond the old four-page maximum', async () => {
    sdk.list.mockResolvedValue({ items: Array.from({ length: 20 }, (_, i) => ({ resource: `https://provider.test/${i}` })), pagination: { limit: 20, offset: 400, total: 450 } })
    const page = await fetchCatalogPage({ source: 'coinbase', query: '', cursor: '400' })
    expect(sdk.list).toHaveBeenCalledWith({ type: 'http', limit: 20, offset: 400 })
    expect(page.nextCursor).toBe('420')
  })

  it('rejects malformed offsets and search pagination', async () => {
    await expect(fetchCatalogPage({ source: 'coinbase', query: '', cursor: '1e2' })).rejects.toThrow('catalog_cursor_invalid')
    await expect(fetchCatalogPage({ source: 'coinbase', query: 'weather', cursor: '20' })).rejects.toThrow('catalog_search_has_no_cursor')
    expect(sdk.list).not.toHaveBeenCalled()
  })

  it('preserves small-page positions across native Coinbase page boundaries', async () => {
    sdk.list.mockImplementation(async ({ offset }: { offset: number }) => ({
      items: Array.from({ length: 20 }, (_, i) => ({ resource: `https://provider.test/${offset + i}` })),
      pagination: { limit: 20, offset, total: 40 },
    }))
    for (const cursor of ['1', '19', '20']) {
      const page = await fetchCatalogPage({ source: 'coinbase', query: '', cursor, limit: 1 })
      expect(page.items).toEqual([{ resource: `https://provider.test/${cursor}` }])
      expect(page.nextCursor).toBe(String(Number(cursor) + 1))
    }
    expect(sdk.list).toHaveBeenNthCalledWith(1, { type: 'http', limit: 20, offset: 0 })
    expect(sdk.list).toHaveBeenNthCalledWith(3, { type: 'http', limit: 20, offset: 20 })
    const crossing = await fetchCatalogPage({ source: 'coinbase', query: '', cursor: '12', limit: 12 })
    expect(crossing.items).toHaveLength(8)
    expect(crossing.nextCursor).toBe('20')
  })

  it('keeps upstream failures distinct from empty results', async () => {
    sdk.list.mockRejectedValue(new Error('upstream unavailable'))
    await expect(fetchCatalogPage({ source: 'coinbase', query: '' })).rejects.toThrow('upstream unavailable')
    sdk.list.mockResolvedValue({ items: [], pagination: { offset: 0, total: 0 } })
    await expect(fetchCatalogPage({ source: 'coinbase', query: '' })).resolves.toEqual({ items: [], limit: 20 })
  })

  it('uses PayAI documented pagination and refuses semantic-search emulation', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ resource: 'https://provider.test/tool' }], pagination: { total: 51 } }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(fetchCatalogPage({ source: 'payai', query: '', cursor: '40' })).resolves.toMatchObject({ nextCursor: '41' })
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://facilitator.payai.network/discovery/resources?limit=20&offset=40')
    await expect(fetchCatalogPage({ source: 'payai', query: 'weather' })).rejects.toThrow('payai_browse_only')
  })
})
