import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import {
  admitSandboxV2Supply,
  registerSandboxBusinesses,
  registerSandboxRouteSupplyRegistrations,
  registerSandboxV2SupplyRegistrations,
  retireSupersededSandboxV2Supply,
  seedSandboxCapabilityPublication,
} from './devSeed'
import { runtimeDb } from './source_state'
import { DEV_SEED_BUSINESS_FIXTURES } from '../src/modules/dev/public'

export const seedLabelledSandboxSupply = internalMutation({
  args: {},
  returns: v.object({
    seededSlugs: v.array(v.string()),
    businessIdsBySlug: v.record(v.string(), v.string()),
    sandboxV2Bindings: v.array(v.string()),
    sandboxCapabilityPublicationRefs: v.array(v.string()),
    sandboxRouteBindings: v.array(v.string()),
    sandboxRoutePublicationRefs: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const registeredAt = Date.now()
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
      fixture.requestedSlug.startsWith('sandbox-')
    ))
    const existing = await Promise.all(fixtures.map(async (fixture) => (
      await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', fixture.requestedSlug))
        .unique()
    )))
    for (const [index, fixture] of fixtures.entries()) {
      const business = existing[index]
      if (business !== undefined && business !== null && (
        business.name !== fixture.businessName
        || business.category !== fixture.category
        || business.claimStatus !== 'published'
        || business.publicStatus !== 'published'
      )) throw new Error('sandbox_acceptance_supply_identity_mismatch')
    }
    const missingFixtures = fixtures.filter((_, index) => existing[index] === null)
    const created = await registerSandboxBusinesses(runtimeDb(ctx.db), missingFixtures, registeredAt)
    const businesses = {
      seededSlugs: fixtures.map((fixture) => fixture.requestedSlug),
      businessIdsBySlug: {
        ...Object.fromEntries(fixtures.flatMap((fixture, index) => {
          const business = existing[index]
          return business === undefined || business === null ? [] : [[fixture.requestedSlug, business._id]]
        })),
        ...created.businessIdsBySlug,
      },
    }
    const [registrations, routeRegistrations] = await Promise.all([
      registerSandboxV2SupplyRegistrations(ctx.db, registeredAt + 2_000),
      registerSandboxRouteSupplyRegistrations(ctx.db, registeredAt + 2_100),
    ])
    const [
      sandboxV2Bindings,
      sandboxRouteBindings,
      sandboxCapabilityPublicationRefs,
      sandboxRoutePublicationRefs,
    ] = await Promise.all([
      admitSandboxV2Supply(ctx.db, registrations, registeredAt + 2_500),
      admitSandboxV2Supply(ctx.db, routeRegistrations, registeredAt + 2_600),
      Promise.all(registrations.map(async (registration, index) => {
        const publicationRef = await seedSandboxCapabilityPublication(
          ctx.db, registration, registeredAt + 2_750 + index,
        )
        await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
          publicationRef, expectedRevision: 1,
        })
        return publicationRef
      })),
      Promise.all(routeRegistrations.map(async (registration, index) => {
        const publicationRef = await seedSandboxCapabilityPublication(
          ctx.db, registration, registeredAt + 2_800 + index,
        )
        await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
          publicationRef, expectedRevision: 1,
        })
        return publicationRef
      })),
    ])
    await retireSupersededSandboxV2Supply(ctx.db, registrations, registeredAt + 3_000)
    return {
      ...businesses, sandboxV2Bindings, sandboxCapabilityPublicationRefs,
      sandboxRouteBindings, sandboxRoutePublicationRefs,
    }
  },
})
