import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { validateAuditEvent, type AuditEventInput } from '@/modules/observability/internal/audit'
import { payloadHash, redactPayload } from '@/modules/observability/internal/redaction'
import type { AuditEventType, AuditTargetType } from '@/modules/observability/public'

describe('audit and redaction contracts', () => {
  it('requires actor, target, operation key, correlation ID, event ID, and redacted payload hash', () => {
    const redactedPayload = redactPayload({ email: 'owner@example.com', safe: 'visible' })
    const result = validateAuditEvent(
      auditInput({
        eventId: brandNonEmpty('audit:1', 'AuditEventId'),
        eventType: 'claim.created',
        targetType: 'claim',
        targetRef: 'claim:1',
        idempotencyKey: brandNonEmpty('op:claim:1', 'OperationKey'),
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
        eventType: 'business.suppressed',
        actorKind: 'admin',
        actorRef: 'admin:1',
        targetType: 'business',
        targetRef: 'business:1',
        idempotencyKey: brandNonEmpty('op:suppress:1', 'OperationKey'),
        correlationId: brandNonEmpty('corr:2', 'CorrelationId'),
      })
    )

    expect(result).toEqual({ valid: false, reason: 'missing_state_transition' })
  })

  it('covers consequential P2-P5 audit events with source-owned before and after states', () => {
    const consequentialEvents = [
      ['inquiry.replied', 'inquiry'],
      ['inquiry.private_content_deleted', 'inquiry'],
      ['notification.webhook_held', 'notification_provider_event'],
      ['notification.retry_exhausted', 'notification'],
      ['notification.no_repair_marked', 'notification'],
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
})

function auditInput(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    eventId: brandNonEmpty('audit:base', 'AuditEventId'),
    eventType: 'claim.created',
    actorKind: 'owner',
    actorRef: 'owner:1',
    targetType: 'claim',
    targetRef: 'claim:1',
    idempotencyKey: brandNonEmpty('op:base', 'OperationKey'),
    correlationId: brandNonEmpty('corr:base', 'CorrelationId'),
    redactedPayload: null,
    payloadHash: brandNonEmpty('hash:payload', 'SourceHash'),
    createdAt: 1,
    ...overrides,
  }
}
