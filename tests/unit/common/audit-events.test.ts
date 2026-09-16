import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  validateAuditEvent,
  type AuditEventInput,
} from '@/modules/observability/public'

describe('validateAuditEvent', () => {
  it('refuses raw secret material on billing and api_key events', () => {
    expect(validateAuditEvent(auditInput({
      eventType: 'billing.checkout_started',
      targetType: 'billing',
      targetRef: 'billing:1',
      beforeState: 'none',
      afterState: 'started',
      redactedPayload: { receipt: 'Bearer sk_live_exposed' },
    }))).toEqual({ valid: false, reason: 'unsafe_security_evidence' })

    expect(validateAuditEvent(auditInput({
      eventType: 'api_key.created',
      targetType: 'api_key',
      targetRef: 'api-key:1',
      beforeState: 'missing',
      afterState: 'active',
      redactedPayload: { secret: 'sk_live_exposed' },
    }))).toEqual({ valid: false, reason: 'unsafe_security_evidence' })
  })

  it('requires before and after state for dispute.opened and capability_binding.quarantined', () => {
    expect(validateAuditEvent(auditInput({
      eventType: 'dispute.opened',
      targetType: 'dispute',
      targetRef: 'dispute:1',
    }))).toEqual({ valid: false, reason: 'missing_state_transition' })

    expect(validateAuditEvent(auditInput({
      eventType: 'capability_binding.quarantined',
      targetType: 'capability_binding',
      targetRef: 'binding:1',
    }))).toEqual({ valid: false, reason: 'missing_state_transition' })
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
