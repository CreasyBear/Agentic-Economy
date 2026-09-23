import { afterEach, describe, expect, it, vi } from 'vitest'
import type { X402DirectoryEntry, X402DirectoryPage } from '@/modules/market/x402-directory'
import { rerankX402DirectoryPage } from '@/modules/market/x402-directory-reranker'
import { mockJevFetch } from '../../helpers/tool-search-rerank-fixtures'

const entries: readonly X402DirectoryEntry[] = [
  {
    resource: 'https://example.com/weather', title: 'Weather', description: 'Current local forecasts',
    protocol: 'http', provider: 'example.com', method: 'GET', prices: [], metadataJson: '{"unneeded":"do not send"}',
  },
  {
    resource: 'https://example.com/image', title: 'Image cleanup', description: 'Remove backgrounds from product photos',
    protocol: 'http', provider: 'example.com', method: 'POST', prices: [], metadataJson: '{}',
    input: { fields: [{ name: 'imageUrl', path: 'imageUrl', location: 'body', source: 'schema', description: 'Image to edit', exampleJson: 'private-example' }] },
    outputSummary: 'A transparent PNG',
  },
]
const page: Extract<X402DirectoryPage, { kind: 'ok' }> = {
  kind: 'ok', items: entries, offset: 24, limit: 24, nextOffset: 48,
  partialResults: true, mode: 'search', appliedFilters: { network: 'base', maxUsdPrice: 0.1 },
}
const options = { openrouterApiKey: 'test-key' }
const answers = (a: number, b: number) => ({ match_0: { type: 'noul', noul: a }, match_1: { type: 'noul', noul: b } })

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Bazaar search semantic ordering', () => {
  it('ranks supplied entries and preserves their facts and pagination', async () => {
    const fetchImpl = mockJevFetch(answers(0.05, 0.95))
    const result = await rerankX402DirectoryPage(page, 'make product photos transparent', { ...options, fetchImpl })
    expect(result).toEqual({ ...page, items: [entries[1], entries[0]] })
    if (result.kind !== 'ok') throw new Error('expected page')
    expect(result.items[0]).toBe(entries[1])
    expect(page.items).toEqual(entries)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body))
    expect(body.state.query).toBe('make product photos transparent')
    expect(body.state.candidates[1]).toMatchObject({ title: 'Image cleanup', description: entries[1]?.description, outputSummary: 'A transparent PNG' })
    expect(body.questions.match_1.instructions).toContain('candidates[1]')
    expect(body.questions.best_match).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('private-example')
    expect(JSON.stringify(body)).not.toContain('do not send')
    expect(JSON.stringify(body)).not.toContain('https://example.com')
  })

  it('does no inference for browsing, empty/single pages, unavailable source or disabled Jev', async () => {
    const fetchImpl = mockJevFetch(answers(0.1, 0.9))
    const configured = { ...options, fetchImpl }
    for (const query of [undefined, '', '  ']) {
      await expect(rerankX402DirectoryPage(page, query, configured)).resolves.toBe(page)
    }
    for (const items of [[], [entries[0]!]]) {
      const small = { ...page, items }
      await expect(rerankX402DirectoryPage(small, 'image', configured)).resolves.toBe(small)
    }
    const unavailable = { kind: 'unavailable', reason: 'source_unavailable' } as const
    await expect(rerankX402DirectoryPage(unavailable, 'image', configured)).resolves.toBe(unavailable)
    await expect(rerankX402DirectoryPage(page, 'image', { ...configured, disableJev: true })).resolves.toBe(page)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps search available without credentials and rejects oversized work without truncating the page', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const fetchImpl = mockJevFetch(answers(0.1, 0.9))
    await expect(rerankX402DirectoryPage(page, 'image', { fetchImpl })).resolves.toBe(page)
    const large = { ...page, items: Array.from({ length: 25 }, () => entries[0]!) }
    await expect(rerankX402DirectoryPage(large, 'image', { ...options, fetchImpl })).resolves.toBe(large)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('preserves upstream order on ties and when every candidate has zero fit', async () => {
    for (const value of [0, 0.5, 1]) {
      const result = await rerankX402DirectoryPage(page, 'image', { ...options, fetchImpl: mockJevFetch(answers(value, value)) })
      expect(result).toEqual(page)
    }
  })

  it.each([
    { match_0: { type: 'noul', noul: 0.1 } },
    answers(-0.1, 0.9),
    answers(0.1, 1.1),
    { match_0: { type: 'noul', noul: null }, match_1: { type: 'noul', noul: 0.9 } },
    { match_0: { type: 'choice', choice: 'other' }, match_1: { type: 'noul', noul: 0.9 } },
  ])('keeps the complete original page when answers are invalid: %j', async invalid => {
    await expect(rerankX402DirectoryPage(page, 'image', { ...options, fetchImpl: mockJevFetch(invalid) })).resolves.toBe(page)
  })

  it('makes one attempt only and returns the original page on service failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }))
    await expect(rerankX402DirectoryPage(page, 'image', { ...options, fetchImpl })).resolves.toBe(page)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('aborts slow inference and returns the original page without a retry', async () => {
    let aborted = false
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('Timed out', 'AbortError'))
      }, { once: true })
    }))
    await expect(rerankX402DirectoryPage(page, 'image', { ...options, fetchImpl, timeoutMs: 10 })).resolves.toBe(page)
    expect(aborted).toBe(true)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('keeps schema field descriptions bounded and omits arbitrary examples and metadata', async () => {
    const verbose = { ...page, items: entries.map(entry => ({ ...entry, description: 'x'.repeat(20_000) })) }
    const fetchImpl = mockJevFetch(answers(0.1, 0.9))
    await rerankX402DirectoryPage(verbose, 'image', { ...options, fetchImpl })
    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body))
    expect(body.state.candidates.every((item: { description: string }) => item.description.length <= 1200)).toBe(true)
    expect(JSON.stringify(body.state).length).toBeLessThan(32_000)
  })
  it('preserves the page on pre-cancellation and surfaces invalid configuration', async () => {
    const fetchImpl = mockJevFetch(answers(0.1, 0.9))
    await expect(rerankX402DirectoryPage(page, 'image', { ...options, fetchImpl, signal: AbortSignal.abort() })).resolves.toBe(page)
    await expect(rerankX402DirectoryPage(page, 'image', { ...options, fetchImpl, timeoutMs: -1 })).rejects.toBeInstanceOf(RangeError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

})
