import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  Package3AuditEventTypeValues,
  createPackage3AuditEvent,
  validateAuditEvent,
  type AuditEventInput,
} from '@/modules/observability/internal/audit'
import { payloadHash, redactPayload } from '@/modules/observability/internal/redaction'
import type { AuditEventType, AuditTargetType } from '@/modules/observability/public'

describe('audit and redaction contracts', () => {
  it('requires actor, target, operation key, correlation ID, event ID, and redacted payload hash', () => {
    const redactedPayload = redactPayload({ email: 'owner@example.com', safe: 'visible' })
    const result = validateAuditEvent(
      auditInput({
        eventId: brandNonEmpty('audit:1', 'AuditEventId'),
        eventType: 'registry.sync_queued',
        targetType: 'registry_projection',
        targetRef: 'registry:1',
        idempotencyKey: brandNonEmpty('op:registry:1', 'OperationKey'),
        correlationId: brandNonEmpty('corr:1', 'CorrelationId'),
        redactedPayload,
        payloadHash: payloadHash(redactedPayload),
      })
    )

    expect(result).toMatchObject({
      valid: true,
      event: {
        eventId: 'audit:1',
        correlationId: 'corr:1',
        redactedPayload: { email: '[redacted]', safe: 'visible' },
      },
    })
  })

  it('rejects state-changing events without before and after state', () => {
    const result = validateAuditEvent(
      auditInput({
        eventId: brandNonEmpty('audit:2', 'AuditEventId'),
        eventType: 'developer_discovery.parity_failed',
        actorKind: 'system',
        actorRef: 'registry:worker',
        targetType: 'developer_discovery',
        targetRef: 'developer-discovery:1',
        idempotencyKey: brandNonEmpty('op:registry:2', 'OperationKey'),
        correlationId: brandNonEmpty('corr:2', 'CorrelationId'),
      })
    )

    expect(result).toEqual({ valid: false, reason: 'missing_state_transition' })
  })

  it('covers consequential audit events with source-owned before and after states', () => {
    const consequentialEvents = [
      ['developer_discovery.parity_failed', 'developer_discovery'],
      ['protected_action.gateway_consumed', 'protected_action_attempt'],
      ['protected_action.no_repair_marked', 'protected_action'],
      ['billing.provider_event_held', 'billing_provider_event'],
      ['billing.no_repair_marked', 'billing_reconciliation'],
    ] as const satisfies readonly (readonly [AuditEventType, AuditTargetType])[]

    for (const [eventType, targetType] of consequentialEvents) {
      expect(
        validateAuditEvent(
          auditInput({
            eventId: brandNonEmpty(`audit:${eventType}`, 'AuditEventId'),
            eventType,
            targetType,
            targetRef: `${targetType}:1`,
          })
        )
      ).toEqual({ valid: false, reason: 'missing_state_transition' })

      expect(
        validateAuditEvent(
          auditInput({
            eventId: brandNonEmpty(`audit:${eventType}:with-state`, 'AuditEventId'),
            eventType,
            targetType,
            targetRef: `${targetType}:1`,
            beforeState: 'queued',
            afterState: 'held',
          })
        )
      ).toMatchObject({ valid: true })
    }
  })

  it('constructs every closed Package 3 event with Account, source, digest, outcome, and redacted evidence', () => {
    for (const eventType of Package3AuditEventTypeValues) {
      const redactedPayload = redactPayload({ authorization: 'Bearer secret', safe: eventType })
      expect(createPackage3AuditEvent({
        eventId: brandNonEmpty(`audit:${eventType}`, 'AuditEventId'),
        eventType,
        actorKind: 'owner',
        actorRef: 'prn_owner',
        activeAccountRef: 'acc_owner',
        sourceSystem: 'ae_recorded',
        targetType: 'consequence_command',
        targetRef: `command:${eventType}`,
        idempotencyKey: brandNonEmpty(`idem:${eventType}`, 'OperationKey'),
        correlationId: brandNonEmpty(`corr:${eventType}`, 'CorrelationId'),
        evidenceRefs: ['ref:status'],
        redactedPayload,
        commandDigest: payloadHash(redactedPayload),
        beforeState: 'requested',
        outcome: 'recorded',
        createdAt: 10,
      })).toMatchObject({
        valid: true,
        event: {
          eventType,
          activeAccountRef: 'acc_owner',
          sourceSystem: 'ae_recorded',
          afterState: 'recorded',
        },
      })
    }
  })

  it('accepts a canonical Agent as the actor for credential authentication evidence', () => {
    expect(createPackage3AuditEvent({
      eventId: brandNonEmpty('audit:agent.credential.authenticated:1', 'AuditEventId'),
      eventType: 'agent.credential.authenticated',
      actorKind: 'agent',
      actorRef: 'prn_agent',
      activeAccountRef: 'acc_owner',
      sourceSystem: 'ae_recorded',
      targetType: 'agent',
      targetRef: 'prn_agent',
      idempotencyKey: brandNonEmpty('idem:agent-auth:1', 'OperationKey'),
      correlationId: brandNonEmpty('corr:agent-auth:1', 'CorrelationId'),
      evidenceRefs: ['credential:crd_current'],
      redactedPayload: { credentialRef: 'crd_current' },
      commandDigest: canonicalDigest('agent-auth-command'),
      beforeState: 'presented',
      outcome: 'authenticated',
      createdAt: 10,
    })).toMatchObject({
      valid: true,
      event: { actorKind: 'agent', actorRef: 'prn_agent' },
    })
  })

  it('refuses Package 3 events missing security context or containing raw secret material', () => {
    expect(validateAuditEvent(auditInput({
      eventType: 'agent.created',
      targetType: 'agent',
      beforeState: 'missing',
      afterState: 'active',
    }))).toEqual({ valid: false, reason: 'missing_security_context' })

    expect(createPackage3AuditEvent({
      eventId: brandNonEmpty('audit:agent.created:unsafe', 'AuditEventId'),
      eventType: 'agent.created',
      actorKind: 'owner',
      actorRef: 'prn_owner',
      activeAccountRef: 'acc_owner',
      sourceSystem: 'ae_recorded',
      targetType: 'agent',
      targetRef: 'prn_agent',
      idempotencyKey: brandNonEmpty('idem:unsafe', 'OperationKey'),
      correlationId: brandNonEmpty('corr:unsafe', 'CorrelationId'),
      evidenceRefs: [],
      redactedPayload: { authorization: 'Bearer exposed' },
      commandDigest: canonicalDigest('command'),
      beforeState: 'missing',
      outcome: 'active',
      createdAt: 10,
    })).toEqual({ valid: false, reason: 'unsafe_security_evidence' })
  })
})

function auditInput(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    eventId: brandNonEmpty('audit:base', 'AuditEventId'),
    eventType: 'registry.sync_queued',
    actorKind: 'owner',
    actorRef: 'owner:1',
    targetType: 'registry_projection',
    targetRef: 'registry:1',
    idempotencyKey: brandNonEmpty('op:base', 'OperationKey'),
    correlationId: brandNonEmpty('corr:base', 'CorrelationId'),
    redactedPayload: null,
    payloadHash: canonicalDigest('payload'),
    createdAt: 1,
    ...overrides,
  }
}
