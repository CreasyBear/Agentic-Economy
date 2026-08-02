import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { readCurrentActiveAdminMembership as readCurrentActiveMembership } from './authz'
import { admissionKey, assertAdmission } from './lib/rateLimit'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { brandNonEmpty } from '../src/modules/common/ids'
import { literalUnion } from '../src/modules/common/convex-literals'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { validateAuditEvent } from '../src/modules/observability/public'
import {
  RemovalDisputeReasonCodeValues,
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
  DisputeOpenResult,
  DisputeRecord,
  DisputeSourceState,
  RemovalDisputeReasonCode,
} from '../src/modules/security/public'
const adminRole = v.union(v.literal('owner_admin'), v.literal('support'), v.literal('reviewer'))
const adminMembershipState = v.union(v.literal('active'), v.literal('revoked'), v.literal('suspended'))
const visibilityTargetType = v.union(v.literal('business'), v.literal('service'), v.literal('capability'))
const removalReason = literalUnion(RemovalDisputeReasonCodeValues)
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
  tokenIdentifier: v.string(),
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


export const bootstrapOwnerAdmin = mutationGeneric({
  args: {
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: adminMutationResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
    if (sourceWrite.kind === 'rejected') {
      return adminSourceWriteDenied(sourceWrite.reason)
    }

    const identity = await ctx.auth.getUserIdentity()
    const source = await loadAdminAuthoritySource(ctx.db, {
      includeActiveOwnerAdmins: true,
      ...(identity?.subject === undefined ? {} : { clerkUserIds: [identity.subject] }),
      ...(identity?.tokenIdentifier === undefined ? {} : { tokenIdentifiers: [identity.tokenIdentifier] }),
    })
    const clerkUserId = typeof identity?.subject === 'string' ? identity.subject : 'anonymous'
    const tokenIdentifier = typeof identity?.tokenIdentifier === 'string' ? identity.tokenIdentifier : ''
    if (
      bootstrapPrincipalIds().includes(clerkUserId)
      && tokenIdentifier.trim().length > 0
      && hasAdminMembershipConflict(source.adminMemberships, { clerkUserId, tokenIdentifier })
    ) {
      return summarizeAdminMutation({
        kind: 'error',
        code: 'admin_bootstrap_denied',
        retryable: false,
        reason: 'membership_conflict',
      })
    }

    const result = bootstrapOwnerAdminModule(adminAuthorityState(source), {
      clerkUserId,
      tokenIdentifier,
      authorizedClerkUserIds: bootstrapPrincipalIds(),
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      now: Date.now(),
    })

    await persistAdminAuthorityMutation(ctx.db, result)
    return summarizeAdminMutation(result)
  },
})

export const grantAdminMembership = mutationGeneric({
  args: {
    targetClerkUserId: v.string(),
    targetTokenIdentifier: v.string(),
    role: adminRole,
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: adminMutationResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
    if (sourceWrite.kind === 'rejected') {
      return adminSourceWriteDenied(sourceWrite.reason)
    }

    const [source, actorMembership] = await Promise.all([
      loadAdminAuthoritySource(ctx.db, {
        clerkUserIds: [args.targetClerkUserId],
        tokenIdentifiers: [args.targetTokenIdentifier],
      }),
      readCurrentActiveMembership(ctx),
    ])
    const command = {
      actorMembership,
      targetClerkUserId: args.targetClerkUserId,
      targetTokenIdentifier: args.targetTokenIdentifier,
      role: args.role,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      now: Date.now(),
    }
    if (requireAdminAuthority(actorMembership, 'manage_admin_membership').kind === 'denied') {
      const result = grantAdminMembershipModule(adminAuthorityState(source), command)
      await persistAdminAuthorityMutation(ctx.db, result)
      return summarizeAdminMutation(result)
    }
    if (
      typeof args.targetTokenIdentifier === 'string'
      && args.targetTokenIdentifier.trim().length > 0
      && hasAdminMembershipConflict(source.adminMemberships, {
        clerkUserId: args.targetClerkUserId,
        tokenIdentifier: args.targetTokenIdentifier,
      })
    ) {
      return summarizeAdminMutation({
        kind: 'error',
        code: 'admin_action_denied',
        retryable: false,
        reason: 'membership_conflict',
      })
    }

    const result = grantAdminMembershipModule(adminAuthorityState(source), command)
    await persistAdminAuthorityMutation(ctx.db, result)
    return summarizeAdminMutation(result)
  },
})


