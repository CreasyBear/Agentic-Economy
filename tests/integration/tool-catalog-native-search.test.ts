import { describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { capabilityToolId, createPublicToolRef } from '@/modules/capability-supply/public'
import { convexModules } from '../helpers/convex-fixtures'
import { admitDiscoveredToolFixture } from '../helpers/discovered-tool-fixture'

const sdk = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', async (original) => ({ ...await original<typeof import('@coinbase/cdp-sdk')>(), listX402DiscoveryResources: sdk.list, searchX402Resources: sdk.search }))

const referenceRate = vi.hoisted(() => vi.fn(async () => ({ source: 'coinbase' as const, base: 'USDC' as const, quote: 'AUD' as const, rate: '1.5', fetchedAt: Date.now() })))
vi.mock('@/modules/money/reference-rate', () => ({ fetchCoinbaseReferenceRate: referenceRate }))

describe('native admitted Tool catalogue', () => {
  it('rejects sensitive queries before native reads or external disclosure', async () => {
    const backend = convexTest(schema, convexModules)
    const query = 'background check SSN 123-45-6789 victim@example.com'
    sdk.search.mockClear()
    for (const source of ['current', 'coinbase'] as const) {
      const result = await backend.action(api.capabilityToolCatalog.search, { source, query })
      expect(result).toMatchObject({ kind: 'unavailable', reason: 'query_invalid' })
      expect(JSON.stringify(result)).not.toContain('victim@example.com')
    }
    expect(await backend.query(api.capabilitySupplyTools.search, { query })).toMatchObject({ kind: 'unavailable', reason: 'query_invalid' })
    expect(sdk.search).not.toHaveBeenCalled()
  })

  it('honours AE network and normalized location filters across catalogue sources', async () => {
    const backend = convexTest(schema, convexModules)
    const fixture = await admitDiscoveredToolFixture(backend)
    const detail = await backend.query(api.capabilitySupplyTools.detail, { toolRef: fixture.toolRef })
    if (detail.kind !== 'found') throw new Error('fixture_missing')
    sdk.list.mockResolvedValue({ items: [fixture.paymentRequired], pagination: { offset: 0, total: 1 } })
    for (const source of ['current', 'coinbase'] as const) {
      const excluded = await backend.action(api.capabilityToolCatalog.search, { source, query: '', filters: { networkId: 'missing-network' } })
      expect(excluded.kind === 'no_candidates' || (excluded.kind === 'ok' && excluded.items.length === 0)).toBe(true)
      for (const location of [detail.tool.business.name.toLowerCase(), ` ${detail.tool.business.name.toUpperCase()} `]) {
        const result = await backend.action(api.capabilityToolCatalog.search, { source, query: '', filters: { location, networkId: 'ae:public' } })
        expect(result.kind).toBe('ok')
        if (result.kind !== 'ok') throw new Error('expected_filtered_tools')
        expect(result.items.map((tool) => tool.toolRef)).toEqual([fixture.toolRef])
      }
    }
  })

  it('uses one rate per response and the same AUD estimate in search, detail and comparison', async () => {
    const backend = convexTest(schema, convexModules)
    const fixture = await admitDiscoveredToolFixture(backend)
    referenceRate.mockClear()
    const search = await backend.action(api.capabilityToolCatalog.search, { source: 'current', query: 'timezone', limit: 20 })
    const detail = await backend.action(api.capabilityToolCatalog.detail, { toolRef: fixture.toolRef })
    const compare = await backend.action(api.capabilityToolCatalog.compare, { toolRefs: [fixture.toolRef] })
    expect(referenceRate).toHaveBeenCalledTimes(3)
    if (search.kind !== 'ok' || detail.kind !== 'found' || compare.kind !== 'ok') throw new Error('expected public Tool results')
    for (const tool of [search.items[0], detail.tool, compare.tools[0]]) {
      expect(tool?.commercial.displayPrice).toMatchObject({ kind: 'indicative', amount: { currency: 'AUD', units: '1500', exponent: 6 } })
      expect(tool?.availability.reason).toBe('inspection_required')
    }
  })

  it('traverses more than 256 publications using native text and browse continuations', async () => {
    const backend = convexTest(schema, convexModules)
    await admitDiscoveredToolFixture(backend, { withoutExample: true })
    await backend.run(async (ctx) => {
      const original = await ctx.db.query('capabilityPublications').unique()
      if (original === null) throw new Error('fixture_missing')
      const { _id, _creationTime, ...row } = original
      for (let index = 1; index < 257; index += 1) {
        const publicationRef = `${row.publicationRef}:${index}`
        await ctx.db.insert('capabilityPublications', { ...row, publicationRef, toolRef: createPublicToolRef({ operationId: capabilityToolId(row.capabilityId), publicationRef, publicationRevision: row.revision, contractRef: { capabilityId: row.capabilityId, version: row.version, contractDigest: row.contractDigest } }) })
      }
    })
    for (const query of ['', 'timezone']) {
      const refs = new Set<string>()
      let cursor: string | undefined
      do {
        const result = await backend.query(api.capabilitySupplyTools.search, { query, limit: 40, ...(cursor === undefined ? {} : { cursor }) })
        expect(result.kind).toBe('ok')
        if (result.kind !== 'ok') throw new Error('catalog_unavailable')
        expect(result.matchedCount).toBeUndefined()
        for (const item of result.items) refs.add(item.toolRef)
        cursor = result.pagination.nextCursor
      } while (cursor !== undefined)
      expect(refs.size).toBe(257)
    }
  })

  it('preserves continuation through an empty filtered page', async () => {
    const backend = convexTest(schema, convexModules)
    const admitted = await admitDiscoveredToolFixture(backend)
    await backend.run(async (ctx) => {
      const original = await ctx.db.query('capabilityPublications').unique()
      if (original === null) throw new Error('fixture_missing')
      const { _id, _creationTime, ...row } = original
      await ctx.db.insert('capabilityPublications', { ...row, toolRef: `${admitted.toolRef}-invalid`, publicationRef: `${row.publicationRef}-invalid` })
    })
    const page = await backend.query(api.capabilitySupplyTools.search, { query: '', limit: 1, filters: { location: 'no such provider' } })
    expect(page).toMatchObject({ kind: 'ok', items: [], pagination: { hasMore: true, nextCursor: expect.any(String) } })
  })
})
