import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_LIFECYCLES,
  MEMBERSHIP_LIFECYCLES,
  OWNERSHIP_LIFECYCLES,
  AccountRegistryError,
  accountActionContextValue,
  accountLifecycleValue,
  accountOwnershipValue,
  accountRef,
  accountTables,
  accountValue,
  attributionTouchValue,
  generateAccountRef,
  generateMembershipRef,
  generateOwnershipRef,
  membershipLifecycleValue,
  membershipRef,
  membershipValue,
  ownershipChangeKindValue,
  ownershipLifecycleValue,
  ownershipRef,
  recoveryPolicyValue,
  recoveryParticipantApprovalLifecycleValue,
  successionAuthorizationLifecycleValue,
  successionAuthorizationParticipantValue,
  successionAuthorizationValue,
  verifiedRecoveryParticipantApprovalValue,
} from '../../../../src/modules/principal-account/account/public'

const uuid = (suffix: number): string => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

describe('Account registry contract', () => {
  it('exports canonical constants, Convex validators and table fragments', () => {
    expect(ACCOUNT_LIFECYCLES).toEqual(['pending_activation', 'active', 'suspended', 'closed'])
    expect(OWNERSHIP_LIFECYCLES).toEqual(['active', 'ended'])
    expect(MEMBERSHIP_LIFECYCLES).toEqual(['active', 'ended'])
    expect([
      accountActionContextValue,
      accountLifecycleValue,
      accountOwnershipValue,
      accountValue,
      attributionTouchValue,
      membershipLifecycleValue,
      membershipValue,
      ownershipChangeKindValue,
      ownershipLifecycleValue,
      recoveryPolicyValue,
      recoveryParticipantApprovalLifecycleValue,
      successionAuthorizationLifecycleValue,
      successionAuthorizationParticipantValue,
      successionAuthorizationValue,
      verifiedRecoveryParticipantApprovalValue,
      accountTables.accounts,
      accountTables.accountOwnerships,
      accountTables.memberships,
    ].every((value) => value !== undefined)).toBe(true)
  })

  it('parses and generates opaque stable references independently of providers and credentials', () => {
    expect(accountRef('acc_00000000000040008000000000000001')).toBe('acc_00000000000040008000000000000001')
    expect(ownershipRef('own_00000000000040008000000000000001')).toBe('own_00000000000040008000000000000001')
    expect(membershipRef('mem_00000000000040008000000000000001')).toBe('mem_00000000000040008000000000000001')
    expect(generateAccountRef(() => uuid(1))).toBe('acc_00000000000040008000000000000001')
    expect(generateOwnershipRef(() => uuid(2))).toBe('own_00000000000040008000000000000002')
    expect(generateMembershipRef(() => uuid(3))).toBe('mem_00000000000040008000000000000003')
    expect(generateAccountRef()).toMatch(/^acc_[0-9a-f]{32}$/u)
    expect(generateOwnershipRef()).toMatch(/^own_[0-9a-f]{32}$/u)
    expect(generateMembershipRef()).toMatch(/^mem_[0-9a-f]{32}$/u)
    expect(() => accountRef('clerk:user_1')).toThrowError(AccountRegistryError)
    expect(() => ownershipRef('provider:owner')).toThrowError(/ownership_ref_invalid/u)
    expect(() => membershipRef('credential:member')).toThrowError(/membership_ref_invalid/u)
    expect(() => generateAccountRef(() => 'invalid')).toThrowError(/account_ref_invalid/u)
    expect(() => generateOwnershipRef(() => 'invalid')).toThrowError(/ownership_ref_invalid/u)
    expect(() => generateMembershipRef(() => 'invalid')).toThrowError(/membership_ref_invalid/u)
  })
})
