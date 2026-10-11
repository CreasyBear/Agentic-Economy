import type { MutationCtx } from '../../../_generated/server'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import { createPackage3AuditEvent } from '../../../../src/modules/observability/public'
import { persistAuditEvent } from '../../security/audit/persistence'
import { auditEventIdFromDeliveryRefHash } from './auth'
import { CLERK_ORG_MEMBERSHIP_ACTOR_REF } from './contracts'

export async function recordOrganizationMembershipCreatedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    membershipRefHash: string
    role: 'org:admin' | 'org:member'
    memberPrincipalRef: string
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-membership:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_membership.created',
    actorKind: 'system',
    actorRef: CLERK_ORG_MEMBERSHIP_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: 'not_observed',
    outcome: 'active',
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      membershipRefHash: input.membershipRefHash,
      role: input.role,
      memberPrincipalRef: input.memberPrincipalRef,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_membership_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

export async function recordOrganizationMembershipUpdatedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    membershipRefHash: string
    role: 'org:admin' | 'org:member'
    memberPrincipalRef: string
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    beforeState: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-membership:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_membership.updated',
    actorKind: 'system',
    actorRef: CLERK_ORG_MEMBERSHIP_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: input.beforeState,
    outcome: input.role,
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      membershipRefHash: input.membershipRefHash,
      role: input.role,
      memberPrincipalRef: input.memberPrincipalRef,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_membership_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

export async function recordOrganizationMembershipDeletedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    membershipRefHash: string
    role: 'org:admin' | 'org:member'
    memberPrincipalRef: string
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    beforeState: string
    outcome?: 'ended' | 'ignored'
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-membership:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_membership.deleted',
    actorKind: 'system',
    actorRef: CLERK_ORG_MEMBERSHIP_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: input.beforeState,
    outcome: input.outcome ?? 'ended',
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      membershipRefHash: input.membershipRefHash,
      role: input.role,
      memberPrincipalRef: input.memberPrincipalRef,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_membership_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}