export const revokeAdminMembership = mutationGeneric({
  args: {
    targetClerkUserId: v.string(),
    targetTokenIdentifier: v.optional(v.string()),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: adminMutationResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
    if (sourceWrite.kind === 'rejected') {
      return adminSourceWriteDenied(sourceWrite.reason)
    }

    const [source, actorMembership] = await Promise.all([
      loadAdminAuthoritySource(ctx.db, {
        clerkUserIds: [args.targetClerkUserId],
        ...(args.targetTokenIdentifier === undefined ? {} : { tokenIdentifiers: [args.targetTokenIdentifier] }),
      }),
      readCurrentActiveMembership(ctx),
    ])
    const result = revokeAdminMembershipModule(adminAuthorityState(source), {
      actorMembership,
      targetClerkUserId: args.targetClerkUserId,
      ...(args.targetTokenIdentifier === undefined ? {} : { targetTokenIdentifier: args.targetTokenIdentifier }),
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      now: Date.now(),
    })

    await persistAdminAuthorityMutation(ctx.db, result)
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
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: openDisputeResult,
  handler: async (ctx, args) => {
    const admission = await assertAdmission(ctx, {
      name: 'dispute-open',
      key: await admissionKey(ctx, disputeRateLimitKey(args)),
    })
    if (!admission.ok) {
      return {
        kind: 'error' as const,
        code: 'dispute_rate_limited' as const,
        retryable: true,
        reason: `Retry after ${admission.retryAfter}.`,
      }
    }
    const sourceWrite = await requireSourceWrite(ctx, args, 'removal_dispute')
    if (sourceWrite.kind === 'rejected') {
      return {
        kind: 'error' as const,
        code: 'dispute_csrf_rejected' as const,
        retryable: false,
        reason: sourceWrite.reason,
      }
    }

    const businessId = brandNonEmpty(args.businessId, 'BusinessId')
    const operationKey = brandNonEmpty(args.operationKey, 'OperationKey')
    const correlationId = brandNonEmpty(args.correlationId, 'CorrelationId')
    const source = await loadDisputeSource(ctx.db, args.targetType, args.targetRef, operationKey)
    const state = disputeSourceState(source)
    const result = openRemovalDisputeModule(state, {
      businessId,
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
          ...sourceWrite.csrf,
        },
      },
      operationKey,
      correlationId,
      now: Date.now(),
    })
    await persistOpenedDispute(ctx.db, result)
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
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: closeDisputeResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
    if (sourceWrite.kind === 'rejected') {
      return {
        kind: 'error' as const,
        code: 'admin_action_denied' as const,
        retryable: false,
        reason: sourceWrite.reason,
      }
    }

    const operationKey = brandNonEmpty(args.operationKey, 'OperationKey')
    const correlationId = brandNonEmpty(args.correlationId, 'CorrelationId')
    const auditEventId = `audit:dispute.closed:${args.disputeId}:${operationKey}`
    const disputeSource = await loadDisputeByIdSource(ctx.db, args.disputeId, auditEventId)
    const disputeState = disputeSourceState(disputeSource)
    const actorMembership = await readCurrentActiveMembership(ctx)
    const authority = requireAdminAuthority(actorMembership, 'close_dispute')
    if (authority.kind === 'denied') {
      const denied = recordAdminActionDenied(
        { adminMemberships: [], adminMembershipAuditEvents: [], auditEvents: [] },
        {
          actorMembership,
          action: 'close_dispute',
          targetType: 'dispute',
          targetRef: args.disputeId,
          reasonCode: authority.reason,
          evidenceRefs: args.evidenceRefs,
          operationKey,
          correlationId,
          now: Date.now(),
        }
      )
      await persistAdminAuthorityMutation(ctx.db, denied)
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

    const dispute = disputeState.disputes.find((candidate) => candidate.disputeId === args.disputeId)
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
      operationKey,
      correlationId,
      now: dispute.updatedAt,
    })
    await persistClosedDispute(ctx.db, dispute, auditEvent)

    return {
      kind: 'ok' as const,
      code: 'dispute_closed' as const,
      receipt: disputeReceipt(dispute),
      auditEvent: summarizeAudit(auditEvent),
    }
  },
})

