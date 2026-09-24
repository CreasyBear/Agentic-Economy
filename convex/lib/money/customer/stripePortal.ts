import { v } from 'convex/values'

import { brandNonEmpty } from '../../../../src/modules/common/ids'
import { redactPayload, validateAuditEvent } from '../../../../src/modules/observability/public'
import type { MutationCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { persistAuditEvent } from '../../security/audit/persistence'
import { requireStripeAccountContext, validateCorrelationRef } from './authority'

export const recordBillingPortalStartedArgs = {
    correlationRef: v.string(),
    idempotencyRef: v.string(),
}

export const recordBillingPortalStartedResult = v.object({
  kind: v.literal('recorded'),
})

type RecordBillingPortalStartedReceipt = Readonly<{ kind: 'recorded' }>

type RecordBillingPortalStartedArgs = Readonly<{
  correlationRef: string
  idempotencyRef: string
}>

export async function recordBillingPortalStartedHandler(ctx: MutationCtx, args: RecordBillingPortalStartedArgs): Promise<RecordBillingPortalStartedReceipt> {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const {
      principal,
      canonicalAccountRef,
      authorityGeneration,
    } = await requireStripeAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)

    const now = Date.now()
    const eventId = `audit:billing-portal:${args.correlationRef}`
    const audit = validateAuditEvent({
      eventId: brandNonEmpty(eventId, 'AuditEventId'),
      eventType: 'billing.portal_started',
      actorKind: 'owner',
      actorRef: principal.principalRef,
      activeAccountRef: canonicalAccountRef,
      authorityGeneration,
      sourceSystem: 'ae_recorded',
      targetType: 'billing',
      targetRef: canonicalAccountRef,
      idempotencyKey: brandNonEmpty(args.idempotencyRef, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationRef, 'CorrelationId'),
      beforeState: 'idle',
      afterState: 'portal_started',
      evidenceRefs: [],
      redactedPayload: redactPayload({
        correlationRef: args.correlationRef,
      }),
      payloadHash: brandNonEmpty(args.idempotencyRef, 'SourceHash'),
      createdAt: now,
    })
    if (!audit.valid) throw new Error(`billing_portal_audit_invalid:${audit.reason}`)
    await persistAuditEvent(ctx.db, audit.event)

    return { kind: 'recorded' }
}
