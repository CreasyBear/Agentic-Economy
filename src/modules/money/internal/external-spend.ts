import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  compareExactAmounts,
  exactAmountSchema,
  type ExactAmount,
} from './exact-amount'

export const EXTERNAL_SPEND_STATES = [
  'reserved',
  'settled',
  'released',
  'outcome_unknown',
  'reversed',
] as const
export type ExternalSpendReservationState = (typeof EXTERNAL_SPEND_STATES)[number]

export const EXTERNAL_SPEND_SETTLEMENT_STATUSES = [
  'settled',
  'not_settled',
  'unknown',
] as const
export type ExternalSpendSettlementStatus = (typeof EXTERNAL_SPEND_SETTLEMENT_STATUSES)[number]
export const EXTERNAL_SPEND_SUBMISSION_STATUSES = [
  'not_submitted',
  'possibly_submitted',
  'observed',
  'unknown',
] as const
export type ExternalSpendSubmissionStatus = (typeof EXTERNAL_SPEND_SUBMISSION_STATUSES)[number]

export type ExternalSpendIdentity = Readonly<{
  reservationRef: string
  principalId: string
  credentialId: string
  grantRef: string
  grantGeneration: number
  environment: 'sandbox' | 'production'
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  operationRef: string
  providerRef: string
  paymentIdentifier: string
  challengeDigest: string
  amount: ExactAmount
  idempotencyDigest: string
}>

export type ExternalSpendReservation = ExternalSpendIdentity & Readonly<{
  identityDigest: string
  state: ExternalSpendReservationState
  budgetPolicyRef: string
  budgetDayStart: string
  budgetMonthStart: string
  submissionStatus?: ExternalSpendSubmissionStatus
  finalizationDigest?: string
  paymentResponseDigest?: string
  providerReceiptDigest?: string
  evidenceRefs: string[]
  reconciliationDigest?: string
  reconciliationEvidenceRef?: string
  reconciliationEvidenceDigest?: string
  reversalEvidenceRef?: string
  reversalEvidenceDigest?: string
  createdAt: number
  updatedAt: number
  finalizedAt?: number
  reconciledAt?: number
  reversedAt?: number
}>

export type ExternalSpendRefusalCode =
  | 'external_spend_identity_conflict'
  | 'external_spend_grant_invalid'
  | 'external_spend_budget_refused'
  | 'external_spend_live_money_gate_open'
  | 'external_spend_payment_response_invalid'
  | 'external_spend_invalid_amount'
  | 'external_spend_not_found'
  | 'external_spend_state_conflict'
  | 'external_spend_reconciliation_required'
  | 'external_spend_already_reversed'

export type ExternalSpendMutationResult =
  | Readonly<{
      kind: 'accepted'
      status: ExternalSpendReservationState
      replayed: boolean
      reservation: ExternalSpendReservation
    }>
  | Readonly<{
      kind: 'refused'
      code: ExternalSpendRefusalCode
      retryable: boolean
    }>

export function externalSpendIdentityDigest(identity: ExternalSpendIdentity): string {
  return canonicalDigest({
    format: 'ae.money.external-spend-identity:v1',
    ...identity,
  } as StableHashValue)
}

export function externalSpendFinalizationDigest(input: Readonly<{
  identityDigest: string
  submissionStatus: ExternalSpendSubmissionStatus
  settlementStatus: ExternalSpendSettlementStatus
  paymentResponseDigest?: string
  providerReceiptDigest?: string
  evidenceRefs: readonly string[]
}>): string {
  return canonicalDigest({
    format: 'ae.money.external-spend-finalization:v1',
    ...input,
  } as StableHashValue)
}

export function externalSpendReconciliationDigest(input: Readonly<{
  settlementStatus: Exclude<ExternalSpendSettlementStatus, 'unknown'>
  paymentResponseDigest: string
  evidenceRef: string
  evidenceDigest: string
}>): string {
  return canonicalDigest({
    format: 'ae.money.external-spend-reconciliation:v1',
    ...input,
  } as StableHashValue)
}

export function externalSpendReversalDigest(input: Readonly<{
  identityDigest: string
  evidenceRef: string
  evidenceDigest: string
}>): string {
  return canonicalDigest({
    format: 'ae.money.external-spend-reversal:v1',
    ...input,
  } as StableHashValue)
}

