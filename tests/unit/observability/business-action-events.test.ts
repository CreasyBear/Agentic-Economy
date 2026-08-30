import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  AuditEventTypeValues,
  AuditTargetTypeValues,
} from '@/modules/common/audit-events'
import { validateAuditEvent } from '@/modules/observability/public'

describe('business action observability contracts', () => {
  it('rejects new writes of retired business-action audit events', () => {
    expect(AuditEventTypeValues).not.toContain('business_action.no_repair_marked')
    expect(AuditTargetTypeValues).not.toContain('business_action_no_repair')
    expect(validateAuditEvent({
      eventId: 'audit:compatibility',
      eventType: 'business_action.no_repair_marked',
      actorKind: 'system',
      actorRef: 'system:compatibility-test',
      targetType: 'business_action_no_repair',
      targetRef: 'stored:no-repair:1',
      idempotencyKey: 'stored:no-repair:1',
      correlationId: 'correlation:compatibility',
      redactedPayload: null,
      payloadHash: canonicalDigest(null),
      createdAt: 1,
    } as never)).toEqual({ valid: false, reason: 'invalid_event_type' })
  })
})
