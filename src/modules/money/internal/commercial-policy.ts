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
export type Package4SandboxDeploymentProfile = 'local_ci' | 'synthetic_vps_fixture'

export const PACKAGE4_FORMANCE_REQUIREMENTS = Object.freeze({
  ledgerVersion: 'v2.4.12',
  gatewayVersion: 'v2.3.1',
  schemaVersion: 'v1.3.0',
  sdkVersion: '7.0.0',
  sdkArtifactDigest: 'sha256:8caab624bddecebc5fed54dd7a39116279ee7c29e782cb0923e4f9aa00174104',
  maximumSdkIntegerUnits: '9007199254740991',
  architectureReviewCumulativeUnits: '1000000000000000',
} as const)

export type CommercialPolicyControl =
  | Readonly<{
      family: 'commercial_perimeter'
      sellerModel: 'principal_reseller'
      customerSegment: 'business_only'
      customerCryptoEntitlement: false
    }>
  | Readonly<{
      family: 'tax'
      serviceFeeTaxBps: number
      callTaxBps?: number
      taxInvoiceIssuance: 'disabled_pending_approval' | 'enabled'
    }>
  | Readonly<{
      family: 'accounting_client_money'
      minimumFundingPrincipalUnits: string
      maximumFundingPrincipalUnits: string
      fundingIncrementUnits: string
      legalCustomerMaximumAccessibleUnits: string
      balanceClassification: 'customer_contract_liability'
    }>
  | Readonly<{
      family: 'privacy_retention'
      evidenceRetentionDays: number
      legalHoldSupported: true
    }>
  | Readonly<{
      family: 'treasury_custody'
      treasuryAsset: 'USDC'
      treasuryExponent: 6
      minimumBufferUnits: string
      ledgerAuthority: 'formance_community'
      formanceLedgerVersion: string
      formanceGatewayVersion: string
      formanceSchemaVersion: string
      maximumSdkIntegerUnits: string
      architectureReviewCumulativeUnits: string
      deploymentClass: 'local_ci' | 'synthetic_vps_fixture' | 'real_money'
      postgresProtection: 'disposable_fixture' | 'managed_pitr'
      recoveryPointObjectiveMinutes: number
      recoveryTimeObjectiveMinutes: number
    }>
  | Readonly<{
      family: 'operations'
      fundingServiceFeeBps: number
      buyerPricingMarginBps: number
      commitmentTtlMs: number
      formanceSdkVersion: string
      formanceSdkArtifactDigest: string
      backupControl: 'disposable_fixture' | 'postgres_pitr'
      restoreControl: 'disposable_rehearsed' | 'production_rehearsed'
      dailyCloseControl: 'not_required_fixture' | 'human_signed'
    }>

export type CommercialPolicyControls = Readonly<{
  commercial_perimeter: Extract<CommercialPolicyControl, { family: 'commercial_perimeter' }>
  tax: Extract<CommercialPolicyControl, { family: 'tax' }>
  accounting_client_money: Extract<CommercialPolicyControl, { family: 'accounting_client_money' }>
  privacy_retention: Extract<CommercialPolicyControl, { family: 'privacy_retention' }>
  treasury_custody: Extract<CommercialPolicyControl, { family: 'treasury_custody' }>
  operations: Extract<CommercialPolicyControl, { family: 'operations' }>
}>

export const SANDBOX_COMMERCIAL_POLICY_CONTROLS: CommercialPolicyControls = Object.freeze({
  commercial_perimeter: Object.freeze({
    family: 'commercial_perimeter',
    sellerModel: 'principal_reseller',
    customerSegment: 'business_only',
    customerCryptoEntitlement: false,
  }),
  tax: Object.freeze({
    family: 'tax',
    serviceFeeTaxBps: 1_000,
    callTaxBps: 0,
    taxInvoiceIssuance: 'disabled_pending_approval',
  }),
  accounting_client_money: Object.freeze({
    family: 'accounting_client_money',
    minimumFundingPrincipalUnits: '5000000',
    maximumFundingPrincipalUnits: '25000000000',
    fundingIncrementUnits: '10000',
    legalCustomerMaximumAccessibleUnits: '4999999999',
    balanceClassification: 'customer_contract_liability',
  }),
  privacy_retention: Object.freeze({
    family: 'privacy_retention',
    evidenceRetentionDays: 2_557,
    legalHoldSupported: true,
  }),
  treasury_custody: Object.freeze({
    family: 'treasury_custody',
    treasuryAsset: 'USDC',
    treasuryExponent: 6,
    minimumBufferUnits: '0',
    ledgerAuthority: 'formance_community',
    formanceLedgerVersion: PACKAGE4_FORMANCE_REQUIREMENTS.ledgerVersion,
    formanceGatewayVersion: PACKAGE4_FORMANCE_REQUIREMENTS.gatewayVersion,
    formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
    maximumSdkIntegerUnits: PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits,
    architectureReviewCumulativeUnits:
      PACKAGE4_FORMANCE_REQUIREMENTS.architectureReviewCumulativeUnits,
    deploymentClass: 'local_ci',
    postgresProtection: 'disposable_fixture',
    recoveryPointObjectiveMinutes: 0,
    recoveryTimeObjectiveMinutes: 0,
  }),
  operations: Object.freeze({
    family: 'operations',
    fundingServiceFeeBps: 500,
    buyerPricingMarginBps: 0,
    commitmentTtlMs: 5 * 60 * 1_000,
    formanceSdkVersion: PACKAGE4_FORMANCE_REQUIREMENTS.sdkVersion,
    formanceSdkArtifactDigest: PACKAGE4_FORMANCE_REQUIREMENTS.sdkArtifactDigest,
    backupControl: 'disposable_fixture',
    restoreControl: 'disposable_rehearsed',
    dailyCloseControl: 'not_required_fixture',
  }),
})

