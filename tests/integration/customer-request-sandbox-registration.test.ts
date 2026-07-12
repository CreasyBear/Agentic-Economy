import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('sandbox supply registration', () => {
  it('seeds two published businesses, one immutable contract, and two eligible bindings through normal Convex writes', async () => {
    const backend = convexTest(schema, modules)
    const first = await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const replay = await backend.mutation(internal.devSeed.seedDevCatalog, {})

    expect(first.sandboxBindings).toEqual(['sandbox.option.one:v1', 'sandbox.option.two:v1'])
    expect(replay.sandboxBindings).toEqual(first.sandboxBindings)
    const state = await backend.run(async (ctx) => {
      const businesses = await Promise.all(['sandbox-option-one', 'sandbox-option-two'].map(async (slug) => await ctx.db
        .query('businesses').withIndex('by_slug', (query) => query.eq('slug', slug)).unique()))
      const contracts = await ctx.db.query('customerRequestCapabilityContracts').collect()
      const bindings = await ctx.db.query('routingKernelBindings').collect()
      return { businesses, contracts, bindings }
    })
    expect(state.businesses).toMatchObject([
      { name: 'Sandbox Option One', publicStatus: 'published', claimStatus: 'published' },
      { name: 'Sandbox Option Two', publicStatus: 'published', claimStatus: 'published' },
    ])
    expect(state.contracts).toHaveLength(1)
    expect(state.contracts[0]).toMatchObject({ capabilityContractId: 'sandbox.option.quote:v1', status: 'active' })
    expect(state.bindings).toHaveLength(2)
    expect(state.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ bindingId: 'sandbox.option.one:v1', admission: 'admitted', conformance: 'conformant' }),
      expect.objectContaining({ bindingId: 'sandbox.option.two:v1', admission: 'admitted', conformance: 'conformant' }),
    ]))
  })
})
