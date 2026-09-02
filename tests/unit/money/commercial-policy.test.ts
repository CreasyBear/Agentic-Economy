import { describe, expect, it } from 'vitest'

import {
  COMMERCIAL_POLICY_FAMILIES,
  evaluateCommercialPolicyGate,
  type CommercialPolicyApproval,
} from '../../../src/modules/money/public'

const NOW = 1_800_000_000_000

function approval(
  family: CommercialPolicyApproval['family'],
  overrides: Partial<CommercialPolicyApproval> = {},
): CommercialPolicyApproval {
  return Object.freeze({
    policyRef: `commercial-policy:${family}:1`,
    family,
    environment: 'production',
    revision: 1,
    lifecycle: 'active',
    effectiveAt: NOW - 60_000,
    expiresAt: NOW + 60_000,
    evidenceRef: `approval-evidence:${family}:1`,
    evidenceDigest: `sha256:${family.padEnd(64, '0').slice(0, 64)}`,
    approvedByPrincipalRef: 'prn_00000000000040008000000000000021',
    activatedAt: NOW - 60_000,
    ...overrides,
  })
}

function completeProductionApprovals(): CommercialPolicyApproval[] {
  return COMMERCIAL_POLICY_FAMILIES.map((family) => approval(family))
}

describe('commercial policy launch gate', () => {
  it('admits sandbox only through the explicit deterministic fixture', () => {
    expect(evaluateCommercialPolicyGate({
      environment: 'sandbox',
      now: NOW,
      approvals: [],
      sandboxFixture: 'managed_x402_deterministic_v1',
    })).toEqual({
      kind: 'admitted',
      environment: 'sandbox',
      policyRefs: ['commercial-policy-fixture:managed_x402_deterministic_v1'],
      policyDigest: expect.stringMatching(/^sha256:/u),
    })

    expect(evaluateCommercialPolicyGate({
      environment: 'sandbox',
      now: NOW,
      approvals: [],
    })).toEqual({
      kind: 'refused',
      code: 'commercial_policy_fixture_required',
      missingFamilies: COMMERCIAL_POLICY_FAMILIES,
    })
  })

  it('admits production only when every required family is current', () => {
    expect(evaluateCommercialPolicyGate({
      environment: 'production',
      now: NOW,
      approvals: completeProductionApprovals(),
    })).toEqual({
      kind: 'admitted',
      environment: 'production',
      policyRefs: COMMERCIAL_POLICY_FAMILIES.map((family) => `commercial-policy:${family}:1`),
      policyDigest: expect.stringMatching(/^sha256:/u),
    })
  })

  it.each([
    ['missing', completeProductionApprovals().slice(1), 'commercial_policy_missing'],
    ['expired', completeProductionApprovals().map((row, index) => index === 0
      ? approval(row.family, { expiresAt: NOW })
      : row), 'commercial_policy_expired'],
    ['suspended', completeProductionApprovals().map((row, index) => index === 0
      ? approval(row.family, { lifecycle: 'suspended' })
      : row), 'commercial_policy_suspended'],
    ['superseded', completeProductionApprovals().map((row, index) => index === 0
      ? approval(row.family, { lifecycle: 'superseded' })
      : row), 'commercial_policy_superseded'],
    ['wrong environment', completeProductionApprovals().map((row, index) => index === 0
      ? approval(row.family, { environment: 'sandbox' })
      : row), 'commercial_policy_environment_mismatch'],
  ] as const)('refuses production when one approval is %s', (_label, approvals, code) => {
    expect(evaluateCommercialPolicyGate({
      environment: 'production',
      now: NOW,
      approvals,
    })).toMatchObject({ kind: 'refused', code })
  })

  it('refuses ambiguous active approvals instead of choosing one', () => {
    const approvals = completeProductionApprovals()
    approvals.push(approval(COMMERCIAL_POLICY_FAMILIES[0], {
      policyRef: 'commercial-policy:commercial_perimeter:2',
      revision: 2,
    }))

    expect(evaluateCommercialPolicyGate({
      environment: 'production',
      now: NOW,
      approvals,
    })).toMatchObject({
      kind: 'refused',
      code: 'commercial_policy_conflict',
      family: COMMERCIAL_POLICY_FAMILIES[0],
    })
  })
})
