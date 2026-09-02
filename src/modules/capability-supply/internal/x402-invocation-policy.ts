import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { RouteTransportObservation } from '../route-transport-runtime'

export type X402ExecutionContext =
  | Readonly<{
      kind: 'market'
      paymentProfile: 'base-usdc-exact' | 'base-sepolia-usdc-exact'
    }>
  | Readonly<{
      kind: 'seller_onboarding_canary'
      paymentProfile: 'base-sepolia-usdc-exact'
      canaryRef: string
      canaryCommitmentDigest: string
      fundingBudgetRef: string
    }>

export type X402SettlementStatus = 'settled' | 'not_settled' | 'unknown'

export type EconomicRail =
  | 'provider_direct_x402'
  | 'brokered_x402'
  | 'managed_testnet_canary'
  | 'ae_internal'

export type PaymentLaneAdmission =
  | Readonly<{
      kind: 'admitted'
      lane: 'brokered' | 'provider_direct_x402' | 'managed_testnet_canary'
    }>
  | Readonly<{
    kind: 'refused'
    lane: 'provider_direct_x402'
    code: 'payment_lane_not_brokered'
  }>
  | Readonly<{
      kind: 'refused'
      lane: EconomicRail
    code: 'payment_lane_execution_context_invalid'
  }>

export function economicRailForInvocation(input: Readonly<{
  isX402: boolean
  sellerOnboardingCanary: boolean
}>): EconomicRail {
  if (input.sellerOnboardingCanary) return 'managed_testnet_canary'
  return input.isX402 ? 'brokered_x402' : 'ae_internal'
}

/**
 * V1 brokers every market call so AE can validate the output before value moves, take its rake on
 * settlement, and answer for the charge when the buyer disputes it. A provider-direct rail settles
 * between buyer and provider outside AE's ledger and forfeits all three, so the Operation worker
 * always selects the brokered lane. Non-production keeps the lower-level direct rail admitted for
 * host-parity and provider-conformance tests; it is not a public Operation execution lane.
 * The one managed non-production exception is an explicit seller-onboarding
 * canary on AE sandbox, which maps to CDP's `environment: "development"` and
 * the Base Sepolia profile used by its maintained x402 spend-control example.
 */
export function paymentLaneAdmission(
  input: Readonly<{
    rail: EconomicRail
    environment: string
    executionContext?: X402ExecutionContext
  }>,
): PaymentLaneAdmission {
  const explicitContext = input.executionContext
  const resolvedContext = (
    input.environment === 'sandbox'
    || input.environment === 'production'
  )
    ? x402ExecutionContextForFacts({
        environment: input.environment,
        ...(explicitContext === undefined
          ? {}
          : { executionContext: explicitContext }),
      })
    : undefined
  if (
    explicitContext !== undefined
    && (
      resolvedContext === undefined
      || (resolvedContext.kind === 'seller_onboarding_canary'
        && input.rail !== 'managed_testnet_canary')
      || (resolvedContext.kind === 'market'
        && input.rail === 'managed_testnet_canary')
    )
  ) {
    return {
      kind: 'refused',
      lane: input.rail,
      code: 'payment_lane_execution_context_invalid',
    }
  }
  switch (input.rail) {
    case 'ae_internal':
      return { kind: 'admitted', lane: 'brokered' }
    case 'brokered_x402':
      return { kind: 'admitted', lane: 'brokered' }
    case 'managed_testnet_canary':
      return input.environment === 'sandbox'
        && explicitContext !== undefined
        && resolvedContext?.kind === 'seller_onboarding_canary'
        ? { kind: 'admitted', lane: 'managed_testnet_canary' }
        : {
            kind: 'refused',
            lane: 'managed_testnet_canary',
            code: 'payment_lane_execution_context_invalid',
          }
    case 'provider_direct_x402':
      return input.environment === 'production'
        ? {
          kind: 'refused',
          lane: 'provider_direct_x402',
          code: 'payment_lane_not_brokered',
        }
        : { kind: 'admitted', lane: 'provider_direct_x402' }
    default: {
      const _exhaustive: never = input.rail
      return _exhaustive
    }
  }
}

export function x402SettlementStatusForObservation(
  observation: RouteTransportObservation,
): X402SettlementStatus {
  const evidence = observation.settlementEvidence
  if (evidence === undefined) return 'unknown'
  switch (evidence.kind) {
    case 'not_submitted':
      return 'not_settled'
    case 'settled':
      return 'settled'
    case 'not_settled':
      return 'not_settled'
    case 'unknown':
      return 'unknown'
    default: {
      const _exhaustive: never = evidence
      return _exhaustive
    }
  }
}

