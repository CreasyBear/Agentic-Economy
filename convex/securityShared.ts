import type { MutationCtx } from './_generated/server'
import type { AuditEventContract } from '../src/modules/observability/public'
import type { AdminDecisionAudit, AdminMembership } from '../src/modules/security/public'
import type { Doc, Id } from './_generated/dataModel'

export type AdminAuthorityWriteResult = {
  membership?: AdminMembership
  auditEvent?: AuditEventContract
  membershipAuditEvent?: AdminDecisionAudit
}

export async function persistAdminAuthorityMutation(
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

type AdminMembershipTarget = Pick<AdminMembership, 'clerkUserId' | 'tokenIdentifier'>

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
    .withIndex('by_clerkUserId_and_state', (builder) =>
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
      .withIndex('by_tokenIdentifier_and_state', (builder) =>
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
    if (active.tokenIdentifier !== target.tokenIdentifier) {
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

export async function persistAuditEvent(
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

function businessIdFromValue(db: MutationCtx['db'], value: string): Id<'businesses'> {
  const id = db.normalizeId('businesses', value)
  if (id === null) {
    throw new Error('invalid_business_id')
  }
  return id
}

export function summarizeAudit(event: AuditEventContract) {
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

export function summarizeMembershipAudit(event: AdminDecisionAudit) {
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