export function sameExternalSpendIdentity(
  left: ExternalSpendIdentity,
  right: ExternalSpendIdentity,
): boolean {
  return left.reservationRef === right.reservationRef
    && left.principalId === right.principalId
    && left.credentialId === right.credentialId
    && left.grantRef === right.grantRef
    && left.grantGeneration === right.grantGeneration
    && left.environment === right.environment
    && left.invocationRef === right.invocationRef
    && left.attemptRef === right.attemptRef
    && left.effectGeneration === right.effectGeneration
    && left.operationRef === right.operationRef
    && left.providerRef === right.providerRef
    && left.paymentIdentifier === right.paymentIdentifier
    && left.challengeDigest === right.challengeDigest
    && compareExactAmounts(left.amount, right.amount) === 0
    && left.idempotencyDigest === right.idempotencyDigest
}

export function externalSpendStateForSettlement(
  status: ExternalSpendSettlementStatus,
): Exclude<ExternalSpendReservationState, 'reserved' | 'reversed'> {
  return status === 'settled'
    ? 'settled'
    : status === 'not_settled'
      ? 'released'
      : 'outcome_unknown'
}

export function externalSpendIdentityMaterialValid(
  input: ExternalSpendIdentity,
): boolean {
  return [
    input.reservationRef,
    input.principalId,
    input.credentialId,
    input.grantRef,
    input.invocationRef,
    input.attemptRef,
    input.operationRef,
    input.providerRef,
    input.paymentIdentifier,
    input.challengeDigest,
    input.idempotencyDigest,
  ].every((value) => value.trim().length > 0)
    && Number.isSafeInteger(input.grantGeneration)
    && input.grantGeneration > 0
    && Number.isSafeInteger(input.effectGeneration)
    && input.effectGeneration > 0
    && exactAmountSchema.safeParse(input.amount).success
}

export type ExternalSpendPolicyRefusal = Readonly<{
  kind: 'refused'
  code: ExternalSpendRefusalCode
}>

export type ExternalSpendFinalizationCommand = Readonly<{
  settlementStatus: ExternalSpendSettlementStatus
  submissionStatus: ExternalSpendSubmissionStatus
  paymentResponseDigest?: string
  providerReceiptDigest?: string
  evidenceRefs: readonly string[]
}>

export type ExternalSpendFinalizationDecision =
  | ExternalSpendPolicyRefusal
  | Readonly<{
      kind: 'replayed'
    }>
  | Readonly<{
      kind: 'transition'
      target: Exclude<ExternalSpendReservationState, 'reserved' | 'reversed'>
      finalizationDigest: string
      budgetTarget?: 'settled' | 'released'
    }>

export function externalSpendFinalizationCommandRefusal(
  identity: ExternalSpendIdentity,
  command: ExternalSpendFinalizationCommand,
): ExternalSpendRefusalCode | undefined {
  if (!externalSpendIdentityMaterialValid(identity)) {
    return 'external_spend_invalid_amount'
  }
  const validSubmissionSettlement =
    command.submissionStatus === 'not_submitted'
      ? command.settlementStatus === 'not_settled'
      : command.submissionStatus === 'possibly_submitted'
          || command.submissionStatus === 'unknown'
        ? command.settlementStatus === 'unknown'
        : true
  if (!validSubmissionSettlement) {
    return 'external_spend_state_conflict'
  }
  if (!command.evidenceRefs.every((ref) => ref.trim().length > 0)) {
    return 'external_spend_invalid_amount'
  }
  const requiresPaymentResponse =
    command.submissionStatus === 'observed'
    && command.settlementStatus !== 'unknown'
  if (
    requiresPaymentResponse
    && (
      command.paymentResponseDigest === undefined
      || command.paymentResponseDigest.trim().length === 0
    )
  ) {
    return 'external_spend_payment_response_invalid'
  }
  return undefined
}

export function decideExternalSpendFinalization(input: Readonly<{
  identity: ExternalSpendIdentity
  reservation: Pick<
    ExternalSpendReservation,
    'identityDigest' | 'state' | 'finalizationDigest'
  >
  command: ExternalSpendFinalizationCommand
}>): ExternalSpendFinalizationDecision {
  const { command } = input
  const refusal = externalSpendFinalizationCommandRefusal(
    input.identity,
    command,
  )
  if (refusal !== undefined) {
    return { kind: 'refused', code: refusal }
  }

  const target = externalSpendStateForSettlement(command.settlementStatus)
  const finalizationDigest = externalSpendFinalizationDigest({
    identityDigest: input.reservation.identityDigest,
    ...command,
  })
  if (input.reservation.state !== 'reserved') {
    if (
      input.reservation.finalizationDigest === finalizationDigest
      && input.reservation.state === target
    ) {
      return { kind: 'replayed' }
    }
    return {
      kind: 'refused',
      code:
        input.reservation.state === 'outcome_unknown'
          ? 'external_spend_reconciliation_required'
          : 'external_spend_state_conflict',
    }
  }
  return {
    kind: 'transition',
    target,
    finalizationDigest,
    ...(target === 'outcome_unknown' ? {} : { budgetTarget: target }),
  }
}

