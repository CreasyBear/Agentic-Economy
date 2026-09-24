import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { Doc } from '../../../_generated/dataModel'
import {
  SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
} from '../../../capabilitySupplyCanaryFunding'
import {
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
  type SellerOnboardingCanaryInvocationObservation,
} from '../../../../src/modules/capability-execution'
import { materializeRuntimePublishedTool, parsePublishedToolSnapshot, sellerCanaryCompletionEvidenceMatches, type X402SellerPromotionAnchor } from '../../../../src/modules/capability-supply/public'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../../../src/modules/common/stable-hash'
import { compareExactAmounts, readExactAmount } from '../../../../src/modules/money/public'

export function promotionAnchorFromEnvelope(
  envelope: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
): X402SellerPromotionAnchor {
  return {
    ownerId: envelope.ownerId,
    businessId: envelope.businessId,
    offeringRef: envelope.offeringRef,
    offeringRevision: envelope.offeringRevision,
    offeringSourceHash: envelope.offeringSourceHash,
    accessPathRef: envelope.accessPathRef,
    accessPathSourceHash: envelope.accessPathSourceHash,
    publicationRef: envelope.publicationRef,
    publicationRevision: envelope.publicationRevision,
    draftOperationRef: envelope.toolRef,
    toolMaterialDigest: envelope.toolMaterialDigest,
    contractDigest: envelope.contractDigest,
    bindingDigest: envelope.bindingDigest,
    priceDigest: envelope.priceDigest,
    sellerPayTo: envelope.sellerPayTo,
    sellerClaimDigest: envelope.sellerClaimDigest,
    readinessDigest: envelope.readinessDigest,
    readinessObservedAt: envelope.readinessObservedAt,
    readinessValidUntil: envelope.readinessValidUntil,
  }
}

export function reconstructCanaryCommitment(
  envelope: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
) {
  try {
    const commitment = createSellerOnboardingCanaryCommitment({
      ownerId: envelope.ownerId,
      businessId: envelope.businessId,
      offeringRef: envelope.offeringRef,
      offeringRevision: envelope.offeringRevision,
      offeringSourceHash: envelope.offeringSourceHash,
      accessPathRef: envelope.accessPathRef,
      accessPathSourceHash: envelope.accessPathSourceHash,
      publicationRef: envelope.publicationRef,
      publicationRevision: envelope.publicationRevision,
      draftOperationRef: envelope.toolRef,
      toolMaterialDigest: envelope.toolMaterialDigest,
      contractDigest: envelope.contractDigest,
      bindingDigest: envelope.bindingDigest,
      priceDigest: envelope.priceDigest,
      sellerPayTo: envelope.sellerPayTo,
      sellerClaimDigest: envelope.sellerClaimDigest,
      readinessDigest: envelope.readinessDigest,
      readinessObservedAt: envelope.readinessObservedAt,
      readinessValidUntil: envelope.readinessValidUntil,
      expectedOutputSchemaDigest: envelope.expectedOutputSchemaDigest,
      expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
      inputDigest: envelope.inputDigest,
      idempotencyKey: envelope.idempotencyKey,
      fundingBudgetRef: envelope.funding.budgetRef,
      fundingPrincipalId: envelope.funding.principalId,
      fundingOwnerId: envelope.funding.ownerId,
      fundingCredentialId: envelope.funding.credentialId,
      fundingApplicationRef: envelope.funding.applicationRef,
      fundingGrantRef: envelope.funding.grantRef,
      fundingGrantGeneration: envelope.funding.grantGeneration,
      fundingPolicyDigest: envelope.funding.policyDigest,
      requestedSpend: envelope.funding.requestedSpend,
      maximumSpend: envelope.funding.maximumSpend,
      expiresAt: envelope.expiresAt,
      now: 0,
    })
    return canonicalDigest(
      sellerOnboardingCanaryExecutionEnvelope(commitment) as StableHashValue,
    ) === canonicalDigest(envelope as StableHashValue)
      ? commitment
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'reconstructCanaryCommitment', reason: 'invalid_response' })
  }
}

