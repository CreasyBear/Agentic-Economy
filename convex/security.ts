import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  loadPhaseOneSourceState,
  persistPhaseOneSourceState,
  runtimeDb,
} from './source-state'
import { readActiveAdminMembership } from './authz'
import { brandNonEmpty } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import { validateAuditEvent } from '../src/modules/observability/public'
import {
  bootstrapOwnerAdmin as bootstrapOwnerAdminModule,
  grantAdminMembership as grantAdminMembershipModule,
  openRemovalDispute as openRemovalDisputeModule,
  readAdminRouteShell,
  recordAdminActionDenied,
  requireAdminAuthority,
  revokeAdminMembership as revokeAdminMembershipModule,
} from '../src/modules/security/public'
import type { AuditEventContract } from '../src/modules/observability/public'
import type {
  AdminAction,
  AdminAuthorityState,
  AdminDecisionAudit,
  AdminMembership,
  AdminReadbackRow,
  AdminShellReadback,
  DisputeOpenCommand,
  DisputeRecord,
  DisputeSourceState,
} from '../src/modules/security/public'

const adminRole = v.union(v.literal('owner_admin'), v.literal('support'), v.literal('reviewer'))
const adminMembershipState = v.union(v.literal('active'), v.literal('revoked'), v.literal('suspended'))
const visibilityTargetType = v.union(v.literal('business'), v.literal('service'), v.literal('capability'))
const removalReason = v.union(
  v.literal('privacy_removal_requested'),
  v.literal('ownership_contested'),
  v.literal('duplicate_or_impersonation'),
  v.literal('unsafe_or_inaccurate')
)
const disputeStatus = v.union(v.literal('opened'), v.literal('updated'), v.literal('closed'), v.literal('contested'))
const adminReadbackSurface = v.union(
  v.literal('claims_queue'),
  v.literal('audit_events'),
  v.literal('index_health')
)
const adminReadbackDeniedReason = v.union(
  v.literal('missing_membership'),
  v.literal('inactive_membership'),
  v.literal('action_not_allowed')
)
const adminReadbackRowType = v.union(v.literal('claim'), v.literal('audit_event'), v.literal('index_surface'))
const adminReadbackRowState = v.union(
  v.literal('pending_review'),
  v.literal('no_source_rows'),
  v.literal('guarded'),
  v.literal('queued'),
  v.literal('indexed'),
  v.literal('degraded'),
  v.literal('stale'),
  v.literal('suppressed')
)
const adminReadbackRepairAction = v.union(
  v.literal('review_claim'),
  v.literal('inspect_audit'),
  v.literal('regenerate_projection'),
  v.literal('source_auth_required'),
  v.literal('no_repair_available')
)

const adminMembershipResult = v.object({
  clerkUserId: v.string(),
  role: adminRole,
  state: adminMembershipState,
  grantedBy: v.string(),
  grantedAt: v.number(),
  revokedBy: v.optional(v.string()),
  revokedAt: v.optional(v.number()),
  evidenceRef: v.optional(v.string()),
})

const auditSummaryResult = v.object({
  eventType: v.union(
    v.literal('admin.membership_bootstrapped'),
    v.literal('admin.membership_granted'),
    v.literal('admin.membership_revoked'),
    v.literal('admin.action_denied'),
    v.literal('dispute.closed')
  ),
  actorRef: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  reasonCode: v.optional(v.string()),
})

const membershipAuditSummaryResult = v.object({
  eventType: v.union(
    v.literal('membership_bootstrapped'),
    v.literal('membership_granted'),
    v.literal('membership_revoked'),
    v.literal('action_denied')
  ),
  actorRef: v.string(),
  targetRef: v.string(),
  reasonCode: v.string(),
})

const adminMutationErrorResult = v.object({
  kind: v.literal('error'),
  code: v.union(
    v.literal('admin_bootstrap_denied'),
    v.literal('admin_action_denied'),
    v.literal('admin_membership_not_found'),
    v.literal('admin_invalid_reason'),
    v.literal('admin_missing_evidence')
  ),
  retryable: v.boolean(),
  reason: v.string(),
  auditEvent: v.optional(auditSummaryResult),
  membershipAuditEvent: v.optional(membershipAuditSummaryResult),
})

const adminMutationOkResult = v.object({
  kind: v.literal('ok'),
  code: v.union(
    v.literal('admin_membership_bootstrapped'),
    v.literal('admin_membership_granted'),
    v.literal('admin_membership_revoked')
  ),
  membership: adminMembershipResult,
  auditEvent: auditSummaryResult,
  membershipAuditEvent: membershipAuditSummaryResult,
})