export const PACKAGE4_SYNTHETIC_VPS_CONTROLS: CommercialPolicyControls = Object.freeze({
  ...SANDBOX_COMMERCIAL_POLICY_CONTROLS,
  treasury_custody: Object.freeze({
    ...SANDBOX_COMMERCIAL_POLICY_CONTROLS.treasury_custody,
    deploymentClass: 'synthetic_vps_fixture',
    postgresProtection: 'managed_pitr',
    recoveryPointObjectiveMinutes: 5,
    recoveryTimeObjectiveMinutes: 60,
  }),
  operations: Object.freeze({
    ...SANDBOX_COMMERCIAL_POLICY_CONTROLS.operations,
    backupControl: 'postgres_pitr',
    restoreControl: 'production_rehearsed',
    dailyCloseControl: 'human_signed',
  }),
})

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
  control: CommercialPolicyControl
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
      controls: CommercialPolicyControls
    }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'commercial_policy_fixture_required'
        | 'commercial_policy_deployment_profile_invalid'
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
  sandboxDeploymentProfile?: Package4SandboxDeploymentProfile
}>): CommercialPolicyGateResult {
  if (input.environment === 'sandbox') {
    if (input.sandboxFixture !== 'managed_x402_deterministic_v1') {
      return Object.freeze({
        kind: 'refused',
        code: 'commercial_policy_fixture_required',
        missingFamilies: COMMERCIAL_POLICY_FAMILIES,
      })
    }
    const deploymentProfile = input.sandboxDeploymentProfile ?? 'local_ci'
    const controls = deploymentProfile === 'synthetic_vps_fixture'
      ? PACKAGE4_SYNTHETIC_VPS_CONTROLS
      : SANDBOX_COMMERCIAL_POLICY_CONTROLS
    const policyRefs = Object.freeze([
      'commercial-policy-fixture:managed_x402_deterministic_v1',
      `commercial-policy-deployment:${deploymentProfile}`,
    ])
    return Object.freeze({
      kind: 'admitted',
      environment: 'sandbox',
      policyRefs,
      controls,
      policyDigest: canonicalDigest({
        format: 'ae.commercial-policy-gate:v1',
        environment: 'sandbox',
        fixture: input.sandboxFixture,
        deploymentProfile,
        controls,
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
    const [current] = active
    if (current === undefined) {
      return Object.freeze({ kind: 'refused', code: 'commercial_policy_conflict', family })
    }
    if (current.control.family !== family || !validCommercialPolicyControl(current.control)) {
      return Object.freeze({ kind: 'refused', code: 'commercial_policy_conflict', family })
    }
    if (input.environment === 'production'
      && !validProductionCommercialPolicyControl(current.control)) {
      return Object.freeze({ kind: 'refused', code: 'commercial_policy_conflict', family })
    }
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
  const controls = Object.freeze(Object.fromEntries(
    selected.map((approval) => [approval.family, approval.control]),
  )) as CommercialPolicyControls
  return Object.freeze({
    kind: 'admitted',
    environment: 'production',
    policyRefs,
    controls,
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
        control: approval.control,
      })),
    }),
  })
}

