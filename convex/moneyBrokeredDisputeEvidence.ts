import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ExactAmount } from '@/modules/money/public'
import type {
  BrokeredDisputeIdentity,
  ExternalPayoutIdentity,
} from './lib/brokeredDisputeEvidence/contracts'

export type {
  BrokeredDisputeIdentity,
  BrokeredDisputeReplayInput,
  ExternalPayoutEvidenceInput,
  ExternalPayoutIdentity,
} from './lib/brokeredDisputeEvidence/contracts'
export {
  validateBrokeredDisputeReplay,
  validateExternalPayoutEvidence,
} from './lib/brokeredDisputeEvidence/validation'

export function externalPayoutIdentity(input: Readonly<{
  chargeTransactionRef: string
  externalRef: string
}>): ExternalPayoutIdentity {
  const identity = {
    format: 'money-brokered-external-payout:v1',
    chargeTransactionRef: input.chargeTransactionRef,
    externalRef: input.externalRef,
  }
  return {
    payoutRef: canonicalDigest(identity as StableHashValue),
    payoutKey: canonicalDigest({
      ...identity,
      format: 'money-brokered-external-payout-idempotency:v1',
    } as StableHashValue),
    payoutSource: canonicalDigest({
      ...identity,
      format: 'money-brokered-external-payout-source:v1',
    } as StableHashValue),
    payoutEvidence: canonicalDigest({
      ...identity,
      format: 'money-brokered-external-payout-evidence:v1',
    } as StableHashValue),
  }
}

export function brokeredDisputeIdentity(input: Readonly<{
  qualifiedUseRef: string
  disputeRef: string
  originalTransactionRef: string
  externalRef: string
  providerAmount: ExactAmount
  sourceDigest: string
  evidenceRefs: readonly string[]
}>): BrokeredDisputeIdentity {
  const lossTransactionRef = `qualified-use-dispute-loss:${input.qualifiedUseRef}`
  return {
    lossTransactionRef,
    lossInputDigest: canonicalDigest({
      format: 'qualified-use-brokered-dispute-loss:v1',
      qualifiedUseRef: input.qualifiedUseRef,
      disputeRef: input.disputeRef,
      originalTransactionRef: input.originalTransactionRef,
      externalRef: input.externalRef,
      providerAmount: input.providerAmount,
      sourceDigest: input.sourceDigest,
      evidenceRefs: [...input.evidenceRefs],
    } as StableHashValue),
  }
}
