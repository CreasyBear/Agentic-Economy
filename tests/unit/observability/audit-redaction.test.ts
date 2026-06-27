import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { validateAuditEvent } from '@/modules/observability/internal/audit'
import { payloadHash, redactPayload } from '@/modules/observability/internal/redaction'

describe('audit and redaction contracts', () => {
  it('requires actor, target, operation key, correlation ID, event ID, and redacted payload hash', () => {
    const redactedPayload = redactPayload({ email: 'owner@example.com', safe: 'visible' })
    const result = validateAuditEvent({
      eventId: brandNonEmpty('audit:1', 'AuditEventId'),
      eventType: 'claim.created',
      actorKind: 'owner',
      actorRef: 'owner:1',
      targetType: 'claim',
      targetRef: 'claim:1',
      idempotencyKey: brandNonEmpty('op:claim:1', 'OperationKey'),
      correlationId: brandNonEmpty('corr:1', 'CorrelationId'),
      redactedPayload,
      payloadHash: payloadHash(redactedPayload),
      createdAt: 1,
    })

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
    const result = validateAuditEvent({
      eventId: brandNonEmpty('audit:2', 'AuditEventId'),
      eventType: 'business.suppressed',
      actorKind: 'admin',
      actorRef: 'admin:1',
      targetType: 'business',
      targetRef: 'business:1',
      idempotencyKey: brandNonEmpty('op:suppress:1', 'OperationKey'),
      correlationId: brandNonEmpty('corr:2', 'CorrelationId'),
      redactedPayload: null,
      payloadHash: brandNonEmpty('hash:payload', 'SourceHash'),
      createdAt: 1,
    })

    expect(result).toEqual({ valid: false, reason: 'missing_state_transition' })
  })
})
