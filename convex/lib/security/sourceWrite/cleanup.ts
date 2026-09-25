import { v } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { MutationCtx } from '../../../_generated/server'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from '../../platform/workloadCron/context'
import { reconcileWorkloadCronSnapshot } from '../../platform/workloadCron/admission'

const sourceWriteNonceCleanupResult = v.object({
  deleted: v.number(),
  cutoff: v.number(),
  rescheduled: v.boolean(),
})

const SOURCE_WRITE_NONCE_CLEANUP_BATCH_SIZE = 200
const SOURCE_WRITE_NONCE_CLEANUP_MAX_BATCH_SIZE = 500
export const cleanupExpiredSourceWriteNoncesArgs = {
  now: v.optional(v.number()),
  batchSize: v.optional(v.number()),
  workload: workloadCronSnapshotValue,
}
export const cleanupExpiredSourceWriteNoncesResult = sourceWriteNonceCleanupResult
export const cleanupExpiredSourceWriteNoncesHandler = async (ctx: MutationCtx, args: { now?: number; batchSize?: number; workload: Parameters<typeof parseWorkloadCronSnapshot>[0] }) => {
    await reconcileWorkloadCronSnapshot(
      ctx,
      'cleanup expired source write nonces',
      parseWorkloadCronSnapshot(args.workload),
    )
    const cutoff = args.now !== undefined && Number.isFinite(args.now) ? args.now : Date.now()
    const batchSize = args.batchSize !== undefined && Number.isFinite(args.batchSize)
      ? Math.min(Math.max(Math.floor(args.batchSize), 1), SOURCE_WRITE_NONCE_CLEANUP_MAX_BATCH_SIZE)
      : SOURCE_WRITE_NONCE_CLEANUP_BATCH_SIZE

    const expiredNonces = await ctx.db
      .query('sourceWriteNonces')
      .withIndex('by_expiresAt', (query) => query.lt('expiresAt', cutoff))
      .take(batchSize)

    await Promise.all(expiredNonces.map(({ _id }) => ctx.db.delete(_id)))

    const deleted = expiredNonces.length
    const rescheduled = deleted >= batchSize
    if (rescheduled) {
      await ctx.scheduler.runAfter(0, internal.workloadCron.cleanupExpiredSourceWriteNonces, {
        now: cutoff,
        batchSize,
      })
    }

    return { deleted, cutoff, rescheduled }
}
