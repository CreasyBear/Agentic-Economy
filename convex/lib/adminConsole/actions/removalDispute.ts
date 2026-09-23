import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AdminCommandSpec } from '../commandEnvelope'
import type { AdminCommandWireArgs } from '../validators'

export function removalDisputeSpec(
  ctx: MutationCtx,
  input: AdminCommandWireArgs<'close_removal_dispute'>['input'],
): AdminCommandSpec<'close_removal_dispute'> {
  const id = ctx.db.normalizeId('disputes', input.disputeId)
  return {
    targetType: 'dispute',
    targetRef: input.disputeId,
    auditEventType: 'dispute.closed',
    currentStateDigest: async () => {
      const dispute = id === null ? null : await ctx.db.get(id)
      return dispute === null ? null : canonicalDigest({
        status: dispute.status,
        updatedAt: dispute.updatedAt,
      })
    },
    apply: async () => {
      const dispute = id === null ? null : await ctx.db.get(id)
      if (dispute === null) return { kind: 'refused', code: 'dispute_not_found' }
      if (dispute.status === 'closed') return { kind: 'refused', code: 'dispute_already_closed' }
      await ctx.db.patch(dispute._id, { status: 'closed', updatedAt: Date.now() })
      return {
        kind: 'applied',
        code: 'dispute_closed',
        effectRefs: [String(dispute._id)],
        beforeState: dispute.status,
        afterState: 'closed',
      }
    },
  }
}
