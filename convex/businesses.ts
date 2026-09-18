import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { readCurrentActiveAdminMembership } from './authz'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './capabilitySupplyProjection'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { brandNonEmpty } from '../src/modules/common/ids'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { validateAuditEvent, type AuditEventContract } from '../src/modules/observability/public'
import {
  recordAdminActionDenied,
  requireAdminAuthority,
  type AdminMembership,
} from '../src/modules/security/public'
import { persistAdminAuthorityMutation, persistAuditEvent, summarizeAudit } from './securityShared'

const suppressionIntent = v.union(v.literal('suppress'), v.literal('unsuppress'))

const suppressionReceipt = v.object({
  businessId: v.string(),
  publicStatus: v.union(
    v.literal('published'),
    v.literal('unpublished'),
    v.literal('suppressed'),
  ),
  suppressedAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
})

const auditSummaryResult = v.object({
  eventType: v.union(
    v.literal('admin.action_denied'),
    v.literal('business.suppressed'),
    v.literal('business.unsuppressed'),
  ),
  actorRef: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  reasonCode: v.optional(v.string()),
})

const setBusinessSuppressionResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(
      v.literal('business_suppressed'),
      v.literal('business_unsuppressed'),
      v.literal('business_suppression_replayed'),
      v.literal('business_suppression_unchanged'),
    ),
    receipt: suppressionReceipt,
    auditEvent: v.optional(auditSummaryResult),
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('admin_action_denied'),
      v.literal('admin_invalid_reason'),
      v.literal('admin_missing_evidence'),
      v.literal('business_not_found'),
    ),
    retryable: v.boolean(),
    reason: v.string(),
    auditEvent: v.optional(auditSummaryResult),
  }),
)

