import { v } from 'convex/values'

const exactAmountValue = v.object({ currency: v.string(), units: v.string(), exponent: v.number() })

export const x402PaymentSettlementStatusValue = v.union(
  v.literal('settled'),
  v.literal('not_settled'),
  v.literal('unknown'),
)

export const x402PaymentReconciliationEvidenceValue = v.object({
  kind: v.literal('x402_payment_reconciliation'),
  version: v.literal(1),
  evidenceRef: v.string(),
  source: v.string(),
  invocationRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  operationRef: v.string(),
  inputDigest: v.string(),
  requestDigest: v.string(),
  transportObservationDigest: v.string(),
  paymentObservationDigest: v.string(),
  providerRef: v.string(),
  paymentIdentifier: v.string(),
  reservationRef: v.string(),
  challengeDigest: v.string(),
  amount: exactAmountValue,
  settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  paymentResponseDigest: v.string(),
  transactionHash: v.string(),
  observedAt: v.string(),
  digest: v.string(),
})
