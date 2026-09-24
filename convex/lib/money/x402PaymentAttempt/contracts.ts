import { v, type Infer } from 'convex/values'

import {
  x402PaymentAuthorizationFailureCodeValue,
  x402PaymentAuthorizationFailureDetailValue,
} from '../../../../src/modules/money/schema'
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

export const prepareX402PaymentAuthorizationArgs = {
  aeEnvironment: v.union(v.literal('sandbox'), v.literal('production')),
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  toolRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  operationKeyDigest: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  credentialRef: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  reservationRef: v.optional(v.string()),
  requestFingerprint: v.optional(v.string()),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
}

export const prepareX402PaymentAuthorizationReturns = v.object({
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
})

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

export const claimX402PaymentAuthorizationReturns = v.union(
  v.object({ kind: v.literal('claimed') }),
  v.object({
    kind: v.literal('stored'),
    paymentUnsignedMaterialJson: v.string(),
    paymentUnsignedMaterialDigest: v.string(),
    paymentSigningIdempotencyKey: v.string(),
    paymentSignatureDigest: v.string(),
    paymentPayer: v.string(),
    paymentNonce: v.string(),
    paymentAuthorizationValidBefore: v.string(),
    paymentAuthorizationExpiresAt: v.number(),
    requestFingerprint: v.string(),
  }),
  v.object({ kind: v.literal('pending') }),
)

export const claimX402PaymentAuthorizationArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  requestFingerprint: v.string(),
  custodyGeneration: v.optional(v.number()),
}

export const recordX402PaymentSigningIntentArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  paymentUnsignedMaterialJson: v.string(),
  paymentUnsignedMaterialDigest: v.string(),
  paymentSigningIdempotencyKey: v.string(),
  paymentPayer: v.string(),
  paymentNonce: v.string(),
  paymentAuthorizationValidBefore: v.string(),
  paymentAuthorizationExpiresAt: v.number(),
  requestFingerprint: v.string(),
  custodyGeneration: v.optional(v.number()),
}

export const recordX402PaymentSigningIntentReturns = v.null()

export const x402PaymentAuthorizationFailureCode = x402PaymentAuthorizationFailureCodeValue

export type X402PaymentAuthorizationFailureCode = Infer<
  typeof x402PaymentAuthorizationFailureCode
>
export const x402PaymentAuthorizationFailureDetail = x402PaymentAuthorizationFailureDetailValue
export type X402PaymentAuthorizationFailureDetail = Infer<
  typeof x402PaymentAuthorizationFailureDetail
>

export const recordX402PaymentAuthorizationFailureArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  code: x402PaymentAuthorizationFailureCode,
  detail: v.optional(x402PaymentAuthorizationFailureDetail),
}

export const recordX402PaymentAuthorizationFailureReturns = v.null()

export const recordX402PaymentSignatureDigestArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  paymentSignatureDigest: v.string(),
  paymentPayer: v.optional(v.string()),
  paymentNonce: v.optional(v.string()),
  requestFingerprint: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
}

export const recordX402PaymentSignatureDigestReturns = v.null()

export const markX402PaymentPossiblySubmittedArgs = { ...x402PaymentEventArgs }
export const markX402PaymentPossiblySubmittedReturns = v.null()

export type ClaimArgs = {
  custodyRef: string
  authorizationDigest: string
  requestFingerprint: string
  custodyGeneration?: number
}
export type ClaimResult = Infer<typeof claimX402PaymentAuthorizationReturns>
export type RecordSigningIntentArgs = {
  custodyRef: string
  authorizationDigest: string
  paymentUnsignedMaterialJson: string
  paymentUnsignedMaterialDigest: string
  paymentSigningIdempotencyKey: string
  paymentPayer: string
  paymentNonce: string
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
  requestFingerprint: string
  custodyGeneration?: number
}
export type RecordSignatureDigestArgs = {
  custodyRef: string
  authorizationDigest: string
  paymentSignatureDigest: string
  paymentPayer?: string
  paymentNonce?: string
  requestFingerprint?: string
  custodyGeneration?: number
}
export type RecordAuthorizationFailureArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  code: X402PaymentAuthorizationFailureCode
  detail?: X402PaymentAuthorizationFailureDetail
}
export type MarkPossiblySubmittedArgs = EventArgs & {
  settlementStatus?: 'settled' | 'not_settled' | 'unknown'
  settlementDigest?: string
}

export const observeX402PaymentAttemptArgs = {
  ...x402PaymentEventArgs,
  state: v.union(v.literal('observed'), v.literal('reconciliation_required')),
  evidenceRefs: v.array(v.string()),
}

export const observeX402PaymentAttemptReturns = v.null()

export const recordX402PaymentObservationArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  paymentIdentifier: v.string(),
  toolRef: v.string(),
  inputDigest: v.string(),
  transportObservationDigest: v.string(),
  transportRequestDigest: v.string(),
  paymentObservationDigest: v.string(),
  settlementStatus: x402PaymentSettlementStatusValue,
  paymentResponseDigest: v.optional(v.string()),
  quarantinedResponseDigest: v.optional(v.string()),
  quarantinedOutputJson: v.optional(v.string()),
  observedAt: v.number(),
}

export const recordX402PaymentObservationReturns = v.null()

export const reconcileX402PaymentAttemptArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  toolRef: v.string(),
  inputDigest: v.string(),
  evidenceRef: v.string(),
  evidenceDigest: v.string(),
  reservationRef: v.string(),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  paymentResponseDigest: v.string(),
  transportObservationDigest: v.string(),
  transportRequestDigest: v.string(),
  paymentObservationDigest: v.string(),
  observedAt: v.number(),
}

