import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../../../src/modules/common/ids'
import { createPackage3AuditEvent, redactPayload } from '../../../src/modules/observability/public'
import { persistAuditEvent } from '../../securityShared'

export async function recordWorkspaceAuditEvent(
  db: Parameters<typeof persistAuditEvent>[0],
  input: Readonly<{
    eventType: 'account.workspace.closed' | 'account.workspace.ownership_transferred' | 'account.workspace_profile.updated'
    actorPrincipalRef: string
    activeAccountRef: string
    correlationRef: string
    idempotencyRef: string
    beforeState: string
    outcome: string
    createdAt: number
    redactedPayload?: unknown
  }>,
): Promise<void> {
  const redactedPayload = redactPayload(input.redactedPayload ?? {})
  const commandDigest = canonicalDigest({
    eventType: input.eventType,
    correlationRef: input.correlationRef,
    idempotencyRef: input.idempotencyRef,
    activeAccountRef: input.activeAccountRef,
    outcome: input.outcome,
    redactedPayload,
  })
  const eventId = `audit:workspace:${input.eventType}:${input.idempotencyRef}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: input.eventType,
    actorKind: 'owner',
    actorRef: input.actorPrincipalRef,
    activeAccountRef: input.activeAccountRef,
    sourceSystem: 'ae_recorded',
    targetType: 'account',
    targetRef: input.activeAccountRef,
    idempotencyKey: brandNonEmpty(input.idempotencyRef, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationRef, 'CorrelationId'),
    beforeState: input.beforeState,
    outcome: input.outcome,
    evidenceRefs: [],
    redactedPayload,
    commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}