function x402ExecutionContextForFacts(input: Readonly<{
  environment: 'sandbox' | 'production'
  executionContext?: X402ExecutionContext
}>): X402ExecutionContext | undefined {
  if (input.executionContext === undefined) {
    return input.environment === 'production'
      ? { kind: 'market', paymentProfile: 'base-usdc-exact' }
      : { kind: 'market', paymentProfile: 'base-sepolia-usdc-exact' }
  }
  const context: unknown = input.executionContext
  if (!isRecord(context)) return undefined
  if (context.kind === 'market') {
    const expectedProfile = input.environment === 'production'
      ? 'base-usdc-exact'
      : 'base-sepolia-usdc-exact'
    return hasExactKeys(context, ['kind', 'paymentProfile'])
      && context.paymentProfile === expectedProfile
      ? { kind: 'market', paymentProfile: expectedProfile }
      : undefined
  }
  if (
    context.kind !== 'seller_onboarding_canary'
    || input.environment !== 'sandbox'
    || !hasExactKeys(context, [
      'kind',
      'paymentProfile',
      'canaryRef',
      'canaryCommitmentDigest',
      'fundingBudgetRef',
    ])
    || context.paymentProfile !== 'base-sepolia-usdc-exact'
    || !boundedRef(context.canaryRef)
    || typeof context.canaryCommitmentDigest !== 'string'
    || !isCanonicalDigest(context.canaryCommitmentDigest)
    || !boundedRef(context.fundingBudgetRef)
  ) return undefined
  return {
    kind: 'seller_onboarding_canary',
    paymentProfile: 'base-sepolia-usdc-exact',
    canaryRef: context.canaryRef,
    canaryCommitmentDigest: context.canaryCommitmentDigest,
    fundingBudgetRef: context.fundingBudgetRef,
  }
}

function boundedRef(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= 512
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index])
}

export function x402ActionEffectStatus(
  observation: RouteTransportObservation,
): 'not_released' | 'released' | 'unknown' {
  if (
    observation.disposition === 'unknown'
    || observation.disposition === 'partial'
  ) return 'unknown'
  return (
    observation.releaseStarted
    || observation.paymentSubmissionStatus === 'observed'
  )
    ? 'released'
    : 'not_released'
}

export function chargeSettlementOutcome(
  observation: RouteTransportObservation,
  economicRail: EconomicRail,
  contractValidOutput = true,
): 'not_released' | 'released' | 'unknown' {
  if (
    observation.disposition === 'unknown'
    || observation.disposition === 'partial'
    || observation.queryReleaseStatus === 'unknown'
    || observation.paymentAuthorizationStatus === 'unknown'
    || observation.paymentSubmissionStatus === 'possibly_submitted'
    || observation.paymentSubmissionStatus === 'unknown'
    || observation.settlementEvidence?.kind === 'unknown'
    || observation.quoteDeliveryStatus === 'unknown'
  ) return 'unknown'
  if (!contractValidOutput) {
    return economicRail === 'provider_direct_x402' ? 'unknown' : 'not_released'
  }
  return observation.releaseStarted ? 'released' : 'not_released'
}

export function transportObservationDigest(
  observation: RouteTransportObservation,
): string {
  return canonicalDigest({
    format: 'operation-transport-observation:v1',
    transport: observation.transport,
    disposition: observation.disposition,
    releaseStarted: observation.releaseStarted,
    queryReleaseStatus: observation.queryReleaseStatus ?? null,
    paymentAuthorizationStatus:
      observation.paymentAuthorizationStatus ?? null,
    paymentSubmissionStatus: observation.paymentSubmissionStatus ?? null,
    settlementEvidence: observation.settlementEvidence ?? null,
    quoteDeliveryStatus: observation.quoteDeliveryStatus ?? null,
    requestDigest: observation.requestDigest,
    responseDigest: observation.responseDigest ?? null,
    outputDigest:
      observation.outputJson === undefined
        ? null
        : canonicalDigest(observation.outputJson),
    providerReceiptDigest:
      observation.providerReceipt === undefined
        ? null
        : canonicalDigest(observation.providerReceipt),
    providerOfferDigest: observation.providerOfferDigest ?? null,
    paymentProofDigest:
      observation.paymentProof === undefined
        ? null
        : canonicalDigest(observation.paymentProof),
    paymentChallengeDigest: observation.paymentChallengeDigest ?? null,
    continuationTokenDigest:
      observation.continuationToken === undefined
        ? null
        : canonicalDigest(observation.continuationToken),
    failureCode: observation.failureCode ?? null,
  } as StableHashValue)
}

export function paymentObservationDigest(
  observation: RouteTransportObservation,
  paymentIdentifier: string,
): string {
  return canonicalDigest({
    format: 'operation-payment-observation:v1',
    paymentIdentifier,
    transport: observation.transport,
    requestDigest: observation.requestDigest,
    releaseStarted: observation.releaseStarted,
    paymentAuthorizationStatus:
      observation.paymentAuthorizationStatus ?? null,
    paymentSubmissionStatus: observation.paymentSubmissionStatus ?? null,
    settlementEvidence: observation.settlementEvidence ?? null,
    paymentChallengeDigest: observation.paymentChallengeDigest ?? null,
    providerReceiptDigest:
      observation.providerReceipt === undefined
        ? null
        : canonicalDigest(observation.providerReceipt),
    providerOfferDigest: observation.providerOfferDigest ?? null,
    paymentProofDigest:
      observation.paymentProof === undefined
        ? null
        : canonicalDigest(observation.paymentProof),
  } as StableHashValue)
}
