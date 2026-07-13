import { v } from 'convex/values'

import { internalMutation } from './_generated/server'
import {
  admitSandboxV2Supply,
  registerSandboxBusinesses,
  registerSandboxV2SupplyRegistrations,
} from './devSeed'
import { runtimeDb } from './source_state'
import { DEV_SEED_BUSINESS_FIXTURES } from '../src/modules/dev/public'

export const seedLabelledSandboxSupply = internalMutation({
  args: {},
  returns: v.object({
    seededSlugs: v.array(v.string()),
    businessIdsBySlug: v.record(v.string(), v.string()),
    sandboxV2Bindings: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const registeredAt = Date.now()
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
      fixture.requestedSlug === 'sandbox-option-one' || fixture.requestedSlug === 'sandbox-option-two'
    ))
    const existing = await Promise.all(fixtures.map(async (fixture) => (
      await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', fixture.requestedSlug))
        .unique()
    )))
    const existingCount = existing.filter((business) => business !== null).length
    if (existingCount !== 0 && existingCount !== fixtures.length) {
      throw new Error('sandbox_acceptance_supply_partial_identity')
    }
    const businesses = existingCount === 0
      ? await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, registeredAt)
      : {
          seededSlugs: fixtures.map((fixture) => fixture.requestedSlug),
          businessIdsBySlug: Object.fromEntries(fixtures.map((fixture, index) => {
            const business = existing[index]
            if (business === undefined
              || business === null
              || business.name !== fixture.businessName
              || business.category !== fixture.category
              || business.claimStatus !== 'published'
              || business.publicStatus !== 'published') {
              throw new Error('sandbox_acceptance_supply_identity_mismatch')
            }
            return [fixture.requestedSlug, business._id]
          })),
        }
    const registrations = await registerSandboxV2SupplyRegistrations(ctx.db, registeredAt + 2_000)
    const sandboxV2Bindings = await admitSandboxV2Supply(ctx.db, registrations, registeredAt + 2_500)
    return { ...businesses, sandboxV2Bindings }
  },
})
