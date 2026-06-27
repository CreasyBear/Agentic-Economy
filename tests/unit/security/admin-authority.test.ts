import { describe, expect, it } from 'vitest'

import { canBootstrapOwnerAdmin, requireAdminAuthority } from '@/modules/security/internal/admin-authority'
import type { AdminMembership } from '@/modules/security/public'

describe('admin authority contract', () => {
  it('does not grant authority from env or session alone', () => {
    expect(requireAdminAuthority(undefined, 'set_operator_control')).toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })
  })

  it('enforces the source-owned role and action matrix', () => {
    expect(requireAdminAuthority(activeMembership('support'), 'read_admin_readbacks')).toMatchObject({ kind: 'allowed' })
    expect(requireAdminAuthority(activeMembership('support'), 'set_operator_control')).toEqual({
      kind: 'denied',
      reason: 'action_not_allowed',
    })
    expect(requireAdminAuthority(activeMembership('reviewer'), 'annotate_triage')).toEqual({
      kind: 'denied',
      reason: 'action_not_allowed',
    })
  })

  it('allows bootstrap only for preauthorized principal while no owner admin exists', () => {
    expect(
      canBootstrapOwnerAdmin('user_allowed', {
        authorizedClerkUserIds: ['user_allowed'],
        activeOwnerAdminCount: 0,
      })
    ).toBe(true)
    expect(
      canBootstrapOwnerAdmin('random_user', {
        authorizedClerkUserIds: ['user_allowed'],
        activeOwnerAdminCount: 0,
      })
    ).toBe(false)
    expect(
      canBootstrapOwnerAdmin('user_allowed', {
        authorizedClerkUserIds: ['user_allowed'],
        activeOwnerAdminCount: 1,
      })
    ).toBe(false)
  })
})

function activeMembership(role: AdminMembership['role']): AdminMembership {
  return {
    clerkUserId: 'user_1',
    role,
    state: 'active',
    grantedBy: 'bootstrap',
    grantedAt: 1,
  }
}