type SetBusinessSuppressionArgs = {
  businessId: Id<'businesses'>
  intent: 'suppress' | 'unsuppress'
  reasonCode: string
  evidenceRefs: string[]
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

type SetBusinessSuppressionResult = {
  kind: 'ok'
  code:
    | 'business_suppressed'
    | 'business_unsuppressed'
    | 'business_suppression_replayed'
    | 'business_suppression_unchanged'
  receipt: {
    businessId: string
    publicStatus: Doc<'businesses'>['publicStatus']
    suppressedAt: number | null
    updatedAt: number
  }
  auditEvent?: ReturnType<typeof summarizeBusinessSuppressionAudit>
} | {
  kind: 'error'
  code: 'admin_action_denied' | 'admin_invalid_reason' | 'admin_missing_evidence' | 'business_not_found'
  retryable: boolean
  reason: string
  auditEvent?: ReturnType<typeof summarizeBusinessSuppressionAudit>
}

function summarizeBusinessSuppressionAudit(event: AuditEventContract): {
  eventType: 'business.suppressed' | 'business.unsuppressed' | 'admin.action_denied'
  actorRef: string
  targetRef: string
  beforeState?: string
  afterState?: string
  reasonCode?: string
} {
  const summary = summarizeAudit(event)
  if (
    summary.eventType !== 'business.suppressed'
    && summary.eventType !== 'business.unsuppressed'
    && summary.eventType !== 'admin.action_denied'
  ) {
    throw new Error(`unexpected_business_suppression_audit_event:${summary.eventType}`)
  }
  return {
    eventType: summary.eventType,
    actorRef: summary.actorRef,
    targetRef: summary.targetRef,
    ...(summary.beforeState === undefined ? {} : { beforeState: summary.beforeState }),
    ...(summary.afterState === undefined ? {} : { afterState: summary.afterState }),
    ...(summary.reasonCode === undefined ? {} : { reasonCode: summary.reasonCode }),
  }
}

export async function setBusinessSuppressionHandler(
  ctx: MutationCtx,
  args: SetBusinessSuppressionArgs,
): Promise<SetBusinessSuppressionResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
  if (sourceWrite.kind === 'rejected') {
    return {
      kind: 'error',
      code: 'admin_action_denied',
      retryable: false,
      reason: sourceWrite.reason,
    }
  }

  const operationKey = brandNonEmpty(args.operationKey, 'OperationKey')
  const correlationId = brandNonEmpty(args.correlationId, 'CorrelationId')
  const now = Date.now()
  const actorMembership = await readCurrentActiveAdminMembership(ctx)
  const authority = requireAdminAuthority(actorMembership, 'suppress_business')
  if (authority.kind === 'denied') {
    const denied = recordAdminActionDenied(
      { adminMemberships: [], adminMembershipAuditEvents: [], auditEvents: [] },
      {
        actorMembership,
        action: 'suppress_business',
        targetType: 'business',
        targetRef: String(args.businessId),
        reasonCode: authority.reason,
        evidenceRefs: args.evidenceRefs,
        operationKey,
        correlationId,
        now,
      },
    )
    await persistAdminAuthorityMutation(ctx.db, denied)
    return {
      kind: 'error',
      code: 'admin_action_denied',
      retryable: false,
      reason: authority.reason,
      auditEvent: summarizeBusinessSuppressionAudit(denied.auditEvent),
    }
  }

  const reasonCode = args.reasonCode.trim()
  if (reasonCode.length === 0) {
    return {
      kind: 'error',
      code: 'admin_invalid_reason',
      retryable: false,
      reason: 'admin_action_requires_reason',
    }
  }

  if (!hasEvidence(args.evidenceRefs)) {
    return {
      kind: 'error',
      code: 'admin_missing_evidence',
      retryable: false,
      reason: 'admin_action_requires_evidence',
    }
  }

  const business = await ctx.db.get(args.businessId)
  if (business === null) {
    return {
      kind: 'error',
      code: 'business_not_found',
      retryable: false,
      reason: 'business_not_found',
    }
  }

  const auditEventType = args.intent === 'suppress' ? 'business.suppressed' : 'business.unsuppressed'
  const auditEventId = brandNonEmpty(
    `audit:${auditEventType}:${String(business._id)}:${operationKey}`,
    'AuditEventId',
  )
  const existingAudit = await ctx.db
    .query('auditEvents')
    .withIndex('by_eventId', (query) => query.eq('eventId', auditEventId))
    .unique()
  if (existingAudit !== null) {
    return {
      kind: 'ok',
      code: 'business_suppression_replayed',
      receipt: suppressionReceiptFromBusiness(business, business.suppressedAt ?? null, business.updatedAt),
    }
  }

  const isSuppressed = business.suppressedAt !== undefined
  const desiredSuppressed = args.intent === 'suppress'
  if (isSuppressed === desiredSuppressed) {
    return {
      kind: 'ok',
      code: 'business_suppression_unchanged',
      receipt: suppressionReceiptFromBusiness(
        business,
        business.suppressedAt ?? null,
        business.updatedAt,
      ),
    }
  }

  const beforeState = isSuppressed ? 'suppressed' : 'discoverable'
  const afterState = desiredSuppressed ? 'suppressed' : 'discoverable'
  if (args.intent === 'suppress') {
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

  const updatedBusiness = await ctx.db.get(business._id)
  if (updatedBusiness === null) {
    throw new Error('business_missing_after_suppression_update')
  }

  const auditEvent = recordBusinessSuppressionAudit({
    eventId: auditEventId,
    eventType: auditEventType,
    membership: authority.membership,
    businessId: business._id,
    beforeState,
    afterState,
    reasonCode,
    evidenceRefs: args.evidenceRefs,
    operationKey,
    correlationId,
    now,
  })
  await persistAuditEvent(ctx.db, auditEvent)

  return {
    kind: 'ok',
    code: args.intent === 'suppress' ? 'business_suppressed' : 'business_unsuppressed',
    receipt: suppressionReceiptFromBusiness(
      updatedBusiness,
      args.intent === 'suppress' ? now : null,
      now,
    ),
    auditEvent: summarizeBusinessSuppressionAudit(auditEvent),
  }
}

export const setBusinessSuppression = mutationGeneric({
  args: {
    businessId: v.id('businesses'),
    intent: suppressionIntent,
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: setBusinessSuppressionResult,
  handler: setBusinessSuppressionHandler,
})

function suppressionReceiptFromBusiness(
  business: Doc<'businesses'>,
  suppressedAt: number | null,
  updatedAt: number,
) {
  return {
    businessId: String(business._id),
    publicStatus: business.publicStatus,
    suppressedAt,
    updatedAt,
  }
}

function recordBusinessSuppressionAudit(input: {
  eventId: AuditEventContract['eventId']
  eventType: 'business.suppressed' | 'business.unsuppressed'
  membership: AdminMembership
  businessId: Id<'businesses'>
  beforeState: string
  afterState: string
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: string
  correlationId: string
  now: number
}): AuditEventContract {
  const redactedPayload = {
    evidenceCount: input.evidenceRefs.length,
    reasonCode: input.reasonCode,
    intent: input.eventType === 'business.suppressed' ? 'suppress' : 'unsuppress',
  }
  const validation = validateAuditEvent({
    eventId: input.eventId,
    eventType: input.eventType,
    actorKind: 'admin',
    actorRef: input.membership.clerkUserId,
    targetType: 'business',
    targetRef: String(input.businessId),
    businessId: brandNonEmpty(String(input.businessId), 'BusinessId'),
    idempotencyKey: brandNonEmpty(input.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationId, 'CorrelationId'),
    beforeState: input.beforeState,
    afterState: input.afterState,
    reasonCode: input.reasonCode,
    evidenceRefs: input.evidenceRefs,
    redactedPayload,
    payloadHash: canonicalDigest(redactedPayload),
    createdAt: input.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid business suppression audit event: ${validation.reason}`)
  }

  return validation.event
}

function hasEvidence(evidenceRefs: readonly string[]): boolean {
  return evidenceRefs.some((evidenceRef) => evidenceRef.trim().length > 0)
}