const adminMutationResult = v.union(adminMutationOkResult, adminMutationErrorResult)

const adminReadbackRowResult = v.object({
  rowId: v.string(),
  rowType: adminReadbackRowType,
  objectRef: v.string(),
  rowState: adminReadbackRowState,
  surface: adminReadbackSurface,
  readbackState: v.union(
    v.literal('not_queued'),
    v.literal('available'),
    v.literal('guarded'),
    v.literal('unavailable')
  ),
  repairAction: adminReadbackRepairAction,
  repairResult: v.optional(v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed'))),
  affectedPublicSurfaces: v.optional(v.array(v.string())),
  correlationId: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  updatedAt: v.number(),
})

const adminReadbackDeniedResult = v.object({
  kind: v.literal('denied'),
  httpStatus: v.union(v.literal(401), v.literal(403)),
  reason: adminReadbackDeniedReason,
  surface: adminReadbackSurface,
  generatedAt: v.number(),
  publicMessage: v.string(),
  rows: v.array(adminReadbackRowResult),
})

const adminReadbackAllowedResult = v.object({
  kind: v.literal('allowed'),
  httpStatus: v.literal(200),
  surface: adminReadbackSurface,
  generatedAt: v.number(),
  actorRef: v.string(),
  summary: v.object({
    queued: v.number(),
    attention: v.number(),
    stale: v.number(),
    suppressed: v.number(),
  }),
  rows: v.array(adminReadbackRowResult),
})

const adminReadbackResult = v.union(adminReadbackDeniedResult, adminReadbackAllowedResult)

const disputeReceiptResult = v.object({
  disputeId: v.string(),
  status: disputeStatus,
  targetType: visibilityTargetType,
  targetRef: v.string(),
  reasonCode: removalReason,
  evidenceHash: v.string(),
  requestCount: v.number(),
  updatedAt: v.number(),
})

const openDisputeResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(
      v.literal('dispute_opened'),
      v.literal('dispute_open_replayed'),
      v.literal('dispute_open_updated')
    ),
    receipt: disputeReceiptResult,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('dispute_csrf_rejected'),
      v.literal('dispute_rate_limited'),
      v.literal('dispute_invalid_contact'),
      v.literal('dispute_invalid_target'),
      v.literal('dispute_invalid_reason'),
      v.literal('dispute_invalid_evidence')
    ),
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const closeDisputeResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('dispute_closed'),
    receipt: disputeReceiptResult,
    auditEvent: auditSummaryResult,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('admin_action_denied'),
      v.literal('admin_invalid_reason'),
      v.literal('admin_missing_evidence'),
      v.literal('dispute_not_found')
    ),
    retryable: v.boolean(),
    reason: v.string(),
    auditEvent: v.optional(auditSummaryResult),
    membershipAuditEvent: v.optional(membershipAuditSummaryResult),
  })
)

type RuntimeMutationCtx = {
  db: object
  auth: { getUserIdentity: () => Promise<UserIdentity | null> }
}

type RuntimeQueryCtx = RuntimeMutationCtx

export const bootstrapOwnerAdmin = mutationGeneric({
  args: {
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: adminMutationResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const identity = await ctx.auth.getUserIdentity()
    const state = adminAuthorityState(source)
    const result = bootstrapOwnerAdminModule(state, {
      clerkUserId: identity?.subject ?? 'anonymous',
      authorizedClerkUserIds: bootstrapPrincipalIds(),
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      now: Date.now(),
    })

    await persistPhaseOneSourceState(db, source)
    return summarizeAdminMutation(result)
  },
})

export const grantAdminMembership = mutationGeneric({
  args: {
    targetClerkUserId: v.string(),
    role: adminRole,
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: adminMutationResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const actorMembership = await readCurrentActiveMembership(ctx)
    const result = grantAdminMembershipModule(adminAuthorityState(source), {
      actorMembership,
      targetClerkUserId: args.targetClerkUserId,
      role: args.role,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      now: Date.now(),
    })

    await persistPhaseOneSourceState(db, source)
    return summarizeAdminMutation(result)
  },
})