export const reconcileX402PaymentAttemptReturns = v.union(
  v.object({
    kind: v.literal('settled'),
    settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  }),
  v.object({ kind: v.literal('reconciliation_required') }),
  v.object({ kind: v.literal('not_found') }),
)

export type ObserveArgs = EventArgs & {
  settlementStatus?: 'settled' | 'not_settled' | 'unknown'
  settlementDigest?: string
  state: 'observed' | 'reconciliation_required'
  evidenceRefs: string[]
}
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
  amountUnits: string
  currency: string
  exponent: number
  paymentResponseDigest: string
  transportObservationDigest: string
  transportRequestDigest: string
  paymentObservationDigest: string
  observedAt: number
}
export type ReconcileResult = Infer<typeof reconcileX402PaymentAttemptReturns>

export const attemptStateValue = v.union(
  v.literal('prepared'),
  v.literal('possibly_submitted'),
  v.literal('observed'),
  v.literal('reconciliation_required'),
)

export const x402PaymentAuthorizationMaterial = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  toolRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  credentialRef: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  custodyRef: v.string(),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentIdentityDigest: v.optional(v.string()),
  paymentSignatureDigest: v.optional(v.string()),
  requestFingerprint: v.optional(v.string()),
  paymentUnsignedMaterialJson: v.optional(v.string()),
  paymentUnsignedMaterialDigest: v.optional(v.string()),
  paymentSigningIdempotencyKey: v.optional(v.string()),
  paymentPayer: v.optional(v.string()),
  paymentNonce: v.optional(v.string()),
  paymentAuthorizationValidBefore: v.optional(v.string()),
  paymentAuthorizationExpiresAt: v.optional(v.number()),
  paymentSigningClaimedAt: v.optional(v.number()),
  authorizationFailureCode: v.optional(x402PaymentAuthorizationFailureCodeValue),
  authorizationFailureDetail: v.optional(x402PaymentAuthorizationFailureDetailValue),
  authorizationFailureObservedAt: v.optional(v.number()),
  state: attemptStateValue,
  transportObservationDigest: v.optional(v.string()),
  transportRequestDigest: v.optional(v.string()),
  paymentObservationDigest: v.optional(v.string()),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  paymentResponseDigest: v.optional(v.string()),
  reconciliationEvidenceRef: v.optional(v.string()),
  reconciliationEvidenceDigest: v.optional(v.string()),
})

export const readX402PaymentAuthorizationArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  requestFingerprint: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
}

export const readX402PaymentAuthorizationReturns = v.union(
  x402PaymentAuthorizationMaterial,
  v.null(),
)

export const readX402PaymentAuthorizationByDigestArgs = {
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  requestFingerprint: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
}

export const readX402PaymentAuthorizationByDigestReturns = v.union(
  x402PaymentAuthorizationMaterial,
  v.null(),
)

export const x402PaymentAttemptReadValue = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  toolRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  paymentIdentifier: v.string(),
  operationKeyDigest: v.string(),
  challengeDigest: v.string(),
  challengeJson: v.string(),
  selectedRequirementJson: v.string(),
  providerEndpoint: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  credentialRef: v.string(),
  custodyRef: v.string(),
  custodyBudgetRef: v.optional(v.string()),
  custodyGeneration: v.optional(v.number()),
  custodyDailyMaximumUnits: v.optional(v.string()),
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentIdentityDigest: v.optional(v.string()),
  paymentSignatureDigest: v.optional(v.string()),
  requestFingerprint: v.optional(v.string()),
  paymentUnsignedMaterialJson: v.optional(v.string()),
  paymentUnsignedMaterialDigest: v.optional(v.string()),
  paymentSigningIdempotencyKey: v.optional(v.string()),
  paymentPayer: v.optional(v.string()),
  paymentNonce: v.optional(v.string()),
  paymentAuthorizationValidBefore: v.optional(v.string()),
  paymentAuthorizationExpiresAt: v.optional(v.number()),
  paymentSigningClaimedAt: v.optional(v.number()),
  authorizationFailureCode: v.optional(x402PaymentAuthorizationFailureCodeValue),
  authorizationFailureDetail: v.optional(x402PaymentAuthorizationFailureDetailValue),
  authorizationFailureObservedAt: v.optional(v.number()),
  state: attemptStateValue,
  preparedAt: v.number(),
  submissionStartedAt: v.optional(v.number()),
  observedAt: v.optional(v.number()),
  transportObservationDigest: v.optional(v.string()),
  transportRequestDigest: v.optional(v.string()),
  paymentObservationDigest: v.optional(v.string()),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  paymentResponseDigest: v.optional(v.string()),
  quarantinedResponseDigest: v.optional(v.string()),
  quarantinedOutputJson: v.optional(v.string()),
  reconciliationEvidenceRef: v.optional(v.string()),
  reconciliationEvidenceDigest: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
})

export const readX402PaymentAttemptArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
}

export const readX402PaymentAttemptReturns = v.union(
  x402PaymentAttemptReadValue,
  v.null(),
)

export const expiredPreparedX402PaymentAttemptValue = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  reservationRef: v.optional(v.string()),
  paymentAuthorizationExpiresAt: v.number(),
})

export const listExpiredPreparedX402PaymentAttemptsArgs = {
  now: v.number(),
  limit: v.number(),
}

export const listExpiredPreparedX402PaymentAttemptsReturns = v.array(
  expiredPreparedX402PaymentAttemptValue,
)

export type ReadAuthorizationArgs = {
  custodyRef: string
  authorizationDigest: string
  requestFingerprint?: string
  custodyGeneration?: number
}
export type ReadAuthorizationByDigestArgs = {
  custodyRef: string
  authorizationDigest: string
  requestFingerprint?: string
  custodyGeneration?: number
}
export type ReadAttemptArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
}
export type ListExpiredPreparedArgs = {
  now: number
  limit: number
}
