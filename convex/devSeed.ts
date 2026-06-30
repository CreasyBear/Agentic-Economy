import { internalMutation } from './_generated/server'
import { v } from 'convex/values'

import { buildDevSeedCatalogState } from '../src/modules/dev/public'
import { persistDevSeedCatalogState } from './devSeedStore'
import { runtimeDb } from './source_state'

export const seedDevCatalog = internalMutation({
  args: {},
  returns: v.object({
    seededSlugs: v.array(v.string()),
    ownerClerkUserId: v.string(),
    ownerId: v.string(),
    supportRecordId: v.string(),
    businessIdsBySlug: v.record(v.string(), v.string()),
  }),
  handler: async (ctx) => {
    const bundle = buildDevSeedCatalogState()
    const result = await persistDevSeedCatalogState(runtimeDb(ctx.db), bundle)
    return {
      ...result,
      seededSlugs: [...result.seededSlugs],
    }
  },
})
