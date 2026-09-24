import type { MutationCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import type { AuditEventContract } from '../../../../src/modules/observability/public'

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
      ...(event.activeAccountRef === undefined ? {} : { activeAccountRef: event.activeAccountRef }),
      ...(event.sourceSystem === undefined ? {} : { sourceSystem: event.sourceSystem }),
      ...(event.observedAt === undefined ? {} : { observedAt: event.observedAt }),
      ...(event.authorityGeneration === undefined ? {} : { authorityGeneration: event.authorityGeneration }),
      ...(businessId === undefined ? {} : { businessId }),
      targetType: event.targetType,
      targetRef: event.targetRef,
      ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
      ...(event.afterState === undefined
        ? {}
        : { afterState: event.afterState, outcome: event.afterState }),
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
