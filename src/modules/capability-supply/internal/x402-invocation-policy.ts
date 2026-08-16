import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ExternalSpendSettlementStatus } from '@/modules/money/internal/external-spend'

import type { RouteTransportObservation } from '../route-transport-runtime'

export type EconomicRail = 'provider_direct_x402' | 'ae_internal'

export function x402SettlementStatusForObservation(
  observation: RouteTransportObservation,
): ExternalSpendSettlementStatus {
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
    return economicRail === 'ae_internal' ? 'not_released' : 'unknown'
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
    paymentProofDigest:
      observation.paymentProof === undefined
        ? null
        : canonicalDigest(observation.paymentProof),
  } as StableHashValue)
}