export const revokeAdminMembership = mutationGeneric({
  args: {
    targetClerkUserId: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: adminMutationResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const actorMembership = await readCurrentActiveMembership(ctx)
    const result = revokeAdminMembershipModule(adminAuthorityState(source), {
      actorMembership,
      targetClerkUserId: args.targetClerkUserId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      now: Date.now(),
    })

    await persistPhaseOneSourceState(db, source)
    return summarizeAdminMutation(result)
  },
})

export const readAdminClaims = queryGeneric({
  args: {},
  returns: adminReadbackResult,
  handler: async (ctx) => readAdminRows(ctx, 'claims_queue', (source, now) => buildClaimRows(source, now)),
})

export const readAdminAuditEvents = queryGeneric({
  args: {},
  returns: adminReadbackResult,
  handler: async (ctx) => readAdminRows(ctx, 'audit_events', (source, now) => buildAuditRows(source, now)),
})

export const readAdminIndexHealth = queryGeneric({
  args: {},
  returns: adminReadbackResult,
  handler: async (ctx) => readAdminRows(ctx, 'index_health', (source, now) => buildIndexRows(source, now)),
})

export const openRemovalDispute = mutationGeneric({
  args: {
    businessId: v.string(),
    targetType: visibilityTargetType,
    targetRef: v.string(),
    reasonCode: removalReason,
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contactName: v.optional(v.string()),
    evidence: v.array(
      v.object({
        label: v.string(),
        mediaType: v.union(
          v.literal('text/plain'),
          v.literal('image/jpeg'),
          v.literal('image/png'),
          v.literal('application/pdf')
        ),
        byteLength: v.number(),
        privateRef: v.string(),
      })
    ),
    publicMessage: v.optional(v.string()),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: openDisputeResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const state = disputeSourceState(source)
    const result = openRemovalDisputeModule(state, {
      businessId: brandNonEmpty(args.businessId, 'BusinessId'),
      targetType: args.targetType,
      targetRef: args.targetRef,
      reasonCode: args.reasonCode,
      contact: {
        ...(args.contactEmail === undefined ? {} : { email: args.contactEmail }),
        ...(args.contactPhone === undefined ? {} : { phone: args.contactPhone }),
        ...(args.contactName === undefined ? {} : { name: args.contactName }),
      },
      evidence: args.evidence,
      ...(args.publicMessage === undefined ? {} : { publicMessage: args.publicMessage }),
      security: {
        csrf: {
          ...(args.csrfToken === undefined ? {} : { csrfToken: args.csrfToken }),
          ...(args.csrfCookie === undefined ? {} : { csrfCookie: args.csrfCookie }),
          ...(args.origin === undefined ? {} : { origin: args.origin }),
          allowedOrigins: sourceAllowedOrigins(),
        },
        rateLimit: {
          scope: 'dispute_open',
          key: disputeRateLimitKey(args),
          now: Date.now(),
          limit: 3,
          windowMs: 60_000,
        },
      },
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
    })

    await persistPhaseOneSourceState(db, source)
    return result.kind === 'ok'
      ? { kind: 'ok' as const, code: result.code, receipt: result.receipt }
      : result
  },
})

export const closeRemovalDispute = mutationGeneric({
  args: {
    disputeId: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: closeDisputeResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const actorMembership = await readCurrentActiveMembership(ctx)
    const authority = requireAdminAuthority(actorMembership, 'close_dispute')
    if (authority.kind === 'denied') {
      const denied = recordAdminActionDenied(adminAuthorityState(source), {
        actorMembership,
        action: 'close_dispute',
        targetType: 'dispute',
        targetRef: args.disputeId,
        reasonCode: authority.reason,
        evidenceRefs: args.evidenceRefs,
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        now: Date.now(),
      })
      await persistPhaseOneSourceState(db, source)
      return {
        kind: 'error' as const,
        code: 'admin_action_denied' as const,
        retryable: false,
        reason: authority.reason,
        auditEvent: summarizeAudit(denied.auditEvent),
        membershipAuditEvent: summarizeMembershipAudit(denied.membershipAuditEvent),
      }
    }

    const reasonCode = args.reasonCode.trim()
    if (reasonCode.length === 0) {
      return {
        kind: 'error' as const,
        code: 'admin_invalid_reason' as const,
        retryable: false,
        reason: 'admin_action_requires_reason',
      }
    }

    if (!hasEvidence(args.evidenceRefs)) {
      return {
        kind: 'error' as const,
        code: 'admin_missing_evidence' as const,
        retryable: false,
        reason: 'admin_action_requires_evidence',
      }
    }

    const dispute = source.security.disputes.find((candidate) => stringField(candidate, 'disputeId') === args.disputeId) as
      | DisputeRecord
      | undefined
    if (dispute === undefined) {
      return {
        kind: 'error' as const,
        code: 'dispute_not_found' as const,
        retryable: false,
        reason: 'dispute_not_found',
      }
    }

    const beforeState = dispute.status
    dispute.status = 'closed'
    dispute.updatedAt = Date.now()
    const auditEvent = recordDisputeClosedAudit(dispute, authority.membership, {
      beforeState,
      reasonCode,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      now: dispute.updatedAt,
    })
    source.observability.auditEvents.push(auditEvent)
    await persistPhaseOneSourceState(db, source)

    return {
      kind: 'ok' as const,
      code: 'dispute_closed' as const,
      receipt: disputeReceipt(dispute),
      auditEvent: summarizeAudit(auditEvent),
    }
  },
})

