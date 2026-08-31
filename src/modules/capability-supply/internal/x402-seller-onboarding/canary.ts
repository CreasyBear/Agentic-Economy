import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  compareExactAmounts,
  readExactAmount,
  type ExactAmount,
} from '@/modules/money/public'
import {
  evmAddressEquals,
  isNonzeroEvmAddress,
} from '../x402-evm-protocol'

export const SELLER_ONBOARDING_CANARY_PURPOSE = 'seller_onboarding_canary' as const

export type OperationExecutionPurpose = 'market_call' | typeof SELLER_ONBOARDING_CANARY_PURPOSE

export type SellerOnboardingCanaryCommitment = Readonly<{
  format: 'seller-onboarding-canary-commitment:v1'
  purpose: typeof SELLER_ONBOARDING_CANARY_PURPOSE
  canaryRef: string
  commitmentDigest: string
  ownerId: string
  businessId: string
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  accessPathRef: string
  accessPathSourceHash: string
  publicationRef: string
  publicationRevision: number
  draftOperationRef: string
  operationMaterialDigest: string
  contractDigest: string
  bindingDigest: string
  priceDigest: string
  sellerPayTo: string
  sellerClaimDigest: string
  readinessDigest: string
  readinessObservedAt: number
  readinessValidUntil: number
  expectedOutputSchemaDigest: string
  expectedOutputEvidenceDigest: string
  inputDigest: string
  idempotencyKey: string
  funding: Readonly<{
    kind: 'ae_owned'
    principalId: string
    ownerId: string
    credentialId: string
    applicationRef: string
    grantRef: string
    grantGeneration: number
    policyDigest: string
    budgetRef: string
    maximumSpend: ExactAmount
    requestedSpend: ExactAmount
    ledgerEffects: 'external_spend_only'
  }>
  expiresAt: number
}>

export type SellerOnboardingCanaryExecutionEnvelope = Readonly<{
  executionPurpose: typeof SELLER_ONBOARDING_CANARY_PURPOSE
  canaryRef: string
  canaryCommitmentDigest: string
  invocationRef: string
  operationRef: string
  ownerId: string
  businessId: string
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  accessPathRef: string
  accessPathSourceHash: string
  publicationRef: string
  publicationRevision: number
  operationMaterialDigest: string
  contractDigest: string
  bindingDigest: string
  priceDigest: string
  sellerPayTo: string
  sellerClaimDigest: string
  readinessDigest: string
  readinessObservedAt: number
  readinessValidUntil: number
  expectedOutputSchemaDigest: string
  expectedOutputEvidenceDigest: string
  expiresAt: number
  inputDigest: string
  idempotencyKey: string
  funding: SellerOnboardingCanaryCommitment['funding']
  accountingPolicy: Readonly<{
    recordBuyerUsage: false
    accrueProviderEarnings: false
    accruePlatformRake: false
    recordQualifiedUse: false
  }>
}>

export type SellerOnboardingCanaryInvocationObservation = Readonly<{
  executionPurpose: OperationExecutionPurpose
  canaryRef?: string
  canaryCommitmentDigest?: string
  invocationRef: string
  operationRef: string
  inputDigest: string
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  outputContractValid: boolean
  outputUsable: boolean
  evidenceHash?: string
  payment?: Readonly<{
    state: 'settled' | 'refunded' | 'reconciliation_required'
    amount: ExactAmount
    priceDigest: string
    paymentIdentifier?: string
    settlementTransactionHash?: string
    externalSettlementRef?: string
  }>
}>

export type CurrentSellerCanaryOperationCommitment = Readonly<{
  draftOperationRef: string
  operationMaterialDigest: string
  contractDigest: string
  bindingDigest: string
  priceDigest: string
}>

export type SellerOnboardingCanaryPromotionEvidence = Readonly<{
  format: 'seller-onboarding-canary-promotion-evidence:v1'
  canaryRef: string
  canaryCommitmentDigest: string
  invocationRef: string
  draftOperationRef: string
  operationMaterialDigest: string
  contractDigest: string
  bindingDigest: string
  priceDigest: string
  inputDigest: string
  paymentIdentifier: string
  settlementTransactionHash: string
  externalSettlementRef: string
  outputEvidenceHash: string
  promotionEvidenceDigest: string
}>

