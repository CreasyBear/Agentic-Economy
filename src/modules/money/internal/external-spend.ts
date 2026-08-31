import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
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

export const EXTERNAL_SPEND_PAYMENT_PROFILES = [
  'base-usdc-exact',
  'base-sepolia-usdc-exact',
] as const
export type ExternalSpendPaymentProfile =
  (typeof EXTERNAL_SPEND_PAYMENT_PROFILES)[number]

export type ExternalSpendExecutionContext =
  | Readonly<{
      kind: 'market'
      paymentProfile: ExternalSpendPaymentProfile
    }>
  | Readonly<{
      kind: 'seller_onboarding_canary'
      paymentProfile: 'base-sepolia-usdc-exact'
      canaryRef: string
      canaryCommitmentDigest: string
      fundingBudgetRef: string
    }>

export type ExternalSpendPaymentFacts = Readonly<{
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
  /**
   * Optional only while legacy market callers and rows are migrated. New
   * identities always materialize the environment-bound market context.
   */
  executionContext?: ExternalSpendExecutionContext
  custodyRef?: string
  custodyGeneration?: number
  custodyDailyMaximum?: ExactAmount
}>

export type ExternalSpendIdentity = ExternalSpendPaymentFacts & Readonly<{
  reservationRef: string
  idempotencyDigest: string
}>