type AdminAuthorityReadSource = {
  adminMemberships: Doc<'adminMemberships'>[]
  adminMembershipAuditEvents: Doc<'adminMembershipAuditEvents'>[]
  auditEvents: Doc<'auditEvents'>[]
}

async function loadAdminAuthoritySource(
  db: QueryCtx['db'],
  options: {
    clerkUserIds?: readonly string[]
    tokenIdentifiers?: readonly string[]
    includeActiveOwnerAdmins?: boolean
  } = {},
): Promise<AdminAuthorityReadSource> {
  const reads: Promise<Doc<'adminMemberships'>[]>[] = []
  const states = ['active', 'revoked', 'suspended'] as const
  for (const clerkUserId of options.clerkUserIds ?? []) {
    for (const state of states) {
      reads.push(db.query('adminMemberships')
        .withIndex('by_clerkUserId_state', (query) => query.eq('clerkUserId', clerkUserId).eq('state', state))
        .take(2))
    }
  }
  for (const tokenIdentifier of options.tokenIdentifiers ?? []) {
    for (const state of states) {
      reads.push(db.query('adminMemberships')
        .withIndex('by_tokenIdentifier_state', (query) => query.eq('tokenIdentifier', tokenIdentifier).eq('state', state))
        .take(2))
    }
  }
  if (options.includeActiveOwnerAdmins === true) {
    reads.push(db.query('adminMemberships')
      .withIndex('by_state_and_role', (query) => query.eq('state', 'active').eq('role', 'owner_admin'))
      .take(2))
  }
  const rows = (await Promise.all(reads)).flat()
  const memberships = new Map<string, Doc<'adminMemberships'>>()
  for (const row of rows) {
    memberships.set(String(row._id), row)
  }
  return { adminMemberships: [...memberships.values()], adminMembershipAuditEvents: [], auditEvents: [] }
}

type DisputeReadSource = {
  disputes: Doc<'disputes'>[]
  auditEvents: Doc<'auditEvents'>[]
}

async function loadDisputeSource(
  db: QueryCtx['db'],
  targetType: string,
  targetRef: string,
  operationKey: string,
): Promise<DisputeReadSource> {
  const statuses = ['opened', 'updated', 'closed', 'contested'] as const
  const [operationRow, ...targetRows] = await Promise.all([
    db.query('disputes').withIndex('by_operation_key', (query) => query.eq('operationKey', operationKey)).unique(),
    ...statuses.map((status) => db.query('disputes')
      .withIndex('by_target_status', (query) => query.eq('targetType', targetType).eq('targetRef', targetRef).eq('status', status))
      .unique()),
  ])
  const disputes = new Map<string, Doc<'disputes'>>()
  for (const row of [operationRow, ...targetRows]) {
    if (row !== null) disputes.set(String(row._id), row)
  }
  return { disputes: [...disputes.values()], auditEvents: [] }
}

async function loadDisputeByIdSource(
  db: QueryCtx['db'],
  disputeId: string,
  auditEventId: string,
): Promise<DisputeReadSource> {
  const id = db.normalizeId('disputes', disputeId)
  const [dispute, auditEvent] = await Promise.all([
    id === null ? Promise.resolve(null) : db.get(id),
    db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', auditEventId)).unique(),
  ])
  return {
    disputes: dispute === null ? [] : [dispute],
    auditEvents: auditEvent === null ? [] : [auditEvent],
  }
}

type AdminReadbackSource = {
  claims: Doc<'claims'>[]
  disputes: Doc<'disputes'>[]
  auditEvents: Doc<'auditEvents'>[]
  registryProjectionAttempts: Doc<'registryProjectionAttempts'>[]
  businesses: Doc<'businesses'>[]
}

const ADMIN_READBACK_ROW_CAP = 100

