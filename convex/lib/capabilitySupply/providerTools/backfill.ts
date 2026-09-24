import { paginationOptsValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'
import { upsertProviderToolIdentity } from '../../../capabilityProviderToolProjection'
import type { MutationCtx } from '../../../_generated/server'

export const backfillDraftPageArgs = { paginationOpts: paginationOptsValidator }
export const backfillDraftPageResult = v.object({
  processed: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export async function backfillDraftPageHandler(ctx: MutationCtx, args: { paginationOpts: Infer<typeof paginationOptsValidator> }) {
    const rows = await ctx.db.query('offeringAccessPaths').paginate(args.paginationOpts)
    let processed = 0
    for (const path of rows.page) {
      if (path.integrationDraft === undefined) continue
      const offering = await ctx.db.query('businessOfferings')
        .withIndex('by_offeringRef', (query) => query.eq('offeringRef', path.offeringRef))
        .unique()
      if (offering === null || offering.businessId !== path.businessId) continue
      await upsertProviderToolIdentity(ctx, {
        businessId: path.businessId,
        providerRef: String(path.businessId),
        toolRef: path.offeringRef,
        offeringRef: path.offeringRef,
        offeringRevision: path.offeringRevision,
        updatedAt: path.integrationDraft.updatedAt,
      })
      processed += 1
    }
    return { processed, isDone: rows.isDone, continueCursor: rows.continueCursor }
}
