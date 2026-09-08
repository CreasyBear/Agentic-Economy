import { beforeEach, describe, expect, it, vi } from 'vitest'
const { query, upstream } = vi.hoisted(() => ({ query: vi.fn(), upstream: vi.fn() }))
vi.mock('@/lib/server/convex-source', () => ({ sourceQuery: (name: string) => name, callPublicSourceQuery: query }))
vi.mock('@/modules/market/x402-directory.server', () => ({ readX402Directory: upstream }))
import { readX402DirectoryCatalogue, readX402DirectoryCatalogueOverview, readX402DirectoryCatalogueResource } from '@/modules/market/x402-directory-index.server'
import { x402DirectoryCatalogueInputSchema } from '@/modules/market/x402-directory-catalogue'

beforeEach(() => { query.mockReset(); upstream.mockReset() })
describe('indexed catalogue server boundary', () => {
  it('validates source-only inputs and rejects incompatible search sorting', async () => {
    for (const input of [{ provider: 'https://example.com' }, { indexCursor: '' }, { query: 'image', sort: 'popular' }, { directoryCategory: '' }, { indexCursor: 'cursor', offset: 20 }, { executable: 'anything' }]) {
      expect(x402DirectoryCatalogueInputSchema.safeParse(input).success).toBe(false)
    }
    expect(await readX402DirectoryCatalogue({ maxUsdPrice: -1 })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(query).not.toHaveBeenCalled()
  })
  it('preserves native pagination and keeps unfiltered coverage distinct from result counts', async () => {
    const entry = { resource: 'https://example.com/tool', title: 'Tool' }
    const coverage = { indexedTotal: 4000 }
    query.mockResolvedValue({ kind: 'ok', coverage, searchMethod: 'native_index', page: [{ entry }], continueCursor: 'next', isDone: false, pageStatus: 'SplitRecommended', splitCursor: 'split' })
    const result = await readX402DirectoryCatalogue({ directoryCategory: 'CREATIVE', provider: 'EXAMPLE.com', indexCursor: 'previous' })
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { category: 'creative', provider: 'example.com', paginationOpts: { numItems: 24, cursor: 'previous', maximumRowsRead: 512 } })
    expect(result).toMatchObject({ kind: 'ok', source: 'index', coverage, page: { items: [entry] }, indexCursor: 'next', isDone: false, splitCursor: 'split' })
    if (result.kind === 'ok') expect(result.page.total).toBeUndefined()
    expect(upstream).not.toHaveBeenCalled()
  })
  it('falls back only when the index explicitly has no active generation', async () => {
    query.mockResolvedValue({ kind: 'unavailable', reason: 'index_unavailable' })
    upstream.mockResolvedValue({ kind: 'ok', items: [], offset: 20, limit: 20, nextOffset: 40 })
    expect(await readX402DirectoryCatalogue({ offset: 20 })).toMatchObject({ kind: 'ok', source: 'upstream_limited', isDone: false })
    expect(upstream).toHaveBeenCalledWith({ offset: 20 })
    upstream.mockClear()
    for (const input of [{ directoryCategory: 'creative' }, { sort: 'popular' as const }, { indexCursor: 'cursor' }]) {
      expect(await readX402DirectoryCatalogue(input)).toEqual({ kind: 'unavailable', reason: 'index_unavailable' })
    }
    query.mockRejectedValue(new Error('offline'))
    expect(await readX402DirectoryCatalogue({})).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(upstream).not.toHaveBeenCalled()
  })
  it('preserves query failures without SDK fallback and reads an exact resource independently', async () => {
    query.mockResolvedValueOnce({ kind: 'unavailable', reason: 'query_sort_unsupported' })
    expect(await readX402DirectoryCatalogue({})).toEqual({ kind: 'unavailable', reason: 'query_sort_unsupported' })
    query.mockResolvedValueOnce({ kind: 'not_found' })
    expect(await readX402DirectoryCatalogueResource({ resource: 'https://example.com/exact?x=1' })).toEqual({ kind: 'not_found' })
    expect(query).toHaveBeenLastCalledWith('x402DirectoryIndex:resource', { resource: 'https://example.com/exact?x=1' })
    expect(await readX402DirectoryCatalogueResource({ resource: '' })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(upstream).not.toHaveBeenCalled()
  })
  it('passes overview facts through and reports transport failures', async () => {
    const overview = { kind: 'ok', categories: [], providers: [], networks: [], popular: [], recentlyUpdated: [] }
    query.mockResolvedValueOnce(overview).mockRejectedValueOnce(new Error('offline'))
    expect(await readX402DirectoryCatalogueOverview()).toEqual(overview)
    expect(await readX402DirectoryCatalogueOverview()).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
  })
})

describe('complete Provider facet pages', () => {
  it('validates a separate cursor and traverses exact indexed counts without SDK fallback', async () => {
    const { readX402DirectoryProviders } = await import('@/modules/market/x402-directory-index.server')
    const page = { kind: 'ok', page: [{ key: 'example.com', label: 'example.com', count: 142 }], continueCursor: 'next', isDone: false }
    query.mockResolvedValue(page)
    expect(await readX402DirectoryProviders({ providerCursor: 'cursor:+/=' })).toEqual(page)
    expect(query).toHaveBeenCalledWith('x402DirectoryIndex:facets', { kind: 'provider', paginationOpts: { numItems: 24, cursor: 'cursor:+/=' } })
    query.mockClear()
    expect(await readX402DirectoryProviders({ providerCursor: '' })).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(query).not.toHaveBeenCalled()
    query.mockResolvedValue({ kind: 'unavailable', reason: 'index_unavailable' })
    expect(await readX402DirectoryProviders({})).toEqual({ kind: 'unavailable', reason: 'index_unavailable' })
    query.mockRejectedValue(new Error('offline'))
    expect(await readX402DirectoryProviders({})).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    expect(upstream).not.toHaveBeenCalled()
  })
})

it('passes exact explorer bands and metadata filters to the native index and never broadens them through fallback', async () => {
  const filters = { priceBand: '0_01_to_0_03' as const, adoptionBand: '0' as const, tags: ['search', 'a&b'], bundleSlugs: ['image-tools'], hasInputSchema: false, hasOutputExample: true, minUsdPrice: 0, maxUsdPrice: 0.03, minPayers30d: 0, maxPayers30d: 4 };
  query.mockResolvedValue({ kind: 'unavailable', reason: 'index_unavailable' });
  expect(await readX402DirectoryCatalogue(filters)).toEqual({ kind: 'unavailable', reason: 'index_unavailable' });
  expect(query).toHaveBeenCalledWith('x402DirectoryIndex:browse', { ...filters, paginationOpts: { numItems: 24, cursor: null, maximumRowsRead: 512 } });
  expect(upstream).not.toHaveBeenCalled();
  query.mockClear();
  for (const input of [{ minUsdPrice: 0.03, maxUsdPrice: 0.01 }, { minPayers30d: 5, maxPayers30d: 4 }]) {
    expect(await readX402DirectoryCatalogue(input)).toEqual({ kind: 'unavailable', reason: 'query_invalid' });
  }
  expect(query).not.toHaveBeenCalled();
});
