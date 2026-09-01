import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { createPackage3AuditEvent, type AuditEventContract } from '@/modules/observability/public'

export type ConnectionHealthAuditInput = Readonly<{
  actorPrincipalRef: string
  activeAccountRef: string
  connectionRef: string
  authorityGeneration: number
  commandId: string
  correlationRef: string
  method: 'GET' | 'POST'
  resourceUrl: string
  payee: string
  status: 'healthy' | 'unhealthy'
  observationDigest: string
  reasonCode?: string
  observedAt: number
}>

export type ConnectionLifecycleAuditInput = Readonly<{
  eventType: 'connection.connected' | 'connection.reauthorized' | 'connection.revoked' | 'connection.cleanup_required'
  actorPrincipalRef: string
  activeAccountRef: string
  connectionRef: string
  authorityGeneration: number
  commandId: string
  correlationRef: string
  commandDigest: string
  adapterId: string
  beforeState: string
  outcome: string
  method?: 'GET' | 'POST'
  resourceUrl?: string
  payee?: string
  reasonCode?: string
  occurredAt: number
}>

export function createConnectionLifecycleAuditEvent(
  input: ConnectionLifecycleAuditInput,
): AuditEventContract {
  const eventId = `audit:${input.eventType}:${canonicalDigest({
    commandId: input.commandId,
    commandDigest: input.commandDigest,
  }).slice('sha256:'.length)}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: input.eventType,
    actorKind: 'owner',
    actorRef: input.actorPrincipalRef,
    activeAccountRef: input.activeAccountRef,
    sourceSystem: 'ae_recorded',
    observedAt: input.occurredAt,
    authorityGeneration: input.authorityGeneration,
    targetType: 'provider_connection',
    targetRef: input.connectionRef,
    idempotencyKey: brandNonEmpty(input.commandId, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationRef, 'CorrelationId'),
    beforeState: input.beforeState,
    outcome: input.outcome,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
    evidenceRefs: [],
    redactedPayload: {
      adapterId: input.adapterId,
      ...(input.method === undefined ? {} : { method: input.method }),
      ...(input.resourceUrl === undefined ? {} : { resourceUrl: input.resourceUrl }),
      ...(input.payee === undefined ? {} : { payee: input.payee }),
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.occurredAt,
  })
  if (!audit.valid) throw new Error(`provider_connection_lifecycle_audit_invalid:${audit.reason}`)
  return audit.event
}

/** Builds the closed, redacted evidence envelope for an unpaid x402 health check. */
export function createConnectionHealthAuditEvent(
  input: ConnectionHealthAuditInput,
): AuditEventContract {
  const commandDigest = canonicalDigest({
    version: 'ae.connection-health-check:v1',
    connectionRef: input.connectionRef,
    authorityGeneration: input.authorityGeneration,
    method: input.method,
    resourceUrl: input.resourceUrl,
    payee: input.payee,
    status: input.status,
    observationDigest: input.observationDigest,
    reasonCode: input.reasonCode ?? null,
  })
  const eventId = `audit:connection.health_checked:${canonicalDigest({
    commandId: input.commandId,
    commandDigest,
  }).slice('sha256:'.length)}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventId, 'AuditEventId'),
    eventType: 'connection.health_checked',
    actorKind: 'owner',
    actorRef: input.actorPrincipalRef,
    activeAccountRef: input.activeAccountRef,
    sourceSystem: 'provider_observed',
    observedAt: input.observedAt,
    authorityGeneration: input.authorityGeneration,
    targetType: 'provider_connection',
    targetRef: input.connectionRef,
    idempotencyKey: brandNonEmpty(input.commandId, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationRef, 'CorrelationId'),
    beforeState: 'previous_health_or_unchecked',
    outcome: input.status,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
    evidenceRefs: [`x402-health-observation:${input.observationDigest}`],
    redactedPayload: {
      method: input.method,
      resourceUrl: input.resourceUrl,
      payee: input.payee,
      status: input.status,
    },
    commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt: input.observedAt,
  })
  if (!audit.valid) throw new Error(`provider_connection_health_audit_invalid:${audit.reason}`)
  return audit.event
}
