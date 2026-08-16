import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ExternalSpendSettlementStatus } from '@/modules/money/public'

import type { RouteTransportObservation } from '../route-transport-runtime'

export type EconomicRail = 'provider_direct_x402' | 'ae_internal'

export type PaymentLaneAdmission =
  | Readonly<{ kind: 'admitted'; lane: 'brokered' }>
  | Readonly<{
    kind: 'refused'
    lane: 'provider_direct_x402'
    code: 'payment_lane_not_brokered'
  }>

/**
 * V1 brokers every paid call so AE can validate the output before value moves, take its rake on
 * settlement, and answer for the charge when the buyer disputes it. A provider-direct rail settles
 * between buyer and provider outside AE's ledger and forfeits all three, so production admits only
 * the brokered lane. Non-production keeps the direct rail open because the host-parity and
 * provider-conformance scenarios are our only executable proof that the x402 machinery still works.
 */
export function paymentLaneAdmission(
  input: Readonly<{ rail: EconomicRail; environment: string }>,
): PaymentLaneAdmission {
  switch (input.rail) {
    case 'ae_internal':
      return { kind: 'admitted', lane: 'brokered' }
    case 'provider_direct_x402':
      return input.environment === 'production'
        ? {
          kind: 'refused',
          lane: 'provider_direct_x402',
          code: 'payment_lane_not_brokered',
        }
        : { kind: 'admitted', lane: 'brokered' }
    default: {
      const _exhaustive: never = input.rail
      return _exhaustive
    }
  }
}

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