async function readAdminRows(
  ctx: RuntimeQueryCtx,
  surface: 'claims_queue' | 'audit_events' | 'index_health',
  buildRows: (source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>, now: number) => readonly AdminReadbackRow[]
) {
  const db = runtimeDb(ctx.db)
  const now = Date.now()
  const source = await loadPhaseOneSourceState(db)
  const membership = await readCurrentActiveMembership(ctx)
  return summarizeAdminReadback(readAdminRouteShell({
    membership,
    surface,
    rows: buildRows(source, now),
    now,
  }))
}

function buildClaimRows(
  source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>,
  now: number
): readonly AdminReadbackRow[] {
  const claimRows = source.business.claims.map((claim) => ({
    rowId: `row:claim:${stringField(claim, 'claimId')}`,
    rowType: 'claim' as const,
    objectRef: `claim:${stringField(claim, 'slug')}:${stringField(claim, 'status')}`,
    rowState: claimRowState(stringField(claim, 'status')),
    surface: 'claims_queue' as const,
    readbackState: 'available' as const,
    repairAction: 'review_claim' as const,
    updatedAt: numberField(claim, 'updatedAt') || now,
  }))
  const disputeRows = source.security.disputes.map((dispute) => ({
    rowId: `row:dispute:${stringField(dispute, 'disputeId')}`,
    rowType: 'claim' as const,
    objectRef: `dispute:${stringField(dispute, 'targetType')}:${stringField(dispute, 'status')}`,
    rowState: claimRowState(stringField(dispute, 'status')),
    surface: 'claims_queue' as const,
    readbackState: 'available' as const,
    repairAction: 'review_claim' as const,
    updatedAt: numberField(dispute, 'updatedAt') || now,
  }))

  return [...claimRows, ...disputeRows]
}

function buildAuditRows(
  source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>,
  now: number
): readonly AdminReadbackRow[] {
  return source.observability.auditEvents.map((event) => {
    const correlationId = optionalStringField(event, 'correlationId')
    return {
      rowId: `row:audit:${stringField(event, 'eventId')}`,
      rowType: 'audit_event' as const,
      objectRef: `audit:${stringField(event, 'eventType')}:${stringField(event, 'targetType')}`,
      rowState: 'guarded' as const,
      surface: 'audit_events' as const,
      readbackState: 'available' as const,
      repairAction: 'inspect_audit' as const,
      ...(correlationId === undefined ? {} : { correlationId }),
      updatedAt: numberField(event, 'createdAt') || now,
    }
  })
}

function buildIndexRows(
  source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>,
  now: number
): readonly AdminReadbackRow[] {
  const attemptRows = source.registry.registryProjectionAttempts.map((attempt) => {
    const correlationId = optionalStringField(attempt, 'sourceHash')
    const attemptRef = optionalStringField(attempt, 'logicalKey')
    const succeeded = stringField(attempt, 'status') === 'succeeded'
    return {
      rowId: `row:index:attempt:${stringField(attempt, 'logicalKey')}`,
      rowType: 'index_surface' as const,
      objectRef: `registry:${stringField(attempt, 'status')}:${stringField(attempt, 'targetSurface')}`,
      rowState: indexRowState(stringField(attempt, 'status')),
      surface: 'index_health' as const,
      readbackState: succeeded ? 'available' as const : 'unavailable' as const,
      repairAction: succeeded ? 'no_repair_available' as const : 'regenerate_projection' as const,
      repairResult: succeeded ? 'succeeded' as const : 'failed' as const,
      affectedPublicSurfaces: ['/registry', '/api/businesses', '/api/businesses/search', '/api/businesses/{slug}'],
      ...(correlationId === undefined ? {} : { correlationId }),
      ...(attemptRef === undefined ? {} : { attemptRef }),
      updatedAt: numberField(attempt, 'finishedAt') || numberField(attempt, 'startedAt') || now,
    }
  })

  if (attemptRows.length > 0) {
    return attemptRows
  }

  return [
    {
      rowId: 'row:index:source-catalog',
      rowType: 'index_surface',
      objectRef: source.business.businesses.length === 0 ? 'source:catalog:none' : 'source:catalog:available',
      rowState: source.business.businesses.length === 0 ? 'no_source_rows' : 'queued',
      surface: 'index_health',
      readbackState: source.business.businesses.length === 0 ? 'not_queued' : 'guarded',
      repairAction: source.business.businesses.length === 0 ? 'source_auth_required' : 'regenerate_projection',
      repairResult: 'not_run',
      updatedAt: now,
    },
  ]
}

