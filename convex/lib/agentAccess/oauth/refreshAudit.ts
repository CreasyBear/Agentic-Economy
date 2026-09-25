import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { agentAuditOpaqueRef } from '@/modules/agent-access/public'
import { createPackage3AuditEvent } from '@/modules/observability/public'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { persistAuditEvent } from '../../security/audit/persistence'
export async function persistRefreshAudit(
  ctx: Pick<MutationCtx, 'db'>,
  family: Omit<Doc<'agentAccessOAuthRefreshFamilies'>, '_id' | '_creationTime'>,
  eventType: 'connection.connected' | 'connection.reauthorized' | 'connection.revoked',
  outcome: string,
  correlationRef: string,
  occurredAt: number,
): Promise<void> {
  const commandDigest = canonicalDigest({
    format: 'agent-access-oauth-refresh-audit:v1',
    familyRef: family.familyRef,
    revision: family.revision,
    eventType,
    outcome,
  } as never)
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(`audit:${eventType}:${commandDigest.slice('sha256:'.length)}`, 'AuditEventId'),
    eventType,
    actorKind: 'agent',
    actorRef: brandNonEmpty(family.principalRef, 'PrincipalRef'),
    activeAccountRef: family.ownerId,
    sourceSystem: 'ae_recorded',
    observedAt: occurredAt,
    authorityGeneration: family.currentGeneration,
    targetType: 'agent',
    targetRef: family.principalRef,
    idempotencyKey: brandNonEmpty(`oauth-refresh:${family.familyRef}:${family.revision}:${outcome}`, 'OperationKey'),
    correlationId: brandNonEmpty(agentAuditOpaqueRef(correlationRef, 'correlationRef'), 'CorrelationId'),
    beforeState: eventType === 'connection.connected' ? 'authorized' : 'connected',
    outcome,
    evidenceRefs: [],
    redactedPayload: { familyRef: family.familyRef },
    commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt: occurredAt,
  })
  if (!audit.valid) throw new Error(`refresh_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
}
