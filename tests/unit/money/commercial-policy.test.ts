import { describe, expect, it } from 'vitest'

import {
  COMMERCIAL_POLICY_FAMILIES,
  COMMERCIAL_POLICY_REFUSAL_REASONS,
  commercialPolicyRefusalReasonSchema,
  evaluateCommercialPolicyGate,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
  PACKAGE4_SYNTHETIC_VPS_CONTROLS,
  type CommercialPolicyApproval,
  type CommercialPolicyGateResult,
  type CommercialPolicyRefusalReason,
} from '../../../src/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'

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
    control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family],
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
      policyRefs: [
        'commercial-policy-fixture:managed_x402_deterministic_v1',
        'commercial-policy-deployment:local_ci',
      ],
      policyDigest: expect.stringMatching(/^sha256:/u),
      controls: SANDBOX_COMMERCIAL_POLICY_CONTROLS,
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

  it('binds the server-owned synthetic release controls into the sandbox policy digest', () => {
    const local = evaluateCommercialPolicyGate({
      environment: 'sandbox',
      now: NOW,
      approvals: [],
      sandboxFixture: 'managed_x402_deterministic_v1',
      sandboxDeploymentProfile: 'local_ci',
    })
    const release = evaluateCommercialPolicyGate({
      environment: 'sandbox',
      now: NOW,
      approvals: [],
      sandboxFixture: 'managed_x402_deterministic_v1',
      sandboxDeploymentProfile: 'synthetic_vps_fixture',
    })

    expect(release).toMatchObject({
      kind: 'admitted',
      controls: PACKAGE4_SYNTHETIC_VPS_CONTROLS,
      policyRefs: [
        'commercial-policy-fixture:managed_x402_deterministic_v1',
        'commercial-policy-deployment:synthetic_vps_fixture',
      ],
    })
    expect(release.kind === 'admitted' && local.kind === 'admitted'
      ? release.policyDigest === local.policyDigest
      : true).toBe(false)
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
      controls: PRODUCTION_COMMERCIAL_POLICY_CONTROLS,
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

  it('refuses a family whose operating control is invalid or belongs to another family', () => {
    const approvals = completeProductionApprovals()
    approvals[1] = approval('tax', {
      control: {
        family: 'tax',
        serviceFeeTaxBps: 10_001,
        taxInvoiceIssuance: 'disabled_pending_approval',
      },
    })
    expect(evaluateCommercialPolicyGate({
      environment: 'production',
      now: NOW,
      approvals,
    })).toMatchObject({
      kind: 'refused',
      code: 'commercial_policy_conflict',
      family: 'tax',
    })
  })

  it.each([
    ['fixture deployment', {
      ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody,
      deploymentClass: 'synthetic_vps_fixture' as const,
    }],
    ['colocated PostgreSQL', {
      ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody,
      postgresProtection: 'disposable_fixture' as const,
    }],
    ['weak recovery point', {
      ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody,
      recoveryPointObjectiveMinutes: 6,
    }],
    ['weak recovery time', {
      ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody,
      recoveryTimeObjectiveMinutes: 61,
    }],
  ])('refuses production treasury control with %s', (_label, control) => {
    const approvals = completeProductionApprovals()
    approvals[4] = approval('treasury_custody', { control })
    expect(evaluateCommercialPolicyGate({
      environment: 'production',
      now: NOW,
      approvals,
    })).toMatchObject({
      kind: 'refused',
      code: 'commercial_policy_conflict',
      family: 'treasury_custody',
    })
  })

  it.each([
    ['unapproved SDK', {
      ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.operations,
      formanceSdkVersion: '7.0.1',
    }],
    ['missing PITR', {
      ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.operations,
      backupControl: 'disposable_fixture' as const,
    }],
    ['missing restore rehearsal', {
      ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.operations,
      restoreControl: 'disposable_rehearsed' as const,
    }],
    ['missing signed close', {
      ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.operations,
      dailyCloseControl: 'not_required_fixture' as const,
    }],
  ])('refuses production operations control with %s', (_label, control) => {
    const approvals = completeProductionApprovals()
    approvals[5] = approval('operations', { control })
    expect(evaluateCommercialPolicyGate({
      environment: 'production',
      now: NOW,
      approvals,
    })).toMatchObject({
      kind: 'refused',
      code: 'commercial_policy_conflict',
      family: 'operations',
    })
  })
})

