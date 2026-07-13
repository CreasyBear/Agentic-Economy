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
    const businesses = await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, registeredAt)
    const registrations = await registerSandboxV2SupplyRegistrations(ctx.db, registeredAt + 2_000)
    const sandboxV2Bindings = await admitSandboxV2Supply(ctx.db, registrations, registeredAt + 2_500)
    return { ...businesses, sandboxV2Bindings }
  },
})