export type SellerOnboardingCanaryStatus =
  | Readonly<{ kind: 'pending'; canaryRef: string; invocationRef: string }>
  | Readonly<{ kind: 'reconciliation_required'; canaryRef: string; invocationRef: string }>
  | Readonly<{
      kind: 'failed'
      canaryRef: string
      invocationRef: string
      code:
        | 'canary_identity_mismatch'
        | 'canary_expired'
        | 'operation_commitment_stale'
        | 'invocation_refused'
        | 'payment_not_settled'
        | 'payment_evidence_missing'
        | 'spend_commitment_mismatch'
        | 'output_contract_invalid'
        | 'output_unusable'
    }>
  | Readonly<{
      kind: 'passed'
      canaryRef: string
      invocationRef: string
      promotionEvidence: SellerOnboardingCanaryPromotionEvidence
    }>

export type CreateSellerOnboardingCanaryInput = Readonly<{
  ownerId: string
  businessId: string
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  accessPathRef: string
  accessPathSourceHash: string
  publicationRef: string
  publicationRevision: number
  draftOperationRef: string
  operationMaterialDigest: string
  contractDigest: string
  bindingDigest: string
  priceDigest: string
  sellerPayTo: string
  sellerClaimDigest: string
  readinessDigest: string
  readinessObservedAt: number
  readinessValidUntil: number
  expectedOutputSchemaDigest: string
  expectedOutputEvidenceDigest: string
  inputDigest: string
  idempotencyKey: string
  fundingBudgetRef: string
  fundingPrincipalId: string
  fundingOwnerId: string
  fundingCredentialId: string
  fundingApplicationRef: string
  fundingGrantRef: string
  fundingGrantGeneration: number
  fundingPolicyDigest: string
  requestedSpend: ExactAmount
  maximumSpend: ExactAmount
  expiresAt: number
  now: number
}>

function requiredRef(value: string, code: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 512) throw new Error(code)
  return normalized
}

function requiredDigest(value: string, code: string): string {
  if (!isCanonicalDigest(value)) throw new Error(code)
  return value
}

export function validSellerCanaryPayee(
  sellerPayTo: string,
  managedPayer?: string,
): boolean {
  return isNonzeroEvmAddress(sellerPayTo)
    && (managedPayer === undefined
      || (isNonzeroEvmAddress(managedPayer)
        && !evmAddressEquals(sellerPayTo, managedPayer)))
}