function adminAuthorityState(source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>): AdminAuthorityState {
  return {
    adminMemberships: source.security.adminMemberships as AdminMembership[],
    adminMembershipAuditEvents: source.security.adminMembershipAuditEvents as AdminDecisionAudit[],
    auditEvents: source.observability.auditEvents as AuditEventContract[],
  }
}

function disputeSourceState(source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>): DisputeSourceState {
  return {
    disputes: source.security.disputes as DisputeRecord[],
    abuseRateLimitBuckets: source.business.abuseRateLimitBuckets as DisputeSourceState['abuseRateLimitBuckets'],
    auditEvents: source.observability.auditEvents as AuditEventContract[],
  }
}

async function readCurrentActiveMembership(ctx: RuntimeMutationCtx): Promise<AdminMembership | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  return identity === null ? undefined : readActiveAdminMembership(runtimeDb(ctx.db), identity.subject)
}

function summarizeAdminMutation(
  result: ReturnType<typeof bootstrapOwnerAdminModule> | ReturnType<typeof grantAdminMembershipModule>
) {
  if (result.kind === 'ok') {
    return {
      kind: 'ok' as const,
      code: result.code,
      membership: result.membership,
      auditEvent: summarizeAudit(result.auditEvent),
      membershipAuditEvent: summarizeMembershipAudit(result.membershipAuditEvent),
    }
  }

  return {
    kind: 'error' as const,
    code: result.code,
    retryable: result.retryable,
    reason: result.reason,
    ...(result.auditEvent === undefined ? {} : { auditEvent: summarizeAudit(result.auditEvent) }),
    ...(result.membershipAuditEvent === undefined
      ? {}
      : { membershipAuditEvent: summarizeMembershipAudit(result.membershipAuditEvent) }),
  }
}

function summarizeAdminReadback(readback: AdminShellReadback) {
  const rows = readback.rows.map(summarizeAdminReadbackRow)
  if (readback.kind === 'allowed') {
    return {
      kind: 'allowed' as const,
      httpStatus: readback.httpStatus,
      surface: readback.surface,
      generatedAt: readback.generatedAt,
      actorRef: readback.actorRef,
      summary: readback.summary,
      rows,
    }
  }

  return {
    kind: 'denied' as const,
    httpStatus: readback.httpStatus,
    reason: readback.reason,
    surface: readback.surface,
    generatedAt: readback.generatedAt,
    publicMessage: readback.publicMessage,
    rows,
  }
}