type GateRefusalCode = Extract<CommercialPolicyGateResult, { kind: 'refused' }>['code']
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T
// Compile-time drift guard: the exported tuple is exactly the gate's refusal
// codes plus the legal-customer binding reason.
export type _RefusalReasonsCoverGate =
  Assert<Exact<GateRefusalCode | 'legal_customer_required', CommercialPolicyRefusalReason>>

describe('commercial policy refusal reasons', () => {
  it('enumerates every gate refusal code plus the legal-customer binding reason', () => {
    expect([...COMMERCIAL_POLICY_REFUSAL_REASONS]).toEqual([
      'commercial_policy_fixture_required',
      'commercial_policy_deployment_profile_invalid',
      'commercial_policy_missing',
      'commercial_policy_not_effective',
      'commercial_policy_expired',
      'commercial_policy_suspended',
      'commercial_policy_superseded',
      'commercial_policy_environment_mismatch',
      'commercial_policy_conflict',
      'legal_customer_required',
    ] satisfies readonly CommercialPolicyRefusalReason[])
    expect(commercialPolicyRefusalReasonSchema.options)
      .toEqual([...COMMERCIAL_POLICY_REFUSAL_REASONS])
    expect(commercialPolicyRefusalReasonSchema.safeParse('legal_customer_unavailable').success)
      .toBe(false)
  })

  it.each([
    ['sandbox without the fixture', { environment: 'sandbox', now: NOW, approvals: [] }],
    ['a missing family', {
      environment: 'production', now: NOW, approvals: completeProductionApprovals().slice(1),
    }],
    ['an approval that is not yet effective', {
      environment: 'production',
      now: NOW,
      approvals: completeProductionApprovals().map((row, index) => index === 0
        ? approval(row.family, { effectiveAt: NOW + 60_000 })
        : row),
    }],
    ['an expired approval', {
      environment: 'production',
      now: NOW,
      approvals: completeProductionApprovals().map((row, index) => index === 0
        ? approval(row.family, { expiresAt: NOW })
        : row),
    }],
    ['a suspended approval', {
      environment: 'production',
      now: NOW,
      approvals: completeProductionApprovals().map((row, index) => index === 0
        ? approval(row.family, { lifecycle: 'suspended' })
        : row),
    }],
    ['a superseded approval', {
      environment: 'production',
      now: NOW,
      approvals: completeProductionApprovals().map((row, index) => index === 0
        ? approval(row.family, { lifecycle: 'superseded' })
        : row),
    }],
    ['an approval from another environment', {
      environment: 'production',
      now: NOW,
      approvals: completeProductionApprovals().map((row, index) => index === 0
        ? approval(row.family, { environment: 'sandbox' })
        : row),
    }],
    ['two active approvals for one family', {
      environment: 'production',
      now: NOW,
      approvals: [
        ...completeProductionApprovals(),
        approval(COMMERCIAL_POLICY_FAMILIES[0], {
          policyRef: 'commercial-policy:commercial_perimeter:2',
          revision: 2,
        }),
      ],
    }],
  ] as const)('emits an enumerated reason for %s', (_label, input) => {
    const result = evaluateCommercialPolicyGate(input)

    expect(result.kind).toBe('refused')
    expect(result.kind === 'refused'
      ? commercialPolicyRefusalReasonSchema.safeParse(result.code).success
      : false).toBe(true)
  })
})