async function readAdminRows(
  ctx: QueryCtx,
  surface: 'claims_queue' | 'audit_events' | 'index_health',
  buildRows: (source: AdminReadbackSource, now: number) => readonly AdminReadbackRow[]
) {
  const now = Date.now()
  const membership = await readCurrentActiveMembership(ctx)
  const denied = readAdminRouteShell({ membership, surface, rows: [], now })
  if (denied.kind === 'denied') {
    return summarizeAdminReadback(denied)
  }

  const source = await readAdminReadbackSource(ctx.db, surface)
  return summarizeAdminReadback(readAdminRouteShell({
    membership,
    surface,
    rows: buildRows(source, now),
    now,
  }))
}

async function readAdminReadbackSource(
  db: QueryCtx['db'],
  surface: 'claims_queue' | 'audit_events' | 'index_health'
): Promise<AdminReadbackSource> {
  if (surface === 'claims_queue') {
    const [claims, disputes] = await Promise.all([
      db.query('claims').order('desc').take(ADMIN_READBACK_ROW_CAP),
      db.query('disputes').order('desc').take(ADMIN_READBACK_ROW_CAP),
    ])
    return { claims, disputes, auditEvents: [], registryProjectionAttempts: [], businesses: [] }
  }

  if (surface === 'audit_events') {
    return {
      claims: [],
      disputes: [],
      auditEvents: await db.query('auditEvents').order('desc').take(ADMIN_READBACK_ROW_CAP),
      registryProjectionAttempts: [],
      businesses: [],
    }
  }

  const [registryProjectionAttempts, business] = await Promise.all([
    db.query('registryProjectionAttempts').order('desc').take(ADMIN_READBACK_ROW_CAP),
    db.query('businesses').first(),
  ])
  const businesses = business === null ? [] : [business]
  return { claims: [], disputes: [], auditEvents: [], registryProjectionAttempts, businesses }
}

function buildClaimRows(
  source: AdminReadbackSource,
  now: number
): readonly AdminReadbackRow[] {
  const claimRows = source.claims.map((claim) => ({
    rowId: `row:claim:${claim._id}`,
    rowType: 'claim' as const,
    objectRef: `claim:${claim.slug}:${claim.status}`,
    rowState: claimRowState(claim.status),
    surface: 'claims_queue' as const,
    readbackState: 'available' as const,
    repairAction: 'review_claim' as const,
    updatedAt: claim.updatedAt || now,
  }))
  const disputeRows = source.disputes.map((dispute) => ({
    rowId: `row:dispute:${dispute._id}`,
    rowType: 'claim' as const,
    objectRef: `dispute:${dispute.targetType}:${dispute.status}`,
    rowState: claimRowState(dispute.status),
    surface: 'claims_queue' as const,
    readbackState: 'available' as const,
    repairAction: 'review_claim' as const,
    updatedAt: dispute.updatedAt || now,
  }))

  return [...claimRows, ...disputeRows]
}

function buildAuditRows(
  source: AdminReadbackSource,
  now: number
): readonly AdminReadbackRow[] {
  return source.auditEvents.map((event) => ({
    rowId: `row:audit:${event.eventId}`,
    rowType: 'audit_event' as const,
    objectRef: `audit:${event.eventType}:${event.targetType}`,
    rowState: 'guarded' as const,
    surface: 'audit_events' as const,
    readbackState: 'available' as const,
    repairAction: 'inspect_audit' as const,
    correlationId: event.correlationId,
    updatedAt: event.createdAt || now,
  }))
}

