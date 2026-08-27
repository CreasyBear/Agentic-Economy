import type { QueryCtx } from '../_generated/server'

export async function currentOperationReadControlHandler(ctx: QueryCtx) {
  const row = await ctx.db
    .query('capabilityCurrentOperationReadControls')
    .withIndex('by_controlRef', (query) => query.eq('controlRef', 'current_operation_registry'))
    .unique()
  return row === null
    ? {
        mode: 'old' as const,
        reason: 'projection_not_cut_over',
        releaseOwner: 'unassigned',
        updatedAt: 0,
        isDefault: true,
      }
    : {
        mode: row.mode,
        reason: row.reason,
        releaseOwner: row.releaseOwner,
        ...(row.verifiedActiveCount === undefined ? {} : { verifiedActiveCount: row.verifiedActiveCount }),
        ...(row.verifiedProjectionDigest === undefined
          ? {}
          : { verifiedProjectionDigest: row.verifiedProjectionDigest }),
        updatedAt: row.updatedAt,
        isDefault: false,
      }
}

