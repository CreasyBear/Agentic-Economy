import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { X402PaymentAttempt } from './x402-payment-attempt'

export type X402PaymentReconciliationEvidenceMaterial = Readonly<{
  kind: 'x402_payment_reconciliation'
  version: 1
  evidenceRef: string
  evidenceRefs: readonly string[]
  source: string
  paymentIdentifier: string
  challengeDigest: string
  providerEndpoint: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amount: string
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  resolution: 'not_settled' | 'settled'
  settledAmount?: Readonly<{ currency: string; amountMinor: number }>
  observedAt: string
}>

export type X402PaymentReconciliationEvidence =
  X402PaymentReconciliationEvidenceMaterial & Readonly<{ digest: string }>

export type X402PaymentReconciliationEvidenceVerifier = (
  evidence: X402PaymentReconciliationEvidence,
) => boolean

export type X402PaymentReconciliationEvidenceError =
  | 'payment_evidence_malformed'
  | 'payment_evidence_digest_mismatch'
  | 'payment_evidence_source_mismatch'
  | 'payment_evidence_binding_mismatch'
  | 'payment_evidence_time_invalid'
  | 'payment_evidence_source_unverified'

export function validateX402PaymentReconciliationEvidence(input: Readonly<{
  evidence: X402PaymentReconciliationEvidence
  attempt: X402PaymentAttempt
  source: string
  now: number
  verifySourceEvidence: X402PaymentReconciliationEvidenceVerifier | undefined
}>): X402PaymentReconciliationEvidenceError | undefined {
  const { evidence, attempt } = input
  if (
    !exactEvidenceShape(evidence)
    || (evidence.settledAmount !== undefined && !exactKeys(
      evidence.settledAmount,
      ['currency', 'amountMinor'],
    ))
    || evidence.kind !== 'x402_payment_reconciliation'
    || evidence.version !== 1
    || evidence.evidenceRef.trim().length === 0
    || evidence.evidenceRefs.length === 0
    || evidence.evidenceRefs.some((reference) => reference.trim().length === 0)
    || evidence.source.trim().length === 0
    || !Number.isInteger(evidence.effectGeneration)
    || evidence.effectGeneration < 1
    || (evidence.resolution !== 'not_settled' && evidence.resolution !== 'settled')
    || !Number.isFinite(Date.parse(evidence.observedAt))
    || (evidence.resolution === 'settled') !== (evidence.settledAmount !== undefined)
    || (evidence.settledAmount !== undefined && (
      evidence.settledAmount.currency.trim().length === 0
      || !Number.isSafeInteger(evidence.settledAmount.amountMinor)
      || evidence.settledAmount.amountMinor < 0
    ))
  ) return 'payment_evidence_malformed'
  const { digest: _digest, ...material } = evidence
  if (canonicalDigest(material) !== evidence.digest) {
    return 'payment_evidence_digest_mismatch'
  }
  if (evidence.source !== input.source) return 'payment_evidence_source_mismatch'
  if (
    evidence.paymentIdentifier !== attempt.paymentIdentifier
    || evidence.challengeDigest !== attempt.challengeDigest
    || evidence.providerEndpoint !== attempt.providerEndpoint
    || evidence.scheme !== attempt.scheme
    || evidence.network !== attempt.network
    || evidence.asset !== attempt.asset
    || evidence.payTo !== attempt.payTo
    || evidence.amount !== attempt.amount
    || evidence.invocationRef !== attempt.invocationRef
    || evidence.attemptRef !== attempt.attemptRef
    || evidence.effectGeneration !== attempt.effectGeneration
  ) return 'payment_evidence_binding_mismatch'
  const observedAt = Date.parse(evidence.observedAt)
  const notBefore = attempt.submissionStartedAt ?? attempt.preparedAt
  if (observedAt < notBefore || observedAt > input.now) {
    return 'payment_evidence_time_invalid'
  }
  if (input.verifySourceEvidence?.(evidence) !== true) {
    return 'payment_evidence_source_unverified'
  }
  return undefined
}

function exactEvidenceShape(evidence: X402PaymentReconciliationEvidence): boolean {
  const common = [
    'kind',
    'version',
    'evidenceRef',
    'evidenceRefs',
    'source',
    'paymentIdentifier',
    'challengeDigest',
    'providerEndpoint',
    'scheme',
    'network',
    'asset',
    'payTo',
    'amount',
    'invocationRef',
    'attemptRef',
    'effectGeneration',
    'resolution',
    'observedAt',
    'digest',
  ]
  return exactKeys(
    evidence,
    evidence.settledAmount === undefined ? common : [...common, 'settledAmount'],
  )
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === sortedExpected[index])
}