function buildIndexRows(
  source: AdminReadbackSource,
  now: number
): readonly AdminReadbackRow[] {
  const attemptRows = source.registryProjectionAttempts.map((attempt) => {
    const succeeded = attempt.status === 'succeeded'
    return {
      rowId: `row:index:attempt:${attempt.logicalKey}`,
      rowType: 'index_surface' as const,
      objectRef: `registry:${attempt.status}:${attempt.projectionKind}`,
      rowState: indexRowState(attempt.status),
      surface: 'index_health' as const,
      readbackState: succeeded ? 'available' as const : 'unavailable' as const,
      repairAction: succeeded ? 'no_repair_available' as const : 'regenerate_projection' as const,
      repairResult: succeeded ? 'succeeded' as const : 'failed' as const,
      affectedPublicSurfaces: ['/api/businesses', '/api/businesses/search', '/api/businesses/{slug}'],
      correlationId: attempt.sourceHash,
      attemptRef: attempt.logicalKey,
      updatedAt: attempt.finishedAt ?? attempt.startedAt,
    }
  })

  if (attemptRows.length > 0) {
    return attemptRows
  }

  return [
    {
      rowId: 'row:index:source-catalog',
      rowType: 'index_surface' as const,
      objectRef: source.businesses.length === 0 ? 'source:catalog:none' : 'source:catalog:available',
      rowState: source.businesses.length === 0 ? 'no_source_rows' as const : 'queued' as const,
      surface: 'index_health' as const,
      readbackState: source.businesses.length === 0 ? 'not_queued' as const : 'guarded' as const,
      repairAction: source.businesses.length === 0 ? 'source_auth_required' as const : 'regenerate_projection' as const,
      repairResult: 'not_run' as const,
      updatedAt: now,
    },
  ]
}
type AdminMembershipTarget = Pick<AdminMembership, 'clerkUserId' | 'tokenIdentifier'>

function hasAdminMembershipConflict(
  rows: readonly Doc<'adminMemberships'>[],
  target: AdminMembershipTarget,
): boolean {
  const activeRows = rows.filter((row) => row.clerkUserId === target.clerkUserId && row.state === 'active')
  if (activeRows.length > 1) {
    return true
  }

  const active = activeRows[0]
  if (
    active !== undefined
    && active.tokenIdentifier !== undefined
    && (
      typeof active.tokenIdentifier !== 'string'
      || active.tokenIdentifier.trim().length === 0
      || active.tokenIdentifier !== target.tokenIdentifier
    )
  ) {
    return true
  }

  const tokenRows = rows.filter((row) => row.tokenIdentifier === target.tokenIdentifier)
  if (tokenRows.length > 1) {
    return true
  }
  return rows.some((row) => (
    row.tokenIdentifier === target.tokenIdentifier
    && row.clerkUserId !== target.clerkUserId
  ))
}

type AdminAuthorityWriteResult = {
  membership?: AdminMembership
  auditEvent?: AuditEventContract
  membershipAuditEvent?: AdminDecisionAudit
}

async function persistAdminAuthorityMutation(
  db: MutationCtx['db'],
  result: AdminAuthorityWriteResult,
): Promise<void> {
  if (result.membership !== undefined) {
    const document = adminMembershipDocument(result.membership)
    const lookup = await findAdminMembershipDocument(db, result.membership)
    if (lookup.kind === 'conflict') {
      throw new Error('admin_membership_conflict')
    }
    if (lookup.kind === 'missing') {
      await db.insert('adminMemberships', document)
    } else {
      await db.replace(lookup.row._id, document)
    }
  }

  if (result.auditEvent !== undefined) {
    await persistAuditEvent(db, result.auditEvent)
  }

  if (result.membershipAuditEvent !== undefined) {
    const membershipAuditEvent = result.membershipAuditEvent
    const existing = await db
      .query('adminMembershipAuditEvents')
      .withIndex('by_auditEventId', (builder) =>
        builder.eq('auditEventId', membershipAuditEvent.auditEventId)
      )
      .unique()
    if (existing === null) {
      await db.insert('adminMembershipAuditEvents', {
        auditEventId: membershipAuditEvent.auditEventId,
        eventType: membershipAuditEvent.eventType,
        actorRef: membershipAuditEvent.actorRef,
        targetRef: membershipAuditEvent.targetRef,
        reasonCode: membershipAuditEvent.reasonCode,
        evidenceRefs: [...membershipAuditEvent.evidenceRefs],
        operationKey: membershipAuditEvent.operationKey,
        correlationId: membershipAuditEvent.correlationId,
        createdAt: membershipAuditEvent.createdAt,
      })
    }
  }
}

type AdminMembershipLookup =
  | { kind: 'missing' }
  | { kind: 'found'; row: Doc<'adminMemberships'> }
  | { kind: 'conflict' }

