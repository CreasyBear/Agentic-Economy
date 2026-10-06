import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { internal } from '../../../convex/_generated/api'
import { sourceRouteRef } from '@/modules/capability-supply/public'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'
import { publishCurrentTool } from '../../helpers/quote-fixtures'

beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production') })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function fixture() {
  const backend = convexTestWithMarketComponents()
  const tool = await publishCurrentTool(backend, 'mercator-import', 'production', '0')
  const resource = 'https://provider.example/lookup'
  const routeRef = sourceRouteRef({ sourceKind: 'x402', sourceSelector: {}, sourceDescriptorJson: JSON.stringify({ method: 'POST' }), endpointUrl: resource })
  if (routeRef === undefined) throw new Error('route_missing')
  const rows = await backend.run(async ctx => {
    const generation = 'import-current'
    await ctx.db.insert('marketExternalRegistryState', { key: 'coinbase', activeGeneration: generation, lastAttemptAt: 1, lastAttemptStatus: 'complete' })
    await ctx.db.insert('marketExternalRegistryGenerations', { generation, source: 'coinbase', status: 'complete', startedAt: 1, completedAt: 1, ingestedCount: 1, terminalObserved: true })
    const entryId = await ctx.db.insert('marketExternalRegistryEntries', { generation, documentId: `registry:${'a'.repeat(64)}`,
      source: 'coinbase', upstreamServiceId: 'mercator', upstreamEndpointId: 'lookup', sourceUrl: resource, name: 'Lookup', summary: 'Imported selector',
      provider: 'provider.example', category: 'other', tags: [], networks: [], access: 'x402', authority: 'source_metadata_only', sourceDigest: 'fixture', searchText: 'lookup', updatedAt: 1 })
    const searchId = await ctx.db.insert('marketDirectorySearchEntries', { generation, resource, entryId, network: '*', category: 'other', provider: 'provider.example',
      sourceRouteRef: routeRef, searchText: 'lookup', popularOrder: 0, updatedOrder: 0, minimumUsdPriceOrder: 0 })
    const publication = await ctx.db.query('capabilityPublications').withIndex('by_toolRef_and_disposition', q => q.eq('toolRef', tool.toolRef).eq('disposition', 'current')).unique()
    if (publication === null) throw new Error('publication_missing')
    await ctx.db.patch(publication._id, { sourceRouteRef: routeRef })
    return { searchId, publicationId: publication._id }
  })
  const read = (providerHost = 'provider.example') => backend.query(internal.capabilityPlanDrafts.importMercator, { inputJson: JSON.stringify({
    flowPlan: { nodes: [{ id: 'lookup', serviceId: 'mercator-service', method: 'POST', path: '/lookup', input: { request: 'Perth' }, dependsOn: [] }] },
    providerHostByServiceId: { 'mercator-service': providerHost },
  }) }).then(value => JSON.parse(value))
  return { backend, tool, rows, read }
}

describe('Mercator drafts against current admitted supply', () => {
  it('resolves one exact selector without creating a Quote or Call and rejects a withdrawn publication', async () => {
    const f = await fixture()
    expect(await f.read()).toMatchObject({ kind: 'drafts', validation: 'untyped_ref', plans: [{ nodes: [{ toolRef: f.tool.toolRef, input: { request: 'Perth' } }] }] })
    expect(await f.read('other.example')).toMatchObject({ kind: 'refused', code: 'tool_not_admitted' })
    await f.backend.run(ctx => ctx.db.patch(f.rows.publicationId, { disposition: 'withdrawn' }))
    expect(await f.read()).toMatchObject({ kind: 'refused', code: 'tool_not_admitted' })
    expect(await f.backend.run(ctx => ctx.db.query('capabilityPlans').collect())).toEqual([])
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
  })

  it('refuses duplicate indexed resources and duplicate current publications without guessing a Tool', async () => {
    const f = await fixture()
    const duplicate = await f.backend.run(async ctx => {
      const row = await ctx.db.get(f.rows.searchId)
      if (row === null) throw new Error('search_missing')
      const { _id, _creationTime, ...copy } = row
      return ctx.db.insert('marketDirectorySearchEntries', copy)
    })
    expect(await f.read()).toMatchObject({ kind: 'refused', code: 'tool_not_admitted' })
    await f.backend.run(async ctx => {
      await ctx.db.delete(duplicate)
      const row = await ctx.db.get(f.rows.publicationId)
      if (row === null) throw new Error('publication_missing')
      const { _id, _creationTime, ...copy } = row
      await ctx.db.insert('capabilityPublications', { ...copy, publicationRef: `${copy.publicationRef}:duplicate` })
    })
    expect(await f.read()).toMatchObject({ kind: 'refused', code: 'tool_not_admitted' })
    expect(await f.backend.run(ctx => ctx.db.query('capabilityPlans').collect())).toEqual([])
  })
})