function canaryCommitmentMaterial(input: CreateSellerOnboardingCanaryInput) {
  const requestedSpend = readExactAmount(input.requestedSpend)
  const maximumSpend = readExactAmount(input.maximumSpend)
  const comparison = requestedSpend === undefined || maximumSpend === undefined
    ? undefined
    : compareExactAmounts(requestedSpend, maximumSpend)
  if (
    requestedSpend === undefined
    || maximumSpend === undefined
    || requestedSpend.units === '0'
    || comparison === undefined
    || comparison > 0
  ) throw new Error('seller_onboarding_canary_spend_invalid')
  if (!Number.isSafeInteger(input.now) || input.now < 0) throw new Error('seller_onboarding_canary_now_invalid')
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= input.now) {
    throw new Error('seller_onboarding_canary_expiry_invalid')
  }
  if (
    !Number.isSafeInteger(input.offeringRevision) || input.offeringRevision <= 0
    || !Number.isSafeInteger(input.publicationRevision) || input.publicationRevision <= 0
    || !Number.isSafeInteger(input.fundingGrantGeneration) || input.fundingGrantGeneration <= 0
    || !Number.isSafeInteger(input.readinessObservedAt) || input.readinessObservedAt < 0
    || !Number.isSafeInteger(input.readinessValidUntil)
    || input.readinessValidUntil <= input.now
    || input.expiresAt > input.readinessValidUntil
  ) throw new Error('seller_onboarding_canary_revision_invalid')
  if (!validSellerCanaryPayee(input.sellerPayTo)) {
    throw new Error('seller_onboarding_canary_payee_invalid')
  }
  if (input.fundingOwnerId.trim() === input.ownerId.trim()) {
    throw new Error('seller_onboarding_canary_funding_owner_invalid')
  }
  return {
    format: 'seller-onboarding-canary-commitment:v1' as const,
    purpose: SELLER_ONBOARDING_CANARY_PURPOSE,
    ownerId: requiredRef(input.ownerId, 'seller_onboarding_canary_owner_invalid'),
    businessId: requiredRef(input.businessId, 'seller_onboarding_canary_business_invalid'),
    offeringRef: requiredRef(input.offeringRef, 'seller_onboarding_canary_offering_invalid'),
    offeringRevision: input.offeringRevision,
    offeringSourceHash: requiredDigest(input.offeringSourceHash, 'seller_onboarding_canary_offering_digest_invalid'),
    accessPathRef: requiredRef(input.accessPathRef, 'seller_onboarding_canary_access_path_invalid'),
    accessPathSourceHash: requiredDigest(input.accessPathSourceHash, 'seller_onboarding_canary_access_path_digest_invalid'),
    publicationRef: requiredRef(input.publicationRef, 'seller_onboarding_canary_publication_invalid'),
    publicationRevision: input.publicationRevision,
    draftOperationRef: requiredRef(input.draftOperationRef, 'seller_onboarding_canary_operation_invalid'),
    operationMaterialDigest: requiredDigest(input.operationMaterialDigest, 'seller_onboarding_canary_operation_digest_invalid'),
    contractDigest: requiredDigest(input.contractDigest, 'seller_onboarding_canary_contract_digest_invalid'),
    bindingDigest: requiredDigest(input.bindingDigest, 'seller_onboarding_canary_binding_digest_invalid'),
    priceDigest: requiredDigest(input.priceDigest, 'seller_onboarding_canary_price_digest_invalid'),
    sellerPayTo: input.sellerPayTo,
    sellerClaimDigest: requiredDigest(input.sellerClaimDigest, 'seller_onboarding_canary_claim_digest_invalid'),
    readinessDigest: requiredDigest(input.readinessDigest, 'seller_onboarding_canary_readiness_digest_invalid'),
    readinessObservedAt: input.readinessObservedAt,
    readinessValidUntil: input.readinessValidUntil,
    expectedOutputSchemaDigest: requiredDigest(input.expectedOutputSchemaDigest, 'seller_onboarding_canary_output_schema_digest_invalid'),
    expectedOutputEvidenceDigest: requiredDigest(input.expectedOutputEvidenceDigest, 'seller_onboarding_canary_output_evidence_digest_invalid'),
    inputDigest: requiredDigest(input.inputDigest, 'seller_onboarding_canary_input_digest_invalid'),
    idempotencyKey: requiredRef(input.idempotencyKey, 'seller_onboarding_canary_idempotency_invalid'),
    funding: {
      kind: 'ae_owned' as const,
      principalId: requiredRef(input.fundingPrincipalId, 'seller_onboarding_canary_funding_principal_invalid'),
      ownerId: requiredRef(input.fundingOwnerId, 'seller_onboarding_canary_funding_owner_invalid'),
      credentialId: requiredRef(input.fundingCredentialId, 'seller_onboarding_canary_funding_credential_invalid'),
      applicationRef: requiredRef(input.fundingApplicationRef, 'seller_onboarding_canary_funding_application_invalid'),
      grantRef: requiredRef(input.fundingGrantRef, 'seller_onboarding_canary_funding_grant_invalid'),
      grantGeneration: input.fundingGrantGeneration,
      policyDigest: requiredDigest(input.fundingPolicyDigest, 'seller_onboarding_canary_funding_policy_invalid'),
      budgetRef: requiredRef(input.fundingBudgetRef, 'seller_onboarding_canary_budget_invalid'),
      maximumSpend,
      requestedSpend,
      ledgerEffects: 'external_spend_only' as const,
    },
    expiresAt: input.expiresAt,
  }
}

function canaryStableIdentityMaterial(
  material: ReturnType<typeof canaryCommitmentMaterial>,
) {
  return {
    format: 'seller-onboarding-canary-identity:v2' as const,
    purpose: material.purpose,
    ownerId: material.ownerId,
    businessId: material.businessId,
    offeringRef: material.offeringRef,
    offeringRevision: material.offeringRevision,
    offeringSourceHash: material.offeringSourceHash,
    accessPathRef: material.accessPathRef,
    accessPathSourceHash: material.accessPathSourceHash,
    publicationRef: material.publicationRef,
    publicationRevision: material.publicationRevision,
    draftOperationRef: material.draftOperationRef,
    // operationMaterialDigest currently incorporates readiness evidence. The
    // stable source/contract/binding/price fields below are the charge
    // material; a readiness refresh must never mint permission for a second
    // payment against the same exact publication.
    contractDigest: material.contractDigest,
    bindingDigest: material.bindingDigest,
    priceDigest: material.priceDigest,
    sellerPayTo: material.sellerPayTo.toLowerCase(),
  }
}

