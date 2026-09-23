import { describe, expect, it } from 'vitest'

import { AuditEventTypeValues } from '@/modules/observability/public'
import { AUDIT_EVENT_LABELS, auditEventLabel, auditOutcomeLabel } from '@/components/ae/admin/audit/components/audit-labels'

describe('admin audit labels', () => {
  it('labels every registered event type with readable sentence case', () => {
    expect(Object.keys(AUDIT_EVENT_LABELS).sort()).toEqual([...AuditEventTypeValues].sort())
    expect(auditEventLabel('admin.action_denied')).toBe('Admin action denied')
    expect(auditEventLabel('account.workspace_invitation.created')).toBe('Account workspace invitation created')
  })

  it('preserves readability for historical event types not in the current union', () => {
    expect(auditEventLabel('legacy.event_recorded')).toBe('Legacy event recorded')
  })

  it('labels canonical and historical outcomes without hiding their raw value', () => {
    expect(auditOutcomeLabel('refused')).toBe('Refused')
    expect(auditOutcomeLabel('outcome_unknown')).toBe('Outcome unknown')
    expect(auditOutcomeLabel(null)).toBe('Unavailable')
  })
})
