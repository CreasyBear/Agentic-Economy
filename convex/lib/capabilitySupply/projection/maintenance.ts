import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { MutationCtx } from '../../../_generated/server'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from './support'
import { readLiveBusinessSupplyProjection } from './reads'
import { rebuildBusinessSupplyProjectionSnapshotCommand } from './snapshot'

const BUSINESS_PROJECTION_REBUILD_PAGE_SIZE = 25

type RebuildAllBusinessSupplyProjectionsResult = {
  processed: number
  rebuilt: number
  skipped: number
  isDone: boolean
  continueCursor: string | null
}

/**
 * Permanent maintenance entry point for catalogue projections; run with
 * `npx convex run capabilitySupplyProjection:rebuildAllBusinessSupplyProjections '{}'`.
 *
 * `registrySearchDocuments` is the only table public business search reads, and
 * it is written solely by the projection rebuild below. Any business onboarded
 * through a path that skipped the rebuild - dev seed, curated bootstrap,
 * facilitator discovery - stays invisible to business search until this sweep
 * runs. The command diffs documents against the stored rows, so repeated runs
 * are idempotent.
 *
 * The hot publish path (`rebuildCapabilityOriginSupplyProjection`) no longer
 * skips programmable providers either - it runs the same derive-and-rebuild
 * for them and only defers when a fleet outgrows one transaction's page
 * (`*_requires_pagination` / `*_capacity_exceeded`), logging a structured
 * warning instead of failing the publish. This sweep is the recovery path for
 * those deferred businesses, plus any row published before 2026-09-10 (when
 * programmable providers were still skipped outright and left with no search
 * document at all). A fleet larger than the rebuild's page cap still throws
 * here too, so one oversized provider is counted as skipped instead of
 * aborting the whole sweep.
 */
export const rebuildAllBusinessSupplyProjectionsArgs = v.object({ cursor: v.optional(v.string()), dryRun: v.optional(v.boolean()) })
export const rebuildAllBusinessSupplyProjectionsResult = v.object({
    processed: v.number(),
    rebuilt: v.number(),
    skipped: v.number(),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
})
export async function rebuildAllBusinessSupplyProjectionsHandler(ctx: MutationCtx, args: Infer<typeof rebuildAllBusinessSupplyProjectionsArgs>): Promise<RebuildAllBusinessSupplyProjectionsResult> {
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
        console.warn('rebuild_all_business_supply_projections_skipped', business.slug, error)
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