export function canaryObservation(
  row: Doc<'capabilityCalls'>,
  outputContractValid: boolean,
  outputDeterministic: boolean,
): SellerOnboardingCanaryInvocationObservation {
  const envelope = row.sellerOnboardingCanary
  if (envelope === undefined) throw new Error('seller_canary_envelope_missing')
  const result = row.result
  const receipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
  const ambiguous = row.state === 'reconciliation_required'
    || result?.kind === 'reconciliation_required'
    || receipt?.state === 'reconciliation_required'
    || receipt?.refundState === 'unknown'
    || receipt?.lossState === 'unknown'
  const state: SellerOnboardingCanaryInvocationObservation['state'] = ambiguous
    ? 'reconciliation_required'
    : row.state === 'pending'
      ? 'pending'
      : row.state === 'completed' && result?.kind === 'completed'
        ? 'completed'
        : row.state === 'cancelled'
          ? 'cancelled'
          : 'refused'
  const paymentState = receipt?.state === 'reconciliation_required'
    || receipt?.refundState === 'unknown'
    || receipt?.lossState === 'unknown'
    ? 'reconciliation_required' as const
    : receipt?.state === 'settled'
      && receipt.refundState === 'not_applicable'
      && receipt.lossState === 'none'
      ? 'settled' as const
      : 'refunded' as const
  return {
    executionPurpose: envelope.executionPurpose,
    canaryRef: envelope.canaryRef,
    canaryCommitmentDigest: envelope.canaryCommitmentDigest,
    callRef: row.callRef,
    toolRef: row.toolRef,
    inputDigest: row.inputDigest,
    state,
    outputContractValid,
    outputUsable: outputContractValid && outputDeterministic,
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(receipt === undefined || receipt.commercialModel !== 'seller_canary_x402' ? {} : {
      payment: {
        state: paymentState,
        amount: receipt.providerQuotedAmount,
        priceDigest: receipt.priceDigest,
        ...(receipt.paymentIdentifier === undefined ? {} : { paymentIdentifier: receipt.paymentIdentifier }),
        ...(receipt.settlementTransactionHash === undefined
          ? {}
          : { settlementTransactionHash: receipt.settlementTransactionHash }),
        ...(receipt.externalSettlementRef === undefined
          ? {}
          : { externalSettlementRef: receipt.externalSettlementRef }),
      },
    }),
  }
}

export function exactPlatformCanaryFundingEvidence(
  row: Doc<'capabilityCalls'>,
  envelope: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
): boolean {
  const funding = envelope.funding
  const authority = row.authority
  const authorizedAmount = readExactAmount(authority?.limits.amount)
  const exactEnvironmentIdentity = row.environment === 'sandbox'
    ? funding.applicationRef === SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF
      && funding.grantRef === SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF
    : row.environment === 'production'
      ? funding.applicationRef === PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF
        && /^agent-access-grant:platform:seller-onboarding-canary:production:v[1-9]\d*$/.test(funding.grantRef)
      : false
  if (funding.ownerId === envelope.ownerId
    || !exactEnvironmentIdentity
    || row.principalId !== funding.principalId
    || row.ownerId !== funding.ownerId
    || row.credentialId !== funding.credentialId
    || row.applicationRef !== funding.applicationRef
    || row.grantRef !== funding.grantRef
    || row.grantGeneration !== funding.grantGeneration
    || row.policyDigest !== funding.policyDigest
    || authority === undefined
    || authorizedAmount === undefined) return false
  return authority.callRef === row.callRef
    && authority.toolRef === row.toolRef
    && authority.inputDigest === row.inputDigest
    && authority.grantRef === funding.grantRef
    && authority.grantGeneration === funding.grantGeneration
    && authority.grantDigest === funding.policyDigest
    && authority.acceptedBasis.kind === 'spending_policy_use'
    && authority.acceptedBasis.spendingPolicyRef === `agent-access-grant:${funding.grantRef}`
    && authority.acceptedBasis.spendingPolicyGeneration === funding.grantGeneration
    && authority.acceptedBasis.grantEvidenceRef === `agent-access-grant-evidence:${funding.policyDigest}`
    && compareExactAmounts(authorizedAmount, funding.requestedSpend) === 0
}

export function promotionOutputEvidence(
  row: Doc<'capabilityCalls'>,
  operation: NonNullable<ReturnType<typeof parsePublishedToolSnapshot>>,
): Readonly<{
  contractValid: boolean
  deterministic: boolean
  assertionMatched: boolean
  outputDigest: string
}> {
  const result = row.result
  if (row.state !== 'completed' || result?.kind !== 'completed') {
    return {
      contractValid: false,
      deterministic: false,
      assertionMatched: false,
      outputDigest: canonicalDigest(null),
    }
  }
  let contractValid = false
  try {
    contractValid = materializeRuntimePublishedTool(operation).validateOutput(result.output)
  } catch (cause) {
    contractValid = degradeBackend(cause, false, { site: 'promotionOutputEvidence', reason: 'invalid_response' })
  }
  const receipt = result.receipt
  const deterministic = row.evidenceHash !== undefined
    && row.evidenceHash === result.evidenceHash
    && receipt !== undefined
    && receipt.evidenceHash === result.evidenceHash
  const envelope = row.sellerOnboardingCanary
  const expectedOutputSchemaDigest = canonicalDigest(operation.contract.outputSchema as StableHashValue)
  const expectedOutputEvidenceDigest = canonicalDigest({
    kind: 'seller_onboarding_canary_expected_output:v1',
    toolMaterialDigest: operation.materialDigest,
    contractDigest: operation.identity.contractDigest,
    inputDigest: row.inputDigest,
    outputSchema: operation.contract.outputSchema,
    evidence: operation.contract.evidence,
  } as StableHashValue)
  return {
    contractValid,
    deterministic,
    assertionMatched: envelope !== undefined
      && sellerCanaryCompletionEvidenceMatches(result.output, operation.contract.evidence)
      && envelope.expectedOutputSchemaDigest === expectedOutputSchemaDigest
      && envelope.expectedOutputEvidenceDigest === expectedOutputEvidenceDigest,
    outputDigest: canonicalDigest(result.output as StableHashValue),
  }
}