function summarizeAdminReadbackRow(row: AdminReadbackRow) {
  return {
    rowId: row.rowId,
    rowType: row.rowType,
    objectRef: row.objectRef,
    rowState: row.rowState,
    surface: row.surface,
    readbackState: row.readbackState,
    repairAction: row.repairAction,
    ...(row.repairResult === undefined ? {} : { repairResult: row.repairResult }),
    ...(row.affectedPublicSurfaces === undefined ? {} : { affectedPublicSurfaces: [...row.affectedPublicSurfaces] }),
    ...(row.correlationId === undefined ? {} : { correlationId: row.correlationId }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    updatedAt: row.updatedAt,
  }
}

function summarizeAudit(event: AuditEventContract) {
  return {
    eventType: event.eventType as
      | 'admin.membership_bootstrapped'
      | 'admin.membership_granted'
      | 'admin.membership_revoked'
      | 'admin.action_denied'
      | 'dispute.closed',
    actorRef: event.actorRef,
    targetRef: event.targetRef,
    ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
    ...(event.afterState === undefined ? {} : { afterState: event.afterState }),
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
  }
}

function summarizeMembershipAudit(event: AdminDecisionAudit) {
  const eventType:
    | 'membership_bootstrapped'
    | 'membership_granted'
    | 'membership_revoked'
    | 'action_denied' = event.eventType === 'break_glass_used' ? 'action_denied' : event.eventType

  return {
    eventType,
    actorRef: event.actorRef,
    targetRef: event.targetRef,
    reasonCode: event.reasonCode,
  }
}

function recordDisputeClosedAudit(
  dispute: DisputeRecord,
  membership: AdminMembership,
  input: {
    beforeState: string
    reasonCode: string
    evidenceRefs: readonly string[]
    operationKey: string
    correlationId: string
    now: number
  }
): AuditEventContract {
  const redactedPayload = {
    evidenceCount: input.evidenceRefs.length,
    reasonCode: input.reasonCode,
    requestCount: dispute.requestCount,
    targetType: dispute.targetType,
  }
  const validation = validateAuditEvent({
    eventId: brandNonEmpty(`audit:dispute.closed:${dispute.disputeId}:${input.operationKey}`, 'AuditEventId'),
    eventType: 'dispute.closed',
    actorKind: 'admin',
    actorRef: membership.clerkUserId,
    targetType: 'dispute',
    targetRef: dispute.disputeId,
    businessId: dispute.businessId,
    idempotencyKey: brandNonEmpty(input.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationId, 'CorrelationId'),
    beforeState: input.beforeState,
    afterState: 'closed',
    reasonCode: input.reasonCode,
    evidenceRefs: input.evidenceRefs,
    redactedPayload,
    payloadHash: stableHash(redactedPayload),
    createdAt: input.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid dispute close audit event: ${validation.reason}`)
  }

  return validation.event
}

function disputeReceipt(dispute: DisputeRecord) {
  return {
    disputeId: dispute.disputeId,
    status: dispute.status,
    targetType: dispute.targetType,
    targetRef: dispute.targetRef,
    reasonCode: dispute.reasonCode,
    evidenceHash: dispute.evidenceHash,
    requestCount: dispute.requestCount,
    updatedAt: dispute.updatedAt,
  }
}

function bootstrapPrincipalIds(): readonly string[] {
  return envList('ADMIN_BOOTSTRAP_PRINCIPAL_IDS')
}

function sourceAllowedOrigins(): readonly string[] {
  const origins = [
    ...envList('AE_ALLOWED_ORIGINS'),
    ...envList('VITE_AE_ALLOWED_ORIGINS'),
    ...envList('SITE_URL'),
    ...envList('VITE_SITE_URL'),
  ]
  return ['https://ae.example', ...origins.filter((origin) => origin !== 'https://ae.example')]
}

function envList(name: string): string[] {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  return value === undefined ? [] : value.split(',').map((item) => item.trim()).filter(Boolean)
}

function disputeRateLimitKey(args: {
  targetRef: string
  contactEmail?: string
  contactPhone?: string
  contactName?: string
}): string {
  return `removal:${stableHash({
    email: args.contactEmail?.toLowerCase().trim() ?? null,
    name: args.contactName?.trim() ?? null,
    phone: args.contactPhone?.trim() ?? null,
    targetRef: args.targetRef,
  })}`
}

function claimRowState(value: string): AdminReadbackRow['rowState'] {
  if (value === 'suppressed') {
    return 'suppressed'
  }
  if (value === 'opened' || value === 'updated' || value === 'contested' || value === 'disputed') {
    return 'pending_review'
  }
  return 'guarded'
}

function indexRowState(value: string): AdminReadbackRow['rowState'] {
  if (value === 'succeeded') {
    return 'indexed'
  }
  if (value === 'failed') {
    return 'degraded'
  }
  if (value === 'stale') {
    return 'stale'
  }
  return 'queued'
}

function hasEvidence(evidenceRefs: readonly string[]): boolean {
  return evidenceRefs.some((evidenceRef) => evidenceRef.trim().length > 0)
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  return typeof value === 'string' ? value : ''
}

function optionalStringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' ? value : undefined
}

function numberField(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  return typeof value === 'number' ? value : 0
}

export type {
  AdminAction,
  AdminAuthorityState,
  AdminDecisionAudit,
  AdminMembership,
  AdminRole,
  DisputeOpenCommand,
  DisputeRecord,
  DisputeSourceState,
} from '../src/modules/security/public'
