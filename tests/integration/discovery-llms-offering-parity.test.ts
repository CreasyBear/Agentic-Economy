import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'

describe('durable llms Offering parity', () => {
  it('uses Offering projection truth, retains profile-only businesses, and excludes private detail', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const ownerId = await ctx.db.insert('owners', {
        clerkUserId: 'owner:llms-parity', createdAt: 1, updatedAt: 1,
      })
      const offeringBusinessId = await ctx.db.insert('businesses', {
        ownerId, slug: 'offering-engineering', name: 'Offering Engineering', normalizedName: 'offering engineering',
        category: 'Engineering', businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' },
        publicStatus: 'published', trustTier: 'listed', claimStatus: 'published',
        sourceHash: 'business:offering-engineering', createdAt: 1, updatedAt: 1,
      })

      const profileBusinessId = await ctx.db.insert('businesses', {
        ownerId, slug: 'profile-only-consulting', name: 'Profile Only Consulting', normalizedName: 'profile only consulting',
        category: 'Consulting', businessContext: { kind: 'local_human', suburb: 'Fremantle', stateTerritory: 'WA' },
        publicStatus: 'published', trustTier: 'listed', claimStatus: 'published',
        sourceHash: 'business:profile-only', createdAt: 1, updatedAt: 1,
      })
      void offeringBusinessId
      void profileBusinessId
    })

    const result = await backend.query(api.discovery.readLlmsTxt, {
      canonicalBaseUrl: 'https://ae.example', routingBaseUrl: 'https://ae.example', now: 3,
    })
    expect(result.body).toContain('- slug=offering-engineering path=/offering-engineering')
    expect(result.body).toContain('- slug=profile-only-consulting path=/profile-only-consulting')
    expect(result.body).toContain('- total=2; the lines above are a bounded sample')
    expect(result.body).not.toContain('Retired Legacy Drilling')
    expect(result.body).not.toContain('secret:must-not-leak')
    expect(result.body).not.toContain('credentialRef')

    // The index no longer inlines Offering names, so the projection contract is
    // asserted where Offering names are actually published.
    const supply = await backend.query(api.registry.listPublicBusinessOfferingSupply, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    const offeringNames = supply.page.flatMap(
      (item: { slug: string; offerings: readonly { name: string }[] }) => item.offerings.map((offering) => offering.name)
    )
    expect(offeringNames).toContain('Current Design Review')
    expect(offeringNames).not.toContain('Retired Legacy Drilling')
    expect(supply.page.find((item: { slug: string }) => item.slug === 'profile-only-consulting')?.offerings).toEqual([])
    expect(JSON.stringify(supply)).not.toContain('secret:must-not-leak')
  })
})