export function validCommercialPolicyControl(control: CommercialPolicyControl): boolean {
  switch (control.family) {
    case 'commercial_perimeter':
      return control.sellerModel === 'principal_reseller'
        && control.customerSegment === 'business_only'
        && control.customerCryptoEntitlement === false
    case 'tax':
      return validBasisPoints(control.serviceFeeTaxBps)
        && (control.callTaxBps === undefined || validBasisPoints(control.callTaxBps))
        && (control.taxInvoiceIssuance === 'disabled_pending_approval'
          || control.taxInvoiceIssuance === 'enabled')
    case 'accounting_client_money': {
      const minimum = positiveUnits(control.minimumFundingPrincipalUnits)
      const maximum = positiveUnits(control.maximumFundingPrincipalUnits)
      const increment = positiveUnits(control.fundingIncrementUnits)
      const legalMaximum = positiveUnits(control.legalCustomerMaximumAccessibleUnits)
      return minimum !== undefined
        && maximum !== undefined
        && increment !== undefined
        && legalMaximum !== undefined
        && minimum <= maximum
        && minimum % increment === 0n
        && control.balanceClassification === 'customer_contract_liability'
    }
    case 'privacy_retention':
      return Number.isSafeInteger(control.evidenceRetentionDays)
        && control.evidenceRetentionDays > 0
        && control.legalHoldSupported === true
    case 'treasury_custody':
      return control.treasuryAsset === 'USDC'
        && control.treasuryExponent === 6
        && nonnegativeUnits(control.minimumBufferUnits) !== undefined
        && control.ledgerAuthority === 'formance_community'
        && validVersion(control.formanceLedgerVersion)
        && validVersion(control.formanceGatewayVersion)
        && validVersion(control.formanceSchemaVersion)
        && positiveUnits(control.maximumSdkIntegerUnits) !== undefined
        && positiveUnits(control.architectureReviewCumulativeUnits) !== undefined
        && ['local_ci', 'synthetic_vps_fixture', 'real_money']
          .includes(control.deploymentClass)
        && ['disposable_fixture', 'managed_pitr'].includes(control.postgresProtection)
        && validNonnegativeMinutes(control.recoveryPointObjectiveMinutes)
        && validNonnegativeMinutes(control.recoveryTimeObjectiveMinutes)
    case 'operations':
      return validBasisPoints(control.fundingServiceFeeBps)
        && validBasisPoints(control.buyerPricingMarginBps)
        && Number.isSafeInteger(control.commitmentTtlMs)
        && control.commitmentTtlMs >= 10_000
        && control.commitmentTtlMs <= 15 * 60 * 1_000
        && validVersion(control.formanceSdkVersion)
        && /^sha256:[a-f0-9]{64}$/u.test(control.formanceSdkArtifactDigest)
        && ['disposable_fixture', 'postgres_pitr'].includes(control.backupControl)
        && ['disposable_rehearsed', 'production_rehearsed'].includes(control.restoreControl)
        && ['not_required_fixture', 'human_signed'].includes(control.dailyCloseControl)
  }
}

function validProductionCommercialPolicyControl(control: CommercialPolicyControl): boolean {
  switch (control.family) {
    case 'treasury_custody':
      return control.formanceLedgerVersion === PACKAGE4_FORMANCE_REQUIREMENTS.ledgerVersion
        && control.formanceGatewayVersion === PACKAGE4_FORMANCE_REQUIREMENTS.gatewayVersion
        && control.formanceSchemaVersion === PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion
        && control.maximumSdkIntegerUnits
          === PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits
        && control.architectureReviewCumulativeUnits
          === PACKAGE4_FORMANCE_REQUIREMENTS.architectureReviewCumulativeUnits
        && control.deploymentClass === 'real_money'
        && control.postgresProtection === 'managed_pitr'
        && control.recoveryPointObjectiveMinutes > 0
        && control.recoveryPointObjectiveMinutes <= 5
        && control.recoveryTimeObjectiveMinutes > 0
        && control.recoveryTimeObjectiveMinutes <= 60
    case 'operations':
      return control.formanceSdkVersion === PACKAGE4_FORMANCE_REQUIREMENTS.sdkVersion
        && control.formanceSdkArtifactDigest
          === PACKAGE4_FORMANCE_REQUIREMENTS.sdkArtifactDigest
        && control.backupControl === 'postgres_pitr'
        && control.restoreControl === 'production_rehearsed'
        && control.dailyCloseControl === 'human_signed'
    default:
      return true
  }
}

function positiveUnits(value: string): bigint | undefined {
  return /^[1-9]\d{0,29}$/u.test(value) ? BigInt(value) : undefined
}

function nonnegativeUnits(value: string): bigint | undefined {
  return /^(?:0|[1-9]\d{0,29})$/u.test(value) ? BigInt(value) : undefined
}

function validBasisPoints(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10_000
}

function validNonnegativeMinutes(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function validVersion(value: string): boolean {
  return /^v?\d+\.\d+\.\d+$/u.test(value)
}
