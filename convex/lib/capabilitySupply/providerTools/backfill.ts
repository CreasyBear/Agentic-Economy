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

/** Deployment prerequisite: run bounded pages until isDone, then enable indexed name/text reads. */
export const backfillInventoryPageArgs = { paginationOpts: paginationOptsValidator }
export const backfillInventoryPageResult = v.object({ processed: v.number(), skipped: v.number(), isDone: v.boolean(), continueCursor: v.string() })
export async function backfillInventoryPageHandler(ctx: MutationCtx, args: { paginationOpts: Infer<typeof paginationOptsValidator> }) {
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) throw new Error('provider_inventory_backfill_page_size_invalid')
  const page = await ctx.db.query('capabilityProviderToolProjections').paginate(args.paginationOpts)
  let processed = 0
  let skipped = 0
  for (const row of page.page) {
    const revision = await ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', query => query.eq('offeringRef', row.offeringRef).eq('revision', row.offeringRevision)).unique()
    if (revision === null || revision.businessId !== row.businessId) { skipped += 1; continue }
    await ctx.db.patch(row._id, { inventoryName: revision.name.trim().toLowerCase(), inventoryText: `${revision.name} ${revision.summary} ${revision.category}` })
    processed += 1
  }
  return { processed, skipped, isDone: page.isDone, continueCursor: page.continueCursor }
}
