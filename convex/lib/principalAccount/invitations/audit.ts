import type { MutationCtx } from '../../../_generated/server'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import { createPackage3AuditEvent } from '../../../../src/modules/observability/public'
import { persistAuditEvent } from '../../security/audit/persistence'
import { auditEventIdFromDeliveryRefHash } from './auth'
import { CLERK_ORG_INVITATION_ACTOR_REF } from './contracts'

export async function recordOrganizationInvitationCreatedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    invitationRefHash: string
    emailHash: string
    role: 'org:admin' | 'org:member'
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-invite:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_invitation.created',
    actorKind: 'system',
    actorRef: CLERK_ORG_INVITATION_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: 'not_observed',
    outcome: 'pending',
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      invitationRefHash: input.invitationRefHash,
      emailHash: input.emailHash,
      role: input.role,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_invitation_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

export async function recordOrganizationInvitationRevokedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    invitationRefHash: string
    emailHash: string
    role: 'org:admin' | 'org:member'
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-invite:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_invitation.revoked',
    actorKind: 'system',
    actorRef: CLERK_ORG_INVITATION_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: 'pending',
    outcome: 'revoked',
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      invitationRefHash: input.invitationRefHash,
      emailHash: input.emailHash,
      role: input.role,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_invitation_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}