async function findAdminMembershipDocument(
  db: MutationCtx['db'],
  target: AdminMembershipTarget,
): Promise<AdminMembershipLookup> {
  const activeRows = await db
    .query('adminMemberships')
    .withIndex('by_clerkUserId_state', (builder) =>
      builder.eq('clerkUserId', target.clerkUserId).eq('state', 'active')
    )
    .take(2)
  if (activeRows.length > 1) {
    return { kind: 'conflict' }
  }

  const tokenRows: Doc<'adminMemberships'>[] = []
  for (const state of ['active', 'revoked', 'suspended'] as const) {
    const rows = await db
      .query('adminMemberships')
      .withIndex('by_tokenIdentifier_state', (builder) =>
        builder.eq('tokenIdentifier', target.tokenIdentifier).eq('state', state)
      )
      .take(2)
    if (rows.length > 1) {
      return { kind: 'conflict' }
    }
    tokenRows.push(...rows)
  }
  if (tokenRows.length > 1) {
    return { kind: 'conflict' }
  }

  if (tokenRows.some((row) => row.clerkUserId !== target.clerkUserId)) {
    return { kind: 'conflict' }
  }

  const active = activeRows[0]
  if (active !== undefined) {
    if (
      active.tokenIdentifier !== undefined
      && (
        typeof active.tokenIdentifier !== 'string'
        || active.tokenIdentifier.trim().length === 0
        || active.tokenIdentifier !== target.tokenIdentifier
      )
    ) {
      return { kind: 'conflict' }
    }
    return { kind: 'found', row: active }
  }

  const byToken = tokenRows.find((row) => row.tokenIdentifier === target.tokenIdentifier)
  return byToken === undefined ? { kind: 'missing' } : { kind: 'found', row: byToken }
}

function adminMembershipDocument(membership: AdminMembership) {
  return {
    clerkUserId: membership.clerkUserId,
    tokenIdentifier: membership.tokenIdentifier,
    role: membership.role,
    state: membership.state,
    grantedBy: membership.grantedBy,
    grantedAt: membership.grantedAt,
    ...(membership.revokedBy === undefined ? {} : { revokedBy: membership.revokedBy }),
    ...(membership.revokedAt === undefined ? {} : { revokedAt: membership.revokedAt }),
    ...(membership.evidenceRef === undefined ? {} : { evidenceRef: membership.evidenceRef }),
  }
}

async function persistOpenedDispute(
  db: MutationCtx['db'],
  result: DisputeOpenResult,
): Promise<void> {
  if (result.kind === 'error') {
    return
  }

  if (result.code !== 'dispute_open_replayed') {
    const document = disputeDocument(db, result.dispute)
    const existing = await findDisputeDocument(db, result.dispute.operationKeys)
    if (existing === null) {
      await db.insert('disputes', document)
    } else {
      await db.patch(existing._id, document)
    }
  }

  if (result.auditEvent !== undefined) {
    await persistAuditEvent(db, result.auditEvent)
  }
}

async function persistClosedDispute(
  db: MutationCtx['db'],
  dispute: DisputeRecord,
  auditEvent: AuditEventContract,
): Promise<void> {
  const existing = await findDisputeDocument(db, dispute.operationKeys)
  if (existing === null) {
    throw new Error('dispute_persistence_missing')
  }
  await db.patch(existing._id, disputeDocument(db, dispute))
  await persistAuditEvent(db, auditEvent)
}

async function findDisputeDocument(
  db: MutationCtx['db'],
  operationKeys: readonly string[],
): Promise<Doc<'disputes'> | null> {
  for (const operationKey of operationKeys) {
    const row = await db
      .query('disputes')
      .withIndex('by_operation_key', (builder) => builder.eq('operationKey', operationKey))
      .unique()
    if (row !== null) {
      return row
    }
  }
  return null
}

