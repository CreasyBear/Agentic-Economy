import type { MutationCtx } from '../../../_generated/server'
import type { AdminCommandSpec } from '../commandEnvelope'
import type { AdminCommandWireArgs } from '../validators'
import { applyCapabilitySourceAuthorityReview } from '../../capabilitySupply/sourceAuthority'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { validateAuditEvent } from '@/modules/observability/public'
import { persistAuditEvent } from '../../../securityShared'

import { v } from 'convex/values'
import { adminCommandArgsValue, adminCommandReceiptValue } from '../validators'

export const sourceAuthorityArgs = adminCommandArgsValue(
  v.literal('verify_capability_source_authority'),
  v.object({
    publicationRef: v.string(),
    expectedRevision: v.number(),
    expectedSourceDigest: v.string(),
  }),
  v.union(v.literal('evidence_verified'), v.literal('evidence_insufficient')),
).fields
export const sourceAuthorityReceiptValue = adminCommandReceiptValue(
  v.literal('verify_capability_source_authority'),
  v.union(v.literal('source_authority_verified'), v.literal('source_authority_insufficient')),
  v.union(v.literal('publication_not_found'), v.literal('source_authority_not_reviewable'), v.string()),
)
export function sourceAuthoritySpec(
  ctx: MutationCtx,
  args: AdminCommandWireArgs<'verify_capability_source_authority'>,
): AdminCommandSpec<'verify_capability_source_authority'> {
  const { publicationRef, expectedRevision, expectedSourceDigest } = args.input
  return {
    targetType: 'capability_publication',
    targetRef: publicationRef,
    auditEventType: 'capability_supply.eligibility_changed',
    currentStateDigest: async () => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => query
          .eq('publicationRef', publicationRef).eq('revision', expectedRevision))
        .unique()
      return publication === null ? null : canonicalDigest({
        sourceAuthorityState: publication.sourceAuthorityState ?? null,
        updatedAt: publication.updatedAt,
      })
    },
    apply: async (actor) => {
      const result = await applyCapabilitySourceAuthorityReview(ctx, {
        publicationRef, expectedRevision, expectedSourceDigest,
        evidenceRefs: args.evidenceRefs,
        decision: args.reasonCode,
      })
      if (result.kind === 'refused') return result
      if (result.previousState !== result.nextState) {
        const payload = { action: args.action, reasonCode: args.reasonCode }
        const event = validateAuditEvent({
          eventId: brandNonEmpty(`audit:source-authority:${canonicalDigest({
            publicationRef, expectedRevision, operationKey: args.operationKey,
          })}`, 'AuditEventId'),
          eventType: 'capability_supply.eligibility_changed',
          actorKind: 'admin',
          actorRef: actor.membership.clerkUserId,
          targetType: 'capability_publication',
          targetRef: publicationRef,
          beforeState: result.previousState,
          afterState: result.nextState,
          idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
          correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
          reasonCode: args.reasonCode,
          evidenceRefs: args.evidenceRefs,
          redactedPayload: payload,
          payloadHash: canonicalDigest(payload),
          createdAt: Date.now(),
        })
        if (!event.valid) throw new Error(`source_authority_audit_invalid:${event.reason}`)
        await persistAuditEvent(ctx.db, event.event)
      }
      return {
        kind: 'applied',
        code: result.nextState === 'verified'
          ? 'source_authority_verified' : 'source_authority_insufficient',
        effectRefs: [result.publicationRef, result.toolRef],
        beforeState: result.previousState,
        afterState: result.nextState,
      }
    },
  }
}
