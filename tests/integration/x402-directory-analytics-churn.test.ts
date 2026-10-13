import { afterEach, describe, expect, it, vi } from 'vitest'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { analyticsNamespace, writeAnalytics } from '../../convex/lib/market/directoryIndex/analytics'
import { directoryFacets } from '../../convex/lib/market/directoryIndex/facets'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'

const NOW = 1_800_000_000_000
const GENERATION = 'directory-test'
const RESOURCE = 'https://provider.test/tool'
const ENTRY: X402DirectoryEntry = {
  resource: RESOURCE, title: 'Research', description: 'Research tool', protocol: 'http',
  provider: 'provider.test', metadataJson: '{}', prices: [],
  activity: { calls30d: 3, payers30d: 2, lastCalledAt: new Date(NOW).toISOString() },
}

afterEach(() => vi.restoreAllMocks())

describe('directory analytics reconciliation', () => {
  it('keeps healthy memberships without aggregate writes', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async ctx => writeAnalytics(ctx, GENERATION, RESOURCE, ENTRY, undefined, NOW))
    const result = await backend.run(async ctx => {
      const mutations = vi.spyOn(ctx, 'runMutation')
      await writeAnalytics(ctx, GENERATION, RESOURCE, ENTRY, ENTRY, NOW)
      const page = await directoryFacets.paginate(ctx, { namespace: analyticsNamespace(GENERATION) })
      return { writes: mutations.mock.calls.length, keys: page.page.map(item => item.key) }
    })
    expect(result.keys).toEqual([
      ['adoption', '2_4'], ['depth', 'broad'], ['price_band:*', 'unknown'], ['recency', 'fresh'],
    ])
    expect(result.writes).toBe(0)
  })

  it('changes only the changed band and converges when the original request repeats', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async ctx => writeAnalytics(ctx, GENERATION, RESOURCE, ENTRY, undefined, NOW))
    const next = { ...ENTRY, activity: { calls30d: 6, payers30d: 5, lastCalledAt: new Date(NOW).toISOString() } }
    const apply = () => backend.run(async ctx => {
      const mutations = vi.spyOn(ctx, 'runMutation')
      await writeAnalytics(ctx, GENERATION, RESOURCE, next, ENTRY, NOW)
      const page = await directoryFacets.paginate(ctx, { namespace: analyticsNamespace(GENERATION) })
      return { writes: mutations.mock.calls.length, keys: page.page.map(item => item.key) }
    })
    expect(await apply()).toEqual({ writes: 2, keys: [
      ['adoption', '5_9'], ['depth', 'broad'], ['price_band:*', 'unknown'], ['recency', 'fresh'],
    ] })
    expect(await apply()).toEqual({ writes: 0, keys: [
      ['adoption', '5_9'], ['depth', 'broad'], ['price_band:*', 'unknown'], ['recency', 'fresh'],
    ] })
  })

  it('repairs a missing membership without borrowing another resource or namespace', async () => {
    const backend = convexTestWithMarketComponents()
    const other = { ...ENTRY, resource: `${RESOURCE}/other` }
    await backend.run(async ctx => {
      await writeAnalytics(ctx, GENERATION, RESOURCE, ENTRY, undefined, NOW)
      await writeAnalytics(ctx, GENERATION, other.resource, other, undefined, NOW)
      await writeAnalytics(ctx, 'other-generation', RESOURCE, ENTRY, undefined, NOW)
      await directoryFacets.delete(ctx, { namespace: analyticsNamespace(GENERATION), key: ['adoption', '2_4'], id: RESOURCE })
    })
    const result = await backend.run(async ctx => {
      const mutations = vi.spyOn(ctx, 'runMutation')
      await writeAnalytics(ctx, GENERATION, RESOURCE, ENTRY, ENTRY, NOW)
      const page = await directoryFacets.paginate(ctx, { namespace: analyticsNamespace(GENERATION) })
      const foreign = await directoryFacets.paginate(ctx, { namespace: analyticsNamespace('other-generation') })
      return { writes: mutations.mock.calls.length, current: page.page.map(({ key, id }) => ({ key, id })), foreign: foreign.page.map(({ key, id }) => ({ key, id })) }
    })
    expect(result.writes).toBe(1)
    expect(result.current).toEqual([
      { key: ['adoption', '2_4'], id: RESOURCE }, { key: ['adoption', '2_4'], id: other.resource },
      { key: ['depth', 'broad'], id: RESOURCE }, { key: ['depth', 'broad'], id: other.resource },
      { key: ['price_band:*', 'unknown'], id: RESOURCE }, { key: ['price_band:*', 'unknown'], id: other.resource },
      { key: ['recency', 'fresh'], id: RESOURCE }, { key: ['recency', 'fresh'], id: other.resource },
    ])
    expect(result.foreign).toEqual([
      { key: ['adoption', '2_4'], id: RESOURCE }, { key: ['depth', 'broad'], id: RESOURCE },
      { key: ['price_band:*', 'unknown'], id: RESOURCE }, { key: ['recency', 'fresh'], id: RESOURCE },
    ])
  })

  it('repairs aged and duplicate recency bands without a stored previous band', async () => {
    const backend = convexTestWithMarketComponents()
    const earlier = NOW - 8 * 86_400_000
    const aged = { ...ENTRY, activity: { ...ENTRY.activity, lastCalledAt: new Date(earlier).toISOString() } }
    await backend.run(async ctx => {
      await writeAnalytics(ctx, GENERATION, RESOURCE, aged, undefined, earlier)
      for (const band of ['unknown', 'stale']) await directoryFacets.insert(ctx, { namespace: analyticsNamespace(GENERATION), key: ['recency', band], id: RESOURCE })
    })
    const result = await backend.run(async ctx => {
      const mutations = vi.spyOn(ctx, 'runMutation')
      await writeAnalytics(ctx, GENERATION, RESOURCE, aged, aged, NOW)
      const page = await directoryFacets.paginate(ctx, { namespace: analyticsNamespace(GENERATION) })
      return { writes: mutations.mock.calls.length, keys: page.page.map(item => item.key) }
    })
    expect(result).toEqual({ writes: 4, keys: [
      ['adoption', '2_4'], ['depth', 'broad'], ['price_band:*', 'unknown'], ['recency', 'recent'],
    ] })
  })

  it('rebuilds an empty backfill namespace and repairs missing labels on a healthy replay', async () => {
    const backend = convexTestWithMarketComponents()
    const tagged = { ...ENTRY, tags: ['alpha'], bundleSlugs: ['starter'] }
    await backend.run(async ctx => writeAnalytics(ctx, GENERATION, RESOURCE, tagged, tagged, NOW))
    await backend.run(async ctx => {
      for (const label of await ctx.db.query('marketDirectoryFacets').collect()) await ctx.db.delete(label._id)
    })
    const result = await backend.run(async ctx => {
      const mutations = vi.spyOn(ctx, 'runMutation')
      await writeAnalytics(ctx, GENERATION, RESOURCE, tagged, tagged, NOW)
      const page = await directoryFacets.paginate(ctx, { namespace: analyticsNamespace(GENERATION) })
      const labels = await ctx.db.query('marketDirectoryFacets').collect()
      return { writes: mutations.mock.calls.length, keys: page.page.map(item => item.key), labels: labels.map(({ kind, key, label }) => ({ kind, key, label })).sort((a, b) => a.kind.localeCompare(b.kind)) }
    })
    expect(result).toEqual({ writes: 0, keys: [
      ['adoption', '2_4'], ['bundle', 'starter'], ['depth', 'broad'], ['price_band:*', 'unknown'], ['recency', 'fresh'], ['tag', 'alpha'],
    ], labels: [
      { kind: 'bundle', key: 'starter', label: 'starter' }, { kind: 'tag', key: 'alpha', label: 'alpha' },
    ] })
  })

  it('rolls back app and aggregate changes when a component call fails', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async ctx => writeAnalytics(ctx, GENERATION, RESOURCE, ENTRY, undefined, NOW))
    await expect(backend.run(async ctx => {
      await ctx.db.insert('marketDirectoryFacets', { generation: GENERATION, kind: 'tag', key: 'uncommitted', label: 'Uncommitted' })
      const runMutation = ctx.runMutation
      vi.spyOn(ctx, 'runMutation').mockImplementation(async (reference, args = {}, options = {}) => {
        await runMutation(reference, args, options)
        throw new Error('component_test_unavailable')
      })
      await writeAnalytics(ctx, GENERATION, RESOURCE, { ...ENTRY, tags: ['alpha'] }, ENTRY, NOW)
    })).rejects.toThrow('component_test_unavailable')
    const result = await backend.run(async ctx => {
      const page = await directoryFacets.paginate(ctx, { namespace: analyticsNamespace(GENERATION) })
      return { keys: page.page.map(item => item.key), labels: await ctx.db.query('marketDirectoryFacets').collect() }
    })
    expect(result).toEqual({ keys: [
      ['adoption', '2_4'], ['depth', 'broad'], ['price_band:*', 'unknown'], ['recency', 'fresh'],
    ], labels: [] })
  })

  it('handles a five-item batch with maximum projected labels and long resource IDs', async () => {
    const backend = convexTestWithMarketComponents()
    const resources = Array.from({ length: 5 }, (_, index) => `${RESOURCE}/${'x'.repeat(8192 - RESOURCE.length - 2)}${index}`)
    const wide: X402DirectoryEntry = {
      ...ENTRY, tags: Array.from({ length: 20 }, (_, index) => index === 0 ? '1' : `tag-${index}`),
      bundleSlugs: Array.from({ length: 20 }, (_, index) => `bundle-${index}`), curated: true,
      input: { fields: [{ name: 'query', path: 'query', location: 'body', source: 'schema', type: 'string', required: true }], schemaJson: '{}' },
      output: { fields: [{ name: 'result', path: 'result', location: 'output', source: 'schema', type: 'string', required: true }], schemaJson: '{}', exampleJson: '{"ok":true}' },
      prices: [{ network: 'base', scheme: 'exact', amount: '1000000', decimalAmount: '1', symbol: 'USDC' }],
    }
    await backend.run(async ctx => {
      for (const resource of resources) await writeAnalytics(ctx, GENERATION, resource, { ...wide, resource }, undefined, NOW)
    })
    const result = await backend.run(async ctx => {
      const mutations = vi.spyOn(ctx, 'runMutation')
      const queries = vi.spyOn(ctx, 'runQuery')
      for (const resource of resources) {
        const current = { ...wide, resource }
        await writeAnalytics(ctx, GENERATION, resource, current, current, NOW)
      }
      const work = { writes: mutations.mock.calls.length, queries: queries.mock.calls.length }
      const namespace = analyticsNamespace(GENERATION)
      return { ...work,
        price: await directoryFacets.count(ctx, { namespace, bounds: { eq: ['price:*', 1] } }),
        tag: await directoryFacets.count(ctx, { namespace, bounds: { eq: ['tag', '1'] } }),
      }
    })
    expect(result).toEqual({ writes: 0, queries: 5, price: 5, tag: 5 })
    const replaced = { ...wide, tags: Array.from({ length: 20 }, (_, index) => `new-tag-${index}`), bundleSlugs: Array.from({ length: 20 }, (_, index) => `new-bundle-${index}`) }
    const changed = await backend.run(async ctx => {
      const mutations = vi.spyOn(ctx, 'runMutation')
      for (const resource of resources) await writeAnalytics(ctx, GENERATION, resource, { ...replaced, resource }, { ...wide, resource }, NOW)
      const writes = mutations.mock.calls.length
      const namespace = analyticsNamespace(GENERATION)
      return { writes,
        oldTag: await directoryFacets.count(ctx, { namespace, bounds: { eq: ['tag', '1'] } }),
        newTag: await directoryFacets.count(ctx, { namespace, bounds: { eq: ['tag', 'new-tag-0'] } }),
        price: await directoryFacets.count(ctx, { namespace, bounds: { eq: ['price:*', 1] } }),
        total: await directoryFacets.count(ctx, { namespace }),
      }
    })
    expect(changed).toEqual({ writes: 400, oldTag: 0, newTag: 5, price: 5, total: 255 })
  })
})