function disputeDocument(db: MutationCtx['db'], dispute: DisputeRecord) {
  return {
    businessId: businessIdFromValue(db, dispute.businessId),
    status: dispute.status,
    openedByContactHash: dispute.openedByContactHash,
    targetType: dispute.targetType,
    targetRef: dispute.targetRef,
    reasonCode: dispute.reasonCode,
    evidenceHash: dispute.evidenceHash,
    evidenceRefs: dispute.evidenceRefs,
    publicMessageHash: dispute.publicMessageHash,
    operationKey: dispute.operationKey,
    operationKeys: dispute.operationKeys,
    correlationId: dispute.correlationId,
    requestCount: dispute.requestCount,
    createdAt: dispute.createdAt,
    updatedAt: dispute.updatedAt,
  }
}


async function persistAuditEvent(
  db: MutationCtx['db'],
  event: AuditEventContract,
): Promise<void> {
  const existing = await db
    .query('auditEvents')
    .withIndex('by_eventId', (builder) => builder.eq('eventId', event.eventId))
    .unique()
  if (existing === null) {
    const businessId = event.businessId === undefined
      ? undefined
      : businessIdFromValue(db, event.businessId)
    await db.insert('auditEvents', {
      eventId: event.eventId,
      eventType: event.eventType,
      actorKind: event.actorKind,
      actorRef: event.actorRef,
      ...(businessId === undefined ? {} : { businessId }),
      targetType: event.targetType,
      targetRef: event.targetRef,
      ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
      ...(event.afterState === undefined ? {} : { afterState: event.afterState }),
      idempotencyKey: event.idempotencyKey,
      correlationId: event.correlationId,
      ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
      evidenceRefs: [...event.evidenceRefs],
      redactedPayloadJson: JSON.stringify(event.redactedPayload),
      payloadHash: event.payloadHash,
      ...(event.failureCode === undefined ? {} : { failureCode: event.failureCode }),
      createdAt: event.createdAt,
    })
  }
}

function adminAuthorityState(source: AdminAuthorityReadSource): AdminAuthorityState {
  return {
    adminMemberships: source.adminMemberships.flatMap((row) => {
      const membership = adminMembershipFromDocument(row)
      return membership === undefined ? [] : [membership]
    }),
    adminMembershipAuditEvents: source.adminMembershipAuditEvents.map(adminMembershipAuditFromDocument),
    auditEvents: source.auditEvents.map(auditEventFromDocument),
  }
}

function adminMembershipFromDocument(row: Doc<'adminMemberships'>): AdminMembership | undefined {
  const tokenIdentifier = row.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.length === 0) {
    return undefined
  }

  return {
    clerkUserId: row.clerkUserId,
    tokenIdentifier,
    role: row.role,
    state: row.state,
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt,
    ...(row.revokedBy === undefined ? {} : { revokedBy: row.revokedBy }),
    ...(row.revokedAt === undefined ? {} : { revokedAt: row.revokedAt }),
    ...(row.evidenceRef === undefined ? {} : { evidenceRef: row.evidenceRef }),
  }
}

