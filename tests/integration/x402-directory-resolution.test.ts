import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { prepareIndexedDirectorySource } from '../../convex/x402DirectoryIndexSource'
import { convexModules, convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import fixture from '@/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json'

const sdk = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', () => ({ listX402DiscoveryResources: sdk.list, searchX402Resources: sdk.search }))
const payment = fixture.paymentRequired
const item = { ...payment, resource: payment.resource.url, description: payment.resource.description, serviceName: payment.resource.serviceName, type: 'http' }

describe('selected directory resource resolution', () => {
  beforeEach(() => vi.clearAllMocks())

  it('materializes only the exact selected resource using fresh SDK metadata', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    sdk.list.mockResolvedValue({ items: [item, { resource: 'https://other.test/tool', type: 'mcp' }], pagination: { offset: 0, limit: 20, total: 2 } })
    const result = await backend.action(api.x402Directory.resolve, { resource: item.resource })
    expect(result).toMatchObject({ kind: 'ready', toolRef: expect.any(String) })
    expect(sdk.list).toHaveBeenCalledExactlyOnceWith({ limit: 20, offset: 0 })
    const rows = await backend.run((ctx) => ctx.db.query('capabilityPublications').collect())
    expect(rows).toHaveLength(1)
  })

  it('resolves the exact completed-index snapshot independently of upstream search rank or page', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
    const generation = 'coinbase-selected-resource'
    await backend.run(async ctx => {
      await ctx.db.insert('marketExternalRegistryGenerations', { generation, source: 'coinbase', status: 'refreshing', startedAt: 1, ingestedCount: 0, nextOffset: 0 })
      await ctx.db.insert('marketExternalRegistryState', { key: 'coinbase', refreshGeneration: generation, lastAttemptAt: 1, lastAttemptStatus: 'refreshing' })
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, workload, items: [prepareIndexedDirectorySource(item)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 3, workload, items: [] })
    const result = await backend.action(api.x402Directory.resolve, { resource: item.resource, query: 'unrelated search', offset: 10000 })
    expect(result).toMatchObject({ kind: 'ready', toolRef: expect.any(String) })
    expect(sdk.list).not.toHaveBeenCalled()
    expect(sdk.search).not.toHaveBeenCalled()
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toHaveLength(1)
  })

  it('refuses a resource not present on the reread page without fetching its URL', async () => {
    const backend = convexTest(schema, convexModules)
    sdk.search.mockResolvedValue({ resources: [item], partialResults: false })
    const result = await backend.action(api.x402Directory.resolve, { resource: 'http://127.0.0.1/private', query: 'timezone' })
    expect(result).toEqual({ kind: 'unavailable', reason: 'resource_not_found' })
    expect(sdk.search).toHaveBeenCalledExactlyOnceWith({ query: 'timezone', limit: 20 })
    expect(await backend.run((ctx) => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

  it('returns selected-resource admission refusal without requiring workload state', async () => {
    const backend = convexTest(schema, convexModules)
    sdk.list.mockResolvedValue({ items: [{ resource: 'https://provider.test/tool', type: 'mcp', x402Version: 2 }], pagination: { offset: 0, limit: 20, total: 1 } })
    const result = await backend.action(api.x402Directory.resolve, { resource: 'https://provider.test/tool' })
    expect(result.kind).toBe('unavailable')
    expect(await backend.run((ctx) => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

  it('repeats the exact filtered SDK search when resolving the selected resource', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    sdk.search.mockResolvedValue({ resources: [item], partialResults: true })
    const result = await backend.action(api.x402Directory.resolve, { resource: item.resource, query: 'timezone', network: 'eip155:8453', provider: '402timezones.vercel.app', maxUsdPrice: 0.1 })
    expect(result).toMatchObject({ kind: 'ready', toolRef: expect.any(String) })
    expect(sdk.search).toHaveBeenCalledExactlyOnceWith({ query: 'timezone', network: 'eip155:8453', urlSubstring: '://402timezones.vercel.app/', maxUsdPrice: '0.1', limit: 20 })
    expect(sdk.list).not.toHaveBeenCalled()
  })

  it('refuses invalid resolution filters before any source request or publication', async () => {
    const backend = convexTest(schema, convexModules)
    const result = await backend.action(api.x402Directory.resolve, { resource: item.resource, provider: 'https://example.com/private' })
    expect(result).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(sdk.search).not.toHaveBeenCalled()
    expect(sdk.list).not.toHaveBeenCalled()
    expect(await backend.run((ctx) => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

})