export type ExternalSpendReconciliationCommand = Readonly<{
  settlementStatus: Exclude<ExternalSpendSettlementStatus, 'unknown'>
  paymentResponseDigest: string
  evidenceRef: string
  evidenceDigest: string
}>

export type ExternalSpendReconciliationDecision =
  | ExternalSpendPolicyRefusal
  | Readonly<{ kind: 'replayed' }>
  | Readonly<{
      kind: 'transition'
      target: 'settled' | 'released'
      reconciliationDigest: string
    }>

export function externalSpendReconciliationCommandRefusal(
  identity: ExternalSpendIdentity,
  command: ExternalSpendReconciliationCommand,
): ExternalSpendRefusalCode | undefined {
  return (
    !externalSpendIdentityMaterialValid(identity)
    || command.paymentResponseDigest.trim().length === 0
    || command.evidenceRef.trim().length === 0
    || command.evidenceDigest.trim().length === 0
  )
    ? 'external_spend_payment_response_invalid'
    : undefined
}

export function decideExternalSpendReconciliation(input: Readonly<{
  identity: ExternalSpendIdentity
  reservation: Pick<
    ExternalSpendReservation,
    'state' | 'reconciliationDigest'
  >
  command: ExternalSpendReconciliationCommand
}>): ExternalSpendReconciliationDecision {
  const { command } = input
  const refusal = externalSpendReconciliationCommandRefusal(
    input.identity,
    command,
  )
  if (refusal !== undefined) {
    return { kind: 'refused', code: refusal }
  }
  const reconciliationDigest = externalSpendReconciliationDigest(command)
  const target =
    command.settlementStatus === 'settled' ? 'settled' : 'released'
  if (input.reservation.state !== 'outcome_unknown') {
    return (
      input.reservation.reconciliationDigest === reconciliationDigest
      && input.reservation.state === target
    )
      ? { kind: 'replayed' }
      : { kind: 'refused', code: 'external_spend_state_conflict' }
  }
  return { kind: 'transition', target, reconciliationDigest }
}

export type ExternalSpendReversalDecision =
  | ExternalSpendPolicyRefusal
  | Readonly<{ kind: 'replayed' }>
  | Readonly<{
      kind: 'transition'
      reversalDigest: string
    }>

export function externalSpendReversalCommandRefusal(
  identity: ExternalSpendIdentity,
  evidenceRef: string,
  evidenceDigest: string,
): ExternalSpendRefusalCode | undefined {
  return (
    !externalSpendIdentityMaterialValid(identity)
    || evidenceRef.trim().length === 0
    || evidenceDigest.trim().length === 0
  )
    ? 'external_spend_invalid_amount'
    : undefined
}

export function decideExternalSpendReversal(input: Readonly<{
  identity: ExternalSpendIdentity
  reservation: Pick<
    ExternalSpendReservation,
    'identityDigest'
    | 'state'
    | 'reversalEvidenceRef'
    | 'reversalEvidenceDigest'
  >
  evidenceRef: string
  evidenceDigest: string
}>): ExternalSpendReversalDecision {
  const refusal = externalSpendReversalCommandRefusal(
    input.identity,
    input.evidenceRef,
    input.evidenceDigest,
  )
  if (refusal !== undefined) {
    return { kind: 'refused', code: refusal }
  }
  if (input.reservation.state === 'reversed') {
    return (
      input.reservation.reversalEvidenceDigest === input.evidenceDigest
      && input.reservation.reversalEvidenceRef === input.evidenceRef
    )
      ? { kind: 'replayed' }
      : { kind: 'refused', code: 'external_spend_already_reversed' }
  }
  if (input.reservation.state === 'outcome_unknown') {
    return {
      kind: 'refused',
      code: 'external_spend_reconciliation_required',
    }
  }
  if (input.reservation.state !== 'settled') {
    return { kind: 'refused', code: 'external_spend_state_conflict' }
  }
  return {
    kind: 'transition',
    reversalDigest: externalSpendReversalDigest({
      identityDigest: input.reservation.identityDigest,
      evidenceRef: input.evidenceRef,
      evidenceDigest: input.evidenceDigest,
    }),
  }
}
