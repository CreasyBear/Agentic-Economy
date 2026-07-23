import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, load]) => [
    path.replace('../../convex/', './'),
    load,
  ]),
)
const bootstrapComparisonBusinesses = makeFunctionReference<
  'mutation',
  Record<string, never>,
  {
    kind: 'bootstrapped'
    dataLabel: 'labelled_demo'
    seededSlugs: string[]
    businessIdsBySlug: Record<string, string>
    createdCount: number
  }
>('consumerComparisonDemo:bootstrapLabelledConsumerComparisonBusinesses')
const seedComparisonDemo = makeFunctionReference<
  'mutation',
  Record<string, never>,
  {
    kind: 'seeded'
    dataLabel: 'labelled_demo'
    seedVersion: string
    selections: Array<{
      businessId: string
      offeringRef: string
      revision: number
      projectionObservedAt: number
      profileVersion: 'professional_service:v1' | 'machine_data:v1'
    }>
    detailUrls: string[]
  }
>('consumerComparisonDemo:seedLabelledConsumerComparisonDemo')

describe('Phase 5 labelled comparison inventory', () => {
  it('bootstraps only four inert businesses and replays without collateral supply or source growth', async () => {
    const backend = convexTest(schema, modules)
    const supplyBefore = await capabilitySupplyCounts(backend)

    const firstBootstrap = await backend.mutation(
      bootstrapComparisonBusinesses,
      {},
    )
    expect(firstBootstrap).toMatchObject({
      kind: 'bootstrapped',
      dataLabel: 'labelled_demo',
      createdCount: 4,
      seededSlugs: [
        'sandbox-phase5-web-starter',
        'sandbox-phase5-web-growth',
        'sandbox-phase5-data-rest',
        'sandbox-phase5-data-graphql',
      ],
    })
    expect(await capabilitySupplyCounts(backend)).toEqual(supplyBefore)

    await backend.run((ctx) => ctx.db.insert('operatorControls', {
      key: 'offering_public_projection_enabled',
      enabled: true,
      changedByAdminRef: 'test:phase5-release-admin',
      reasonCode: 'test_phase5_public_projection',
      evidenceRefs: ['test:phase5'],
      correlationId: 'test:phase5',
      operationKey: 'test:phase5:enable-projection',
      updatedAt: 1,
    }))
    const firstSeed = await backend.mutation(
      seedComparisonDemo,
      {},
    )
    const sourceAfterFirstSeed = await comparisonSourceCounts(backend)

    const replayBootstrap = await backend.mutation(
      bootstrapComparisonBusinesses,
      {},
    )
    const replaySeed = await backend.mutation(
      seedComparisonDemo,
      {},
    )

    expect(replayBootstrap.createdCount).toBe(0)
    expect(replaySeed).toEqual(firstSeed)
    expect(await comparisonSourceCounts(backend)).toEqual(sourceAfterFirstSeed)
    expect(await capabilitySupplyCounts(backend)).toEqual(supplyBefore)
    expect(firstSeed.selections).toHaveLength(4)
    expect(firstSeed.detailUrls).toHaveLength(4)
  })
})

async function capabilitySupplyCounts(
  backend: ReturnType<typeof convexTest>,
): Promise<Record<string, number>> {
  return backend.run(async (ctx) => ({
    offerings: (await ctx.db.query('capabilityOfferings').collect()).length,
    bindings: (await ctx.db.query('capabilityTransportBindings').collect()).length,
    publications: (await ctx.db.query('capabilityPublications').collect()).length,
  }))
}

async function comparisonSourceCounts(
  backend: ReturnType<typeof convexTest>,
): Promise<Record<string, number>> {
  return backend.run(async (ctx) => ({
    businesses: (await ctx.db.query('businesses').collect()).length,
    claims: (await ctx.db.query('claims').collect()).length,
    services: (await ctx.db.query('businessServices').collect()).length,
    serviceCapabilities: (await ctx.db.query('serviceCapabilities').collect()).length,
    offerings: (await ctx.db.query('businessOfferings').collect()).length,
    revisions: (await ctx.db.query('businessOfferingRevisions').collect()).length,
    publicHistory: (await ctx.db.query('offeringPublicRevisionHistory').collect()).length,
    cutovers: (await ctx.db.query('catalogSupplyCutovers').collect()).length,
    projections: (await ctx.db.query('businessSupplyProjectionSnapshots').collect()).length,
    operations: (await ctx.db.query('operationKeys').collect()).length,
  }))
}