function adminMembershipAuditFromDocument(row: Doc<'adminMembershipAuditEvents'>): AdminDecisionAudit {
  return {
    auditEventId: brandNonEmpty(row.auditEventId, 'AuditEventId'),
    eventType: row.eventType,
    actorRef: row.actorRef,
    targetRef: row.targetRef,
    reasonCode: row.reasonCode,
    evidenceRefs: [...row.evidenceRefs],
    operationKey: brandNonEmpty(row.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(row.correlationId, 'CorrelationId'),
    createdAt: row.createdAt,
  }
}

function disputeSourceState(source: DisputeReadSource): DisputeSourceState {
  return {
    disputes: source.disputes.map(disputeFromDocument),
    auditEvents: source.auditEvents.map(auditEventFromDocument),
  }
}

function disputeFromDocument(row: Doc<'disputes'>): DisputeRecord {
  return {
    disputeId: String(row._id),
    businessId: brandNonEmpty(String(row.businessId), 'BusinessId'),
    status: row.status,
    openedByContactHash: row.openedByContactHash,
    targetType: row.targetType,
    targetRef: row.targetRef,
    reasonCode: readRemovalDisputeReasonCode(row.reasonCode),
    evidenceHash: row.evidenceHash,
    evidenceRefs: [...row.evidenceRefs],
    publicMessageHash: row.publicMessageHash,
    operationKey: brandNonEmpty(row.operationKey, 'OperationKey'),
    operationKeys: row.operationKeys.map((value) => brandNonEmpty(value, 'OperationKey')),
    correlationId: brandNonEmpty(row.correlationId, 'CorrelationId'),
    requestCount: row.requestCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function readRemovalDisputeReasonCode(value: string): RemovalDisputeReasonCode {
  const reasonCode = RemovalDisputeReasonCodeValues.find((candidate) => candidate === value)
  if (reasonCode === undefined) {
    throw new Error('invalid_dispute_reason_code')
  }
  return reasonCode
}

function auditEventFromDocument(row: Doc<'auditEvents'>): AuditEventContract {
  let redactedPayload: AuditEventContract['redactedPayload']
  try {
    redactedPayload = JSON.parse(row.redactedPayloadJson) as AuditEventContract['redactedPayload']
  } catch {
    redactedPayload = null
  }
  return {
    eventId: brandNonEmpty(row.eventId, 'AuditEventId'),
    eventType: row.eventType,
    actorKind: row.actorKind,
    actorRef: row.actorRef,
    targetType: row.targetType,
    targetRef: row.targetRef,
    ...(row.businessId === undefined ? {} : { businessId: brandNonEmpty(String(row.businessId), 'BusinessId') }),
    idempotencyKey: brandNonEmpty(row.idempotencyKey, 'OperationKey'),
    correlationId: brandNonEmpty(row.correlationId, 'CorrelationId'),
    ...(row.beforeState === undefined ? {} : { beforeState: row.beforeState }),
    ...(row.afterState === undefined ? {} : { afterState: row.afterState }),
    ...(row.reasonCode === undefined ? {} : { reasonCode: row.reasonCode }),
    evidenceRefs: [...row.evidenceRefs],
    redactedPayload,
    payloadHash: brandNonEmpty(row.payloadHash, 'SourceHash'),
    ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
    createdAt: row.createdAt,
  }
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
    payloadHash: canonicalDigest(redactedPayload),
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

function adminSourceWriteDenied(reason: string) {
  return {
    kind: 'error' as const,
    code: 'admin_action_denied' as const,
    retryable: false,
    reason,
  }
}

function envList(name: string): string[] {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  return value === undefined
    ? []
    : value.split(',').flatMap((item) => {
        const trimmed = item.trim()
        return trimmed === '' ? [] : [trimmed]
      })
}


function disputeRateLimitKey(args: {
  targetRef: string
  contactEmail?: string
  contactPhone?: string
  contactName?: string
}): string {
  return `removal:${canonicalDigest({
    email: args.contactEmail?.toLowerCase().trim() ?? null,
    name: args.contactName?.trim() ?? null,
    phone: args.contactPhone?.trim() ?? null,
    targetRef: args.targetRef,
  })}`
}

function claimRowState(
  value: Doc<'claims'>['status'] | Doc<'disputes'>['status'],
): AdminReadbackRow['rowState'] {
  switch (value) {
    case 'suppressed':
      return 'suppressed'
    case 'opened':
    case 'updated':
    case 'contested':
    case 'disputed':
      return 'pending_review'
    case 'draft':
    case 'authenticated':
    case 'published':
    case 'closed':
      return 'guarded'
    default:
      throw new Error(`Unexpected claim or dispute status: ${String(value)}`)
  }
}

function indexRowState(value: Doc<'registryProjectionAttempts'>['status']): AdminReadbackRow['rowState'] {
  switch (value) {
    case 'succeeded':
      return 'indexed'
    case 'failed':
      return 'degraded'
    case 'stale':
      return 'stale'
    case 'queued':
      return 'queued'
    default:
      throw new Error(`Unexpected registry projection status: ${String(value)}`)
  }
}

function hasEvidence(evidenceRefs: readonly string[]): boolean {
  return evidenceRefs.some((evidenceRef) => evidenceRef.trim().length > 0)
}

function businessIdFromValue(db: MutationCtx['db'], value: string): Id<'businesses'> {
  const id = db.normalizeId('businesses', value)
  if (id === null) {
    throw new Error('invalid_business_id')
  }
  return id
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
