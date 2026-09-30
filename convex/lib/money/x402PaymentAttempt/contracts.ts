import { v } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'

export const x402PaymentSettlementStatusValue = v.union(
  v.literal('settled'),
  v.literal('not_settled'),
  v.literal('unknown'),
)

export const x402PaymentEventArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  providerEndpoint: v.string(),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  settlementDigest: v.optional(v.string()),
}

export type AttemptRow = Doc<'moneyX402PaymentAttempts'>

export type EventArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  paymentIdentifier: string
  challengeDigest: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amountUnits: string
  currency: string
  exponent: number
  providerEndpoint: string
  custodyRef: string
  authorizationDigest: string
}

export const paymentSigningIdempotencyKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const paymentAuthorizationValidBeforePattern = /^(?:0|[1-9][0-9]*)$/
export const X402_PAYMENT_SIGNING_CLAIM_LEASE_MS = 30_000

export type PrepareArgs = {
  aeEnvironment: 'sandbox' | 'production'
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  toolRef?: string
  inputDigest?: string
  paymentIdentifier: string
  operationKeyDigest: string
  challengeDigest: string
  challengeJson: string
  selectedRequirementJson: string
  providerEndpoint: string
  credentialRef: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amountUnits: string
  currency: string
  exponent: number
  reservationRef?: string
  requestFingerprint?: string
  custodyBudgetRef?: string
  custodyGeneration?: number
  custodyDailyMaximumUnits?: string
}

export const x402PaymentAuthorizationStored = v.object({
  paymentUnsignedMaterialJson: v.string(),
  paymentUnsignedMaterialDigest: v.string(),
  paymentSigningIdempotencyKey: v.string(),
  paymentSignatureDigest: v.string(),
  paymentPayer: v.string(),
  paymentNonce: v.string(),
  paymentAuthorizationValidBefore: v.string(),
  paymentAuthorizationExpiresAt: v.number(),
  requestFingerprint: v.string(),
})

export type RecordObservationArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  paymentIdentifier: string
  toolRef: string
  inputDigest: string
  transportObservationDigest: string
  transportRequestDigest: string
  paymentObservationDigest: string
  settlementStatus: 'settled' | 'not_settled' | 'unknown'
  paymentResponseDigest?: string
  responseStatus?: number
  quarantinedResponseDigest?: string
  quarantinedOutputJson?: string
  observedAt: number
}
export type ReconcileArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  toolRef: string
  inputDigest: string
  evidenceRef: string
  evidenceDigest: string
  reservationRef: string
  paymentIdentifier: string
  challengeDigest: string
  settlementStatus: 'settled' | 'not_settled'
  paymentUnusedProof?: 'expired_unused' | 'authorization_cancelled'
  amountUnits: string
  currency: string
  exponent: number
  paymentResponseDigest: string
  transportObservationDigest: string
  transportRequestDigest: string
  paymentObservationDigest: string
  observedAt: number
}
