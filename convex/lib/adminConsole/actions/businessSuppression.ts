import type { MutationCtx } from '../../../_generated/server'
import type { AdminCommandSpec } from '../commandEnvelope'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from '../../../lib/capabilitySupply/projection/support'
import { rebuildBusinessSupplyProjectionSnapshotCommand } from '../../../lib/capabilitySupply/projection/snapshot'
import type { AdminCommandWireArgs } from '../validators'

export function businessSuppressionSpec(
  ctx: MutationCtx,
  input: AdminCommandWireArgs<'set_business_suppression'>['input'],
): AdminCommandSpec<'set_business_suppression'> {
  const businessId = ctx.db.normalizeId('businesses', input.businessId)
  return {
    targetType: 'business',
    targetRef: input.businessId,
    auditEventType: input.intent === 'suppress' ? 'business.suppressed' : 'business.unsuppressed',
    currentStateDigest: async () => {
      const business = businessId === null ? null : await ctx.db.get(businessId)
      return business === null ? null : canonicalDigest({
        suppressedAt: business.suppressedAt ?? null,
        updatedAt: business.updatedAt,
      })
    },
    apply: async () => {
      const business = businessId === null ? null : await ctx.db.get(businessId)
      if (business === null) return { kind: 'refused', code: 'business_not_found' }
      const isSuppressed = business.suppressedAt !== undefined
      const desiredSuppressed = input.intent === 'suppress'
      if (isSuppressed === desiredSuppressed) return { kind: 'refused', code: 'suppression_unchanged' }

      const now = Date.now()
      const beforeState = isSuppressed ? 'suppressed' : 'discoverable'
      const afterState = desiredSuppressed ? 'suppressed' : 'discoverable'
      if (desiredSuppressed) {
        await ctx.db.patch(business._id, { suppressedAt: now, updatedAt: now })
      } else {
        const { suppressedAt: _suppressedAt, ...rest } = business
        void _suppressedAt
        await ctx.db.replace(business._id, { ...rest, updatedAt: now })
      }
      const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, business._id, now)
      await rebuildBusinessSupplyProjectionSnapshotCommand({
        db: ctx.db,
        sourceDb: ctx.db,
        businessId: business._id,
        support,
        now,
      })
      return {
        kind: 'applied',
        code: desiredSuppressed ? 'business_suppressed' : 'business_unsuppressed',
        effectRefs: [String(business._id)],
        beforeState,
        afterState,
      }
    },
  }
}