export type ExternalSpendReservation = ExternalSpendIdentity & Readonly<{
  identityDigest: string
  state: ExternalSpendReservationState
  budgetPolicyRef: string
  budgetDayStart: string
  budgetMonthStart: string
  custodyBudgetPolicyRef?: string
  custodyBudgetDayStart?: string
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
  | 'external_spend_payment_response_invalid'
  | 'external_spend_invalid_amount'
  | 'external_spend_not_found'
  | 'external_spend_state_conflict'
  | 'external_spend_reconciliation_required'
  | 'external_spend_already_reversed'
  | 'external_spend_custody_policy_invalid'
  | 'external_spend_custody_daily_limit_exceeded'

type ExternalSpendHandlerRefusalCode = Exclude<
  ExternalSpendRefusalCode,
  | 'external_spend_custody_policy_invalid'
  | 'external_spend_custody_daily_limit_exceeded'
>

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

export function mintExternalSpendIdentity(
  facts: ExternalSpendPaymentFacts,
): ExternalSpendIdentity {
  const executionContext = externalSpendExecutionContextForFacts(facts)
  if (executionContext === undefined) {
    throw new Error('external_spend_execution_context_invalid')
  }
  const material = {
    ...facts,
    executionContext,
  }
  const idempotencyDigest = canonicalDigest({
    format: 'ae.money.external-spend-idempotency:v2',
    ...material,
  } as StableHashValue)
  return {
    ...material,
    reservationRef: `external-spend:${idempotencyDigest}`,
    idempotencyDigest,
  }
}

export function externalSpendIdentityFromReservation(
  reservation: Pick<ExternalSpendReservation, keyof ExternalSpendIdentity>,
): ExternalSpendIdentity {
  return {
    reservationRef: reservation.reservationRef,
    principalId: reservation.principalId,
    credentialId: reservation.credentialId,
    grantRef: reservation.grantRef,
    grantGeneration: reservation.grantGeneration,
    environment: reservation.environment,
    invocationRef: reservation.invocationRef,
    attemptRef: reservation.attemptRef,
    effectGeneration: reservation.effectGeneration,
    operationRef: reservation.operationRef,
    providerRef: reservation.providerRef,
    paymentIdentifier: reservation.paymentIdentifier,
    challengeDigest: reservation.challengeDigest,
    amount: reservation.amount,
    ...(reservation.executionContext === undefined
      ? {}
      : { executionContext: reservation.executionContext }),
    ...(reservation.custodyRef === undefined
      ? {}
      : { custodyRef: reservation.custodyRef }),
    ...(reservation.custodyGeneration === undefined
      ? {}
      : { custodyGeneration: reservation.custodyGeneration }),
    ...(reservation.custodyDailyMaximum === undefined
      ? {}
      : { custodyDailyMaximum: reservation.custodyDailyMaximum }),
    idempotencyDigest: reservation.idempotencyDigest,
  }
}

export function externalSpendIdentityMatchingReservationRef(
  facts: ExternalSpendPaymentFacts,
  reservationRef: string,
): ExternalSpendIdentity | undefined {
  if (
    !externalSpendPaymentFactsValid(facts)
    || reservationRef.trim().length === 0
  ) {
    return undefined
  }
  const identity = mintExternalSpendIdentity(facts)
  return identity.reservationRef === reservationRef ? identity : undefined
}

export function externalSpendIdentityDigest(identity: ExternalSpendIdentity): string {
  return canonicalDigest({
    format: identity.executionContext === undefined
      ? 'ae.money.external-spend-identity:v1'
      : 'ae.money.external-spend-identity:v2',
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
  return left.principalId === right.principalId
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
    && sameExternalSpendExecutionContext(left, right)
    && left.custodyRef === right.custodyRef
    && left.custodyGeneration === right.custodyGeneration
    && (left.custodyDailyMaximum === undefined
      ? right.custodyDailyMaximum === undefined
      : right.custodyDailyMaximum !== undefined
        && compareExactAmounts(left.custodyDailyMaximum, right.custodyDailyMaximum) === 0)
    && sameExternalSpendIdentityReference(left, right)
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

export function externalSpendPaymentFactsValid(
  input: ExternalSpendPaymentFacts,
): boolean {
  return [
    input.principalId,
    input.credentialId,
    input.grantRef,
    input.invocationRef,
    input.attemptRef,
    input.operationRef,
    input.providerRef,
    input.paymentIdentifier,
    input.challengeDigest,
  ].every((value) => value.trim().length > 0)
    && Number.isSafeInteger(input.grantGeneration)
    && input.grantGeneration > 0
    && Number.isSafeInteger(input.effectGeneration)
    && input.effectGeneration > 0
    && (input.environment === 'sandbox' || input.environment === 'production')
    && externalSpendExecutionContextForFacts(input) !== undefined
    && exactAmountSchema.safeParse(input.amount).success
    && externalSpendCustodyPolicyRefusal(input) === undefined
}

export function externalSpendCustodyPolicyRefusal(
  input: ExternalSpendPaymentFacts,
): Extract<
  ExternalSpendRefusalCode,
  | 'external_spend_custody_policy_invalid'
  | 'external_spend_custody_daily_limit_exceeded'
> | undefined {
  const executionContext = externalSpendExecutionContextForFacts(input)
  const custodyFields = [
    input.custodyRef,
    input.custodyGeneration,
    input.custodyDailyMaximum,
  ]
  const supplied = custodyFields.filter((value) => value !== undefined).length
  if (supplied === 0) {
    return executionContext?.kind === 'seller_onboarding_canary'
      ? 'external_spend_custody_policy_invalid'
      : undefined
  }
  const custodyContextValid = executionContext?.kind === 'market'
    ? input.environment === 'production'
      && executionContext.paymentProfile === 'base-usdc-exact'
    : executionContext?.kind === 'seller_onboarding_canary'
      && input.environment === 'sandbox'
      && executionContext.paymentProfile === 'base-sepolia-usdc-exact'
  if (supplied !== custodyFields.length || !custodyContextValid) {
    return 'external_spend_custody_policy_invalid'
  }
  const { custodyRef, custodyGeneration, custodyDailyMaximum } = input
  if (
    typeof custodyRef !== 'string'
    || custodyRef.trim().length === 0
    || typeof custodyGeneration !== 'number'
    || !Number.isSafeInteger(custodyGeneration)
    || custodyGeneration <= 0
    || custodyDailyMaximum === undefined
    || !exactAmountSchema.safeParse(input.amount).success
    || !exactAmountSchema.safeParse(custodyDailyMaximum).success
    || input.amount.currency !== custodyDailyMaximum.currency
    || input.amount.exponent !== custodyDailyMaximum.exponent
  ) {
    return 'external_spend_custody_policy_invalid'
  }
  const comparison = compareExactAmounts(
    input.amount,
    custodyDailyMaximum,
  )
  if (comparison === undefined) {
    return 'external_spend_custody_policy_invalid'
  }
  return comparison > 0
    ? 'external_spend_custody_daily_limit_exceeded'
    : undefined
}

/**
 * Resolves legacy ordinary calls to their environment-bound market profile.
 * Explicit contexts are accepted only when their full discriminated shape and
 * environment/profile pair agree.
 */
export function externalSpendExecutionContextForFacts(
  input: Pick<ExternalSpendPaymentFacts, 'environment' | 'executionContext'>,
): ExternalSpendExecutionContext | undefined {
  if (input.executionContext === undefined) {
    return input.environment === 'production'
      ? { kind: 'market', paymentProfile: 'base-usdc-exact' }
      : input.environment === 'sandbox'
        ? { kind: 'market', paymentProfile: 'base-sepolia-usdc-exact' }
        : undefined
  }
  const context: unknown = input.executionContext
  if (!isRecord(context)) return undefined
  if (context.kind === 'market') {
    if (!hasExactKeys(context, ['kind', 'paymentProfile'])) return undefined
    const expectedProfile = input.environment === 'production'
      ? 'base-usdc-exact'
      : input.environment === 'sandbox'
        ? 'base-sepolia-usdc-exact'
        : undefined
    return expectedProfile !== undefined
      && context.paymentProfile === expectedProfile
      ? {
          kind: 'market',
          paymentProfile: expectedProfile,
        }
      : undefined
  }
  if (
    context.kind !== 'seller_onboarding_canary'
    || !hasExactKeys(context, [
      'kind',
      'paymentProfile',
      'canaryRef',
      'canaryCommitmentDigest',
      'fundingBudgetRef',
    ])
    || input.environment !== 'sandbox'
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

function sameExternalSpendExecutionContext(
  left: ExternalSpendPaymentFacts,
  right: ExternalSpendPaymentFacts,
): boolean {
  const leftContext = externalSpendExecutionContextForFacts(left)
  const rightContext = externalSpendExecutionContextForFacts(right)
  return leftContext !== undefined
    && rightContext !== undefined
    && canonicalDigest(leftContext as StableHashValue)
      === canonicalDigest(rightContext as StableHashValue)
}

function sameExternalSpendIdentityReference(
  left: ExternalSpendIdentity,
  right: ExternalSpendIdentity,
): boolean {
  if (
    left.reservationRef === right.reservationRef
    && left.idempotencyDigest === right.idempotencyDigest
  ) return true
  const leftLegacy = legacyMarketIdentityReference(left)
  const rightLegacy = legacyMarketIdentityReference(right)
  return leftLegacy !== undefined
    && rightLegacy !== undefined
    && leftLegacy.reservationRef === rightLegacy.reservationRef
    && leftLegacy.idempotencyDigest === rightLegacy.idempotencyDigest
}

function legacyMarketIdentityReference(
  identity: ExternalSpendIdentity,
): Readonly<{ reservationRef: string; idempotencyDigest: string }> | undefined {
  const executionContext = externalSpendExecutionContextForFacts(identity)
  if (executionContext?.kind !== 'market') return undefined
  if (identity.executionContext === undefined) {
    return {
      reservationRef: identity.reservationRef,
      idempotencyDigest: identity.idempotencyDigest,
    }
  }
  const {
    executionContext: _executionContext,
    reservationRef: _reservationRef,
    idempotencyDigest: _idempotencyDigest,
    ...legacyFacts
  } = identity
  const idempotencyDigest = canonicalDigest({
    format: 'ae.money.external-spend-idempotency:v1',
    ...legacyFacts,
  } as StableHashValue)
  return {
    reservationRef: `external-spend:${idempotencyDigest}`,
    idempotencyDigest,
  }
}

function boundedRef(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && value.trim().length > 0
    && value.length <= 512
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index])
}

export function externalSpendIdentityMaterialValid(
  input: ExternalSpendIdentity,
): boolean {
  return externalSpendPaymentFactsValid(input)
    && input.reservationRef.trim().length > 0
    && input.idempotencyDigest.trim().length > 0
}

export type ExternalSpendPolicyRefusal = Readonly<{
  kind: 'refused'
  code: ExternalSpendHandlerRefusalCode
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
): ExternalSpendHandlerRefusalCode | undefined {
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
): ExternalSpendHandlerRefusalCode | undefined {
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
  if (
    input.reservation.state !== 'outcome_unknown'
    && input.reservation.state !== 'reserved'
  ) {
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
): ExternalSpendHandlerRefusalCode | undefined {
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
