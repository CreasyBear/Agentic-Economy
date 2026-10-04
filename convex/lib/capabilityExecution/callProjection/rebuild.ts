import { paginationOptsValidator } from 'convex/server'
import { v, type ObjectType } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { upsertCallProjection } from '../callLifecycle/dispatchProjection'
import type { CallDispatchProjectionShape } from '../callLifecycle/contracts'
import { refreshExistingMeasurement } from '../serviceUsage/lineage'

export const rebuildArgs = { paginationOpts: paginationOptsValidator }
export const rebuildResult = v.object({ continueCursor: v.string(), isDone: v.boolean(), rebuilt: v.number() })

export async function rebuildHandler(ctx: MutationCtx, args: ObjectType<typeof rebuildArgs>) {
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) {
    throw new Error('call_projection_rebuild_page_size_invalid')
  }
  const page = await ctx.db.query('capabilityCalls')
    .order('asc')
    .paginate(args.paginationOpts)
  let rebuilt = 0
  for (const row of page.page) {
    if (
      row.result === undefined
      || row.dispatchState === undefined
      || row.state === 'pending'
      || row.state === 'cancelled'
    ) {
      await refreshExistingMeasurement(ctx, row)
      continue
    }
    await upsertCallProjection(ctx, row, {
      state: row.state,
      result: row.result,
      ...(row.usage === undefined ? {} : { usage: row.usage }),
      ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
      ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
      dispatchState: row.dispatchState,
    } as CallDispatchProjectionShape, row.updatedAt)
    rebuilt += 1
  }
  return { continueCursor: page.continueCursor, isDone: page.isDone, rebuilt }
}
