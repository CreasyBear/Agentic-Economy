import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { MutationCtx } from '../../../_generated/server'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from './support'
import { readLiveBusinessSupplyProjection } from './reads'
import { rebuildBusinessSupplyProjectionPageCommand, rebuildBusinessSupplyProjectionSnapshotCommand, removeStaleBusinessSearchDocumentsPage } from './snapshot'

const BUSINESS_PROJECTION_REBUILD_PAGE_SIZE = 1
const OFFERING_REBUILD_PAGE_SIZE = 5

type RebuildAllBusinessSupplyProjectionsResult = {
  processed: number
  rebuilt: number
  skipped: number
  isDone: boolean
  continueCursor: string | null
}

/**
 * Reconcile business search from canonical offerings. Large fleets continue in
 * bounded offering pages, then remove obsolete search rows in bounded pages.
 * Publication and withdrawal authority never comes from these search rows.
 */
export const rebuildAllBusinessSupplyProjectionsArgs = v.object({
  cursor: v.optional(v.string()),
  dryRun: v.optional(v.boolean()),
  businessId: v.optional(v.id('businesses')),
  offeringCursor: v.optional(v.string()),
  cleanup: v.optional(v.boolean()),
  cleanupCursor: v.optional(v.string()),
})
export const rebuildAllBusinessSupplyProjectionsResult = v.object({
    processed: v.number(),
    rebuilt: v.number(),
    skipped: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
})
export async function rebuildAllBusinessSupplyProjectionsHandler(ctx: MutationCtx, args: Infer<typeof rebuildAllBusinessSupplyProjectionsArgs>): Promise<RebuildAllBusinessSupplyProjectionsResult> {
    if (args.businessId !== undefined) {
      const business = await ctx.db.get(args.businessId)
      if (business === null || await providerRouteabilityIsFrozen(ctx, args.businessId)) {
        return { processed: 0, rebuilt: 0, skipped: 1, isDone: true, continueCursor: null }
      }
      const isPublic = business.publicStatus === 'published' && business.suppressedAt === undefined
      if (args.cleanup === true || !isPublic) {
        if (args.dryRun) return { processed: 0, rebuilt: 0, skipped: 0, isDone: true, continueCursor: null }
        const cleanup = await removeStaleBusinessSearchDocumentsPage({
          db: ctx.db, businessId: business._id, businessSlug: business.slug,
          cursor: args.cleanupCursor ?? null, retract: !isPublic,
        })
        if (!cleanup.isDone && !args.dryRun) {
          await ctx.scheduler.runAfter(0, internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {
            businessId: business._id, cleanup: true, cleanupCursor: cleanup.continueCursor,
          })
        }
        return { processed: 1, rebuilt: 0, skipped: 0, isDone: cleanup.isDone, continueCursor: cleanup.isDone ? null : cleanup.continueCursor }
      }
      const page = await ctx.db.query('businessOfferings')
        .withIndex('by_businessId_and_offeringRef', (query) => query.eq('businessId', business._id))
        .paginate({ numItems: OFFERING_REBUILD_PAGE_SIZE, cursor: args.offeringCursor ?? null })
      const rebuilt = args.dryRun ? 0 : await rebuildBusinessSupplyProjectionPageCommand({
        db: ctx.db, businessId: business._id, offeringRows: page.page, now: Date.now(),
      })
      if (!args.dryRun) {
        await ctx.scheduler.runAfter(0, internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {
          businessId: business._id,
          ...(page.isDone ? { cleanup: true } : { offeringCursor: page.continueCursor }),
        })
      }
      return { processed: page.page.length, rebuilt, skipped: page.page.length - rebuilt, isDone: args.dryRun === true && page.isDone, continueCursor: page.isDone ? null : page.continueCursor }
    }
    const now = Date.now()
    const dryRun = args.dryRun === true
    const page = await ctx.db.query('businesses').paginate({
      cursor: args.cursor ?? null,
      numItems: BUSINESS_PROJECTION_REBUILD_PAGE_SIZE,
    })
    let rebuilt = 0
    let skipped = 0
    for (const business of page.page) {
      // A frozen provider must not be re-published into search; same guard
      // `rebuildCapabilityOriginSupplyProjection` applies. The publish-path
      // wrapper lives in `projection/rebuild.ts`; this paginated maintenance
      // path derives and writes each page directly.
      if (await providerRouteabilityIsFrozen(ctx, business._id)) {
        skipped += 1
        continue
      }
      try {
        const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, business._id, now)
        if (dryRun) {
          // The command writes, so a dry run reports what it would rebuild by
          // reading the same projection the command reads before writing.
          const projection = await readLiveBusinessSupplyProjection({ db: ctx.db, businessId: business._id, support, now })
          if (projection === null) skipped += 1
          else rebuilt += 1
          continue
        }
        const result = await rebuildBusinessSupplyProjectionSnapshotCommand({
          db: ctx.db,
          sourceDb: ctx.db,
          businessId: business._id,
          support,
          now,
        })
        if (result.kind === 'ok') rebuilt += 1
        else skipped += 1
      } catch (error) {
        const boundedFleet = error instanceof Error
          && (error.message.endsWith('_requires_pagination') || error.message.endsWith('_capacity_exceeded'))
        if (boundedFleet && !dryRun) {
          await ctx.scheduler.runAfter(0, internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {
            businessId: business._id,
          })
        } else {
          console.warn('rebuild_all_business_supply_projections_skipped', business.slug, error)
        }
        skipped += 1
      }
    }
    if (!page.isDone && !dryRun) {
      await ctx.scheduler.runAfter(0, internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {
        cursor: page.continueCursor,
      })
    }
    return {
      processed: page.page.length,
      rebuilt,
      skipped,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    }
}
