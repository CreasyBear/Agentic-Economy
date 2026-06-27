import { describe, expect, it } from 'vitest'

import { readAdminRouteShell } from '@/modules/security/public'
import type { AdminMembership, AdminReadbackRow } from '@/modules/security/public'

describe('admin route readbacks', () => {
  it('denies missing membership with a 401 and returns no private rows', () => {
    const result = readAdminRouteShell({
      membership: undefined,
      surface: 'claims_queue',
      rows: [safeRow('private:evidence:raw-contact')],
      now: 10,
    })

    expect(result).toMatchObject({
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      rows: [],
    })
    expect(JSON.stringify(result)).not.toContain('raw-contact')
  })

  it('denies inactive membership with a 403', () => {
    const result = readAdminRouteShell({
      membership: { ...activeMembership('reviewer'), state: 'revoked' },
      surface: 'audit_events',
      now: 10,
    })

    expect(result).toMatchObject({
      kind: 'denied',
      httpStatus: 403,
      reason: 'inactive_membership',
    })
  })

  it('allows support readback without granting destructive authority', () => {
    const result = readAdminRouteShell({
      membership: activeMembership('support'),
      surface: 'index_health',
      rows: [
        {
          rowId: 'row:index:registry',
          rowType: 'index_surface',
          objectRef: 'registry_projection:business:1',
          rowState: 'stale',
          surface: 'index_health',
          readbackState: 'guarded',
          repairAction: 'regenerate_projection',
          correlationId: 'corr:index:1',
          attemptRef: 'attempt:registry:1',
          updatedAt: 20,
        },
      ],
      now: 30,
    })

    expect(result).toMatchObject({
      kind: 'allowed',
      httpStatus: 200,
      actorRef: 'admin_support',
      summary: { queued: 0, attention: 0, stale: 1, suppressed: 0 },
    })
  })
})

function activeMembership(role: AdminMembership['role']): AdminMembership {
  return {
    clerkUserId: `admin_${role}`,
    role,
    state: 'active',
    grantedBy: 'bootstrap',
    grantedAt: 1,
  }
}

function safeRow(objectRef: string): AdminReadbackRow {
  return {
    rowId: 'row:claim:1',
    rowType: 'claim',
    objectRef,
    rowState: 'pending_review',
    surface: 'claims_queue',
    readbackState: 'guarded',
    repairAction: 'review_claim',
    updatedAt: 10,
  }
}
