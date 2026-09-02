import { canonicalDigest } from '../../common/canonical-digest'

export const COMMERCIAL_POLICY_FAMILIES = Object.freeze([
  'commercial_perimeter',
  'tax',
  'accounting_client_money',
  'privacy_retention',
  'treasury_custody',
  'operations',
] as const)

export type CommercialPolicyFamily = typeof COMMERCIAL_POLICY_FAMILIES[number]
export type CommercialPolicyEnvironment = 'sandbox' | 'production'
export type CommercialPolicyLifecycle = 'active' | 'superseded' | 'suspended'
export type CommercialPolicySandboxFixture = 'managed_x402_deterministic_v1'

export type CommercialPolicyApproval = Readonly<{
  policyRef: string
  family: CommercialPolicyFamily
  environment: CommercialPolicyEnvironment
  revision: number
  lifecycle: CommercialPolicyLifecycle
  effectiveAt: number
  expiresAt: number
  evidenceRef: string
  evidenceDigest: string
  approvedByPrincipalRef: string
  activatedAt: number
  supersededByPolicyRef?: string
  suspendedAt?: number
}>

export type CommercialPolicyGateResult =
  | Readonly<{
      kind: 'admitted'
      environment: CommercialPolicyEnvironment
      policyRefs: readonly string[]
      policyDigest: string
    }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'commercial_policy_fixture_required'
        | 'commercial_policy_missing'
        | 'commercial_policy_not_effective'
        | 'commercial_policy_expired'
        | 'commercial_policy_suspended'
        | 'commercial_policy_superseded'
        | 'commercial_policy_environment_mismatch'
        | 'commercial_policy_conflict'
      family?: CommercialPolicyFamily
      missingFamilies?: readonly CommercialPolicyFamily[]
    }>

export function evaluateCommercialPolicyGate(input: Readonly<{
  environment: CommercialPolicyEnvironment
  now: number
  approvals: readonly CommercialPolicyApproval[]
  sandboxFixture?: CommercialPolicySandboxFixture
}>): CommercialPolicyGateResult {
  if (input.environment === 'sandbox') {
    if (input.sandboxFixture !== 'managed_x402_deterministic_v1') {
      return Object.freeze({
        kind: 'refused',
        code: 'commercial_policy_fixture_required',
        missingFamilies: COMMERCIAL_POLICY_FAMILIES,
      })
    }
    const policyRefs = Object.freeze([
      'commercial-policy-fixture:managed_x402_deterministic_v1',
    ])
    return Object.freeze({
      kind: 'admitted',
      environment: 'sandbox',
      policyRefs,
      policyDigest: canonicalDigest({
        format: 'ae.commercial-policy-gate:v1',
        environment: 'sandbox',
        fixture: input.sandboxFixture,
      }),
    })
  }

  const selected: CommercialPolicyApproval[] = []
  const missingFamilies = COMMERCIAL_POLICY_FAMILIES.filter((family) =>
    !input.approvals.some((approval) => approval.family === family),
  )
  if (missingFamilies.length > 0) {
    return Object.freeze({
      kind: 'refused',
      code: 'commercial_policy_missing',
      missingFamilies: Object.freeze(missingFamilies),
    })
  }

  for (const family of COMMERCIAL_POLICY_FAMILIES) {
    const familyApprovals = input.approvals.filter((approval) => approval.family === family)
    const environmentApprovals = familyApprovals.filter(
      (approval) => approval.environment === input.environment,
    )
    if (environmentApprovals.length === 0) {
      return Object.freeze({
        kind: 'refused',
        code: 'commercial_policy_environment_mismatch',
        family,
      })
    }
    const active = environmentApprovals.filter((approval) => approval.lifecycle === 'active')
    if (active.length > 1) {
      return Object.freeze({ kind: 'refused', code: 'commercial_policy_conflict', family })
    }
    if (active.length === 0) {
      const latest = [...environmentApprovals].sort((left, right) => right.revision - left.revision)[0]
      return Object.freeze({
        kind: 'refused',
        code: latest?.lifecycle === 'suspended'
          ? 'commercial_policy_suspended'
          : 'commercial_policy_superseded',
        family,
      })
    }
    const current = active[0]!
    if (current.effectiveAt > input.now) {
      return Object.freeze({
        kind: 'refused',
        code: 'commercial_policy_not_effective',
        family,
      })
    }
    if (current.expiresAt <= input.now) {
      return Object.freeze({ kind: 'refused', code: 'commercial_policy_expired', family })
    }
    selected.push(current)
  }

  const policyRefs = Object.freeze(selected.map((approval) => approval.policyRef))
  return Object.freeze({
    kind: 'admitted',
    environment: 'production',
    policyRefs,
    policyDigest: canonicalDigest({
      format: 'ae.commercial-policy-gate:v1',
      environment: 'production',
      approvals: selected.map((approval) => ({
        policyRef: approval.policyRef,
        family: approval.family,
        revision: approval.revision,
        evidenceDigest: approval.evidenceDigest,
        effectiveAt: approval.effectiveAt,
        expiresAt: approval.expiresAt,
      })),
    }),
  })
}
