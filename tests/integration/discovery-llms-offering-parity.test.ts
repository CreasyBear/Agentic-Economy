import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'

describe('durable llms Offering parity', () => {
  it('excludes businesses without offerings and private detail', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const ownerId = await ctx.db.insert('owners', {
        clerkUserId: 'owner:llms-parity', createdAt: 1, updatedAt: 1,
      })
      await ctx.db.insert('businesses', {
        ownerId, slug: 'offering-engineering', name: 'Offering Engineering', normalizedName: 'offering engineering',
        category: 'Engineering', businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' },
        publicStatus: 'published', trustTier: 'listed',
        sourceHash: 'business:offering-engineering', createdAt: 1, updatedAt: 1,
      })

      await ctx.db.insert('businesses', {
        ownerId, slug: 'profile-only-consulting', name: 'Profile Only Consulting', normalizedName: 'profile only consulting',
        category: 'Consulting', businessContext: { kind: 'local_human', suburb: 'Fremantle', stateTerritory: 'WA' },
        publicStatus: 'published', trustTier: 'listed',
        sourceHash: 'business:profile-only', createdAt: 1, updatedAt: 1,
      })
    })

    const result = await backend.query(api.discovery.readLlmsTxt, {
      canonicalBaseUrl: 'https://ae.example', routingBaseUrl: 'https://ae.example', now: 3,
    })
    expect(result.body).toContain('## Capability market loop')
    expect(result.body).toContain('- none')
    expect(result.body).toContain('- total=0; the lines above are a bounded sample')
    expect(result.body).not.toContain('offering-engineering')
    expect(result.body).not.toContain('profile-only-consulting')
    expect(result.body).not.toContain('Retired Legacy Drilling')
    expect(result.body).not.toContain('secret:must-not-leak')
    expect(result.body).not.toContain('credentialRef')

    const supply = await backend.query(api.registry.listPublicBusinessOfferingSupply, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(supply.page).toEqual([])
    expect(JSON.stringify(supply)).not.toContain('secret:must-not-leak')
  })
})
