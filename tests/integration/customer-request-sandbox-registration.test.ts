import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('V2-only sandbox supply registration', () => {
  it('does not dual-write V1 contracts or bindings while seeding the V2 registrations', async () => {
    const backend = convexTest(schema, modules)
    const first = await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const replay = await backend.mutation(internal.devSeed.seedDevCatalog, {})

    expect(first).not.toHaveProperty('sandboxBindings')
    expect(replay).toEqual(first)
    expect(first.sandboxV2Bindings).toEqual([
      'binding:sandbox-option-one:http-json:v2',
      'binding:sandbox-option-two:http-json:v2',
    ])
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
    expect(state.contracts).toEqual([])
    expect(state.bindings).toEqual([])
  })

  it('does not expose any legacy eligible supply after the V2-only seed', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await backend.run(async (ctx) => {
      const template = await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', 'sandbox-option-one')).unique()
      if (template === null) throw new Error('sandbox template missing')
      const { _id: _templateId, _creationTime: _templateCreationTime, ...listing } = template
      await ctx.db.insert('businesses', {
        ...listing, slug: 'sandbox-listing-only', name: 'Sandbox Listing Only',
      })
    })

    const eligible = await backend.run(async (ctx) => await ctx.db.query('routingKernelBindings')
      .withIndex('by_networkId_admission_conformance', (query) => query
        .eq('networkId', 'ae:public')
        .eq('admission', 'admitted')
        .eq('conformance', 'conformant'))
      .take(1))
    expect(eligible).toEqual([])
  })
})