export function createSellerOnboardingCanaryCommitment(
  input: CreateSellerOnboardingCanaryInput,
): SellerOnboardingCanaryCommitment {
  const material = canaryCommitmentMaterial(input)
  const commitmentDigest = canonicalDigest(material as StableHashValue)
  const identityDigest = canonicalDigest(
    canaryStableIdentityMaterial(material) as StableHashValue,
  )
  return Object.freeze({
    ...material,
    canaryRef: `seller-canary:${identityDigest.slice('sha256:'.length)}`,
    commitmentDigest,
  })
}

export function sellerOnboardingCanaryExecutionEnvelope(
  commitment: SellerOnboardingCanaryCommitment,
): SellerOnboardingCanaryExecutionEnvelope {
  return Object.freeze({
    executionPurpose: SELLER_ONBOARDING_CANARY_PURPOSE,
    canaryRef: commitment.canaryRef,
    canaryCommitmentDigest: commitment.commitmentDigest,
    invocationRef: `seller-canary-invocation:${commitment.canaryRef.slice('seller-canary:'.length)}`,
    operationRef: commitment.draftOperationRef,
    ownerId: commitment.ownerId,
    businessId: commitment.businessId,
    offeringRef: commitment.offeringRef,
    offeringRevision: commitment.offeringRevision,
    offeringSourceHash: commitment.offeringSourceHash,
    accessPathRef: commitment.accessPathRef,
    accessPathSourceHash: commitment.accessPathSourceHash,
    publicationRef: commitment.publicationRef,
    publicationRevision: commitment.publicationRevision,
    operationMaterialDigest: commitment.operationMaterialDigest,
    contractDigest: commitment.contractDigest,
    bindingDigest: commitment.bindingDigest,
    priceDigest: commitment.priceDigest,
    sellerPayTo: commitment.sellerPayTo,
    sellerClaimDigest: commitment.sellerClaimDigest,
    readinessDigest: commitment.readinessDigest,
    readinessObservedAt: commitment.readinessObservedAt,
    readinessValidUntil: commitment.readinessValidUntil,
    expectedOutputSchemaDigest: commitment.expectedOutputSchemaDigest,
    expectedOutputEvidenceDigest: commitment.expectedOutputEvidenceDigest,
    expiresAt: commitment.expiresAt,
    inputDigest: commitment.inputDigest,
    idempotencyKey: commitment.idempotencyKey,
    funding: commitment.funding,
    accountingPolicy: {
      recordBuyerUsage: false as const,
      accrueProviderEarnings: false as const,
      accruePlatformRake: false as const,
      recordQualifiedUse: false as const,
    },
  })
}

function observationIdentityMatches(
  commitment: SellerOnboardingCanaryCommitment,
  observation: SellerOnboardingCanaryInvocationObservation,
): boolean {
  return observation.executionPurpose === SELLER_ONBOARDING_CANARY_PURPOSE
    && observation.canaryRef === commitment.canaryRef
    && observation.canaryCommitmentDigest === commitment.commitmentDigest
    && observation.operationRef === commitment.draftOperationRef
    && observation.inputDigest === commitment.inputDigest
}

function currentCommitmentMatches(
  commitment: SellerOnboardingCanaryCommitment,
  current: CurrentSellerCanaryOperationCommitment,
): boolean {
  return current.draftOperationRef === commitment.draftOperationRef
    && current.operationMaterialDigest === commitment.operationMaterialDigest
    && current.contractDigest === commitment.contractDigest
    && current.bindingDigest === commitment.bindingDigest
    && current.priceDigest === commitment.priceDigest
}

function failed(
  commitment: SellerOnboardingCanaryCommitment,
  observation: SellerOnboardingCanaryInvocationObservation,
  code: Extract<SellerOnboardingCanaryStatus, { kind: 'failed' }>['code'],
): SellerOnboardingCanaryStatus {
  return { kind: 'failed', canaryRef: commitment.canaryRef, invocationRef: observation.invocationRef, code }
}

/**
 * Produce the sole evidence shape that an atomic publication mutation may
 * accept. This function never changes routeability and fails closed on stale,
 * partial, refunded, over-budget, or unusable executions.
 */
export function projectSellerOnboardingCanaryStatus(input: Readonly<{
  commitment: SellerOnboardingCanaryCommitment
  observation: SellerOnboardingCanaryInvocationObservation
  currentOperation: CurrentSellerCanaryOperationCommitment
  now: number
}>): SellerOnboardingCanaryStatus {
  const { commitment, observation, currentOperation } = input
  if (!observationIdentityMatches(commitment, observation)) {
    return failed(commitment, observation, 'canary_identity_mismatch')
  }
  if (!Number.isSafeInteger(input.now) || input.now < 0) return failed(commitment, observation, 'canary_expired')
  // An ambiguous payment can never become retryable merely because the short
  // execution authority expired. Reconciliation owns the next transition.
  if (observation.state === 'reconciliation_required') {
    return { kind: 'reconciliation_required', canaryRef: commitment.canaryRef, invocationRef: observation.invocationRef }
  }
  // Refused/cancelled are terminal for this exact charge identity. The caller
  // must change and re-admit material to obtain a new canary; it must not retry
  // the same publication with a fresh funding grant or operation key.
  if (observation.state === 'refused' || observation.state === 'cancelled') {
    return failed(commitment, observation, 'invocation_refused')
  }
  // expiresAt bounds starting/completing the controlled call. Once an exact
  // settled result exists, its durable evidence remains reviewable for an
  // explicit promotion after this short window.
  if (observation.state === 'pending' && input.now > commitment.expiresAt) {
    return failed(commitment, observation, 'canary_expired')
  }
  if (!currentCommitmentMatches(commitment, currentOperation)) {
    return failed(commitment, observation, 'operation_commitment_stale')
  }
  if (observation.state === 'pending') {
    return { kind: 'pending', canaryRef: commitment.canaryRef, invocationRef: observation.invocationRef }
  }
  if (observation.state !== 'completed') return failed(commitment, observation, 'invocation_refused')
  if (!observation.outputContractValid) return failed(commitment, observation, 'output_contract_invalid')
  if (!observation.outputUsable) return failed(commitment, observation, 'output_unusable')
  const payment = observation.payment
  if (payment === undefined || payment.state !== 'settled') {
    return failed(commitment, observation, 'payment_not_settled')
  }
  if (
    payment.paymentIdentifier === undefined
    || payment.settlementTransactionHash === undefined
    || payment.externalSettlementRef === undefined
    || observation.evidenceHash === undefined
  ) return failed(commitment, observation, 'payment_evidence_missing')
  if (
    payment.priceDigest !== commitment.priceDigest
    || compareExactAmounts(payment.amount, commitment.funding.requestedSpend) !== 0
    || compareExactAmounts(payment.amount, commitment.funding.maximumSpend) === undefined
    || compareExactAmounts(payment.amount, commitment.funding.maximumSpend)! > 0
  ) return failed(commitment, observation, 'spend_commitment_mismatch')

  const evidenceMaterial = {
    format: 'seller-onboarding-canary-promotion-evidence:v1' as const,
    canaryRef: commitment.canaryRef,
    canaryCommitmentDigest: commitment.commitmentDigest,
    invocationRef: observation.invocationRef,
    draftOperationRef: commitment.draftOperationRef,
    operationMaterialDigest: commitment.operationMaterialDigest,
    contractDigest: commitment.contractDigest,
    bindingDigest: commitment.bindingDigest,
    priceDigest: commitment.priceDigest,
    inputDigest: commitment.inputDigest,
    paymentIdentifier: payment.paymentIdentifier,
    settlementTransactionHash: payment.settlementTransactionHash,
    externalSettlementRef: payment.externalSettlementRef,
    outputEvidenceHash: observation.evidenceHash,
  }
  return {
    kind: 'passed',
    canaryRef: commitment.canaryRef,
    invocationRef: observation.invocationRef,
    promotionEvidence: {
      ...evidenceMaterial,
      promotionEvidenceDigest: canonicalDigest(evidenceMaterial as StableHashValue),
    },
  }
}
