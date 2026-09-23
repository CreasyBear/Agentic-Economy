"use node"

import {
  executeFormanceMoneyBulk,
  executeFormanceMoneyCommand,
  readFormanceAccount,
  readFormanceSignedAccount,
  readFormanceTransactionByReference,
  type FormanceContext,
  type FormanceMoneyResult,
} from './formance'
import { completed, refused, unavailable } from './formance-result'
import {
  balanceAccount,
  balanceAsset,
  boundedReference,
  capacityAccount,
  expectedProviderSettlementCommand,
  formanceSpendingPeriodAccount,
  positiveGeneration,
  prepareFormanceBuyerAdjustment,
  prepareFormanceCapacitySync,
  prepareFormanceFundingReversal,
  prepareFormanceFundingSettlement,
  prepareFormanceManagedCallRelease,
  prepareFormanceManagedCallReservation,
  prepareFormanceManagedCallSettlement,
  prepareFormancePaidCallRemedy,
  prepareFormanceProviderReversal,
  prepareFormanceSpendingPeriodAdjustment,
  spendingPeriodIdentity,
  type FormanceBalanceKind,
  type FormanceBuyerAdjustment,
  type FormanceCapacitySync,
  type FormanceFundingBooking,
  type FormanceManagedCallBooking,
  type FormanceManagedCallFinalization,
  type FormanceManagedCallRelease,
  type FormanceProviderReversal,
  type FormanceSpendingPeriodAdjustment,
  type FormanceSpendingPeriodKind,
  type PreparedCommand,
  type PreparedManagedCallBulk,
} from './internal/formance-transaction-templates'

export * from './internal/formance-transaction-templates'

export type FormanceDisplayBalanceResult =
  | Readonly<{
      kind: 'available'
      balanceKind: FormanceBalanceKind
      subjectRef: string
      generation?: number
      currency: 'AUD' | 'USDC'
      exponent: 6
      units: string
      observedAt: number
      source: 'formance_live_read'
      authoritativeForConsequences: false
    }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export type FormanceLegalCustomerRebindResult =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{
      kind: 'refused'
      code: 'legal_customer_capacity_reserved' | 'legal_customer_calls_pending'
    }>
  | Readonly<{ kind: 'setup_required'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>

export async function bookFormanceFundingSettlement(
  context: FormanceContext,
  input: FormanceFundingBooking,
): Promise<FormanceMoneyResult> {
  return executePrepared(context, prepareFormanceFundingSettlement(input))
}

export async function bookFormanceFundingReversal(
  context: FormanceContext,
  input: FormanceFundingBooking,
): Promise<FormanceMoneyResult> {
  return executePrepared(context, prepareFormanceFundingReversal(input))
}

export async function reserveFormanceManagedCall(
  context: FormanceContext,
  input: FormanceManagedCallBooking,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, prepareFormanceManagedCallReservation(input))
}

export async function releaseFormanceManagedCall(
  context: FormanceContext,
  input: FormanceManagedCallRelease,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, prepareFormanceManagedCallRelease(input))
}

export async function settleFormanceManagedCall(
  context: FormanceContext,
  input: FormanceManagedCallFinalization,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, prepareFormanceManagedCallSettlement(input))
}

export async function remedyFormancePaidCall(
  context: FormanceContext,
  input: FormanceManagedCallFinalization,
): Promise<FormanceMoneyResult> {
  return executePreparedBulk(context, prepareFormancePaidCallRemedy(input))
}

export async function reverseFormanceProviderSettlement(
  context: FormanceContext,
  input: FormanceProviderReversal,
): Promise<FormanceMoneyResult> {
  const prepared = prepareFormanceProviderReversal(input)
  if (prepared.kind === 'refused') return prepared
  const expected = expectedProviderSettlementCommand(input)
  if (expected === undefined) return refused('formance_provider_reversal_input_invalid')
  const settlement = await readFormanceTransactionByReference(context, input.originalSettlementRef)
  if (settlement.kind === 'setup_required') return refused(settlement.code)
  if (settlement.kind === 'unavailable') return unavailable(settlement.code)
  if (settlement.kind !== 'found'
    || settlement.template !== 'PROVIDER_SETTLED'
    || settlement.metadata.account_digest !== expected.metadata.account_digest
    || settlement.metadata.call_digest !== expected.metadata.call_digest
    || settlement.metadata.provider_digest !== expected.metadata.provider_digest
    || settlement.metadata.policy_digest !== expected.metadata.policy_digest) {
    return refused('formance_provider_settlement_evidence_invalid')
  }
  return await executeFormanceMoneyCommand(context, prepared.command)
}

export async function bookFormanceBuyerAdjustment(
  context: FormanceContext,
  input: FormanceBuyerAdjustment,
): Promise<FormanceMoneyResult> {
  return executePrepared(context, prepareFormanceBuyerAdjustment(input))
}

/**
 * Requires a validated capacity identity and current observation. Ensures each
 * generation is funded once. Treasury observation refreshes reuse the original
 * verified initialization; they never replenish spent or reserved capacity.
 * Policy or posting mismatches remain conflicts. Quote admission separately
 * caps native available capacity by the current wallet observation.
 */
export async function syncFormanceCapacity(
  context: FormanceContext,
  input: FormanceCapacitySync,
): Promise<FormanceMoneyResult> {
  const prepared = prepareFormanceCapacitySync(input)
  if (prepared.kind === 'refused') return prepared
  const existing = await readFormanceTransactionByReference(context, prepared.command.commandRef)
  if (existing.kind === 'found') {
    // A wallet observation changes as payments settle. Reconstruct the original
    // initialization from its evidence, rather than treating a refresh as funding.
    const posting = existing.postings[0]
    const original = input.kind === 'treasury_usdc'
      && existing.postings.length === 1
      && posting?.source === 'world'
      && posting.destination === prepared.command.variables.capacity
      && posting.asset === 'USDC/6'
      ? prepareFormanceCapacitySync({
          ...input,
          targetUnits: posting.amountUnits,
          externalEvidenceDigest: `sha256:${existing.metadata.external_evidence_digest}`,
        })
      : input.kind === 'treasury_usdc' ? undefined : prepared
    return existing.template === 'TREASURY_CAPACITY_SYNCED'
      && original?.kind === 'prepared'
      && existing.metadata.command_digest === original.command.metadata.command_digest
      && existing.metadata.idempotency_digest === prepared.command.metadata.idempotency_digest
      ? completed(prepared.command.commandRef, true)
      : refused('formance_reference_conflict')
  }
  if (existing.kind === 'setup_required') return refused(existing.code)
  if (existing.kind === 'unavailable') return unavailable(existing.code)
  return await executeFormanceMoneyCommand(context, prepared.command)
}

/**
 * CONTRACT: adjustFormanceSpendingPeriod(context, input)
 *   Requires: a valid UTC day/month interval, a positive authoritative
 *     revision, canonical nonnegative previous/target ceilings, and a signed
 *     authority digest. The previous ceiling is supplied by the durable
 *     control row; it is never read from native balance.
 *   Ensures: applies exactly target - previous once, using a stable
 *     principal/period/revision reference and idempotency key. A decrease may
 *     retire an exact delta into a negative available capacity balance; an
 *     increase credits the period from @world. Equal ceilings produce a
 *     successful no-op with no transaction reference.
 *   Invariant: spending-period accounts remain stable by principal, kind, and
 *     UTC start; no purchase or buyer account is mutated by this command.
 *   On violation: returns a non-retryable refusal before reading or writing the
 *     ledger. Native ambiguity remains outcome_unknown through the existing
 *     exact-reference executor.
 */
export async function adjustFormanceSpendingPeriod(
  context: FormanceContext,
  input: FormanceSpendingPeriodAdjustment,
): Promise<FormanceMoneyResult> {
  const delta = BigInt(input.targetLimitUnits) - BigInt(input.previousLimitUnits)
  if (delta === 0n) {
    return Object.freeze({ kind: 'completed', transactionRefs: Object.freeze([]), replayed: false })
  }
  return executePrepared(context, prepareFormanceSpendingPeriodAdjustment(input))
}

/**
 * CONTRACT: readFormanceSpendingPeriod(context, input)
 *   Requires: a genuine UTC day or month interval. The account is derived from
 *     the supplied principal and period identity, never from the current clock.
 *   Ensures: returns the native available capacity with negative deficits
 *     clamped to spendable zero and marks the read non-authoritative for an
 *     admission consequence.
 *   Invariant: the ledger remains the only usage/balance authority; this query
 *     does not create, reset, or alter a period account.
 *   On violation: returns setup_required for malformed periods or unsafe data,
 *     unavailable for source failures, and not a magic numeric fallback.
 */
export async function readFormanceSpendingPeriod(
  context: FormanceContext,
  input: Readonly<{
    principalRef: string
    periodKind: FormanceSpendingPeriodKind
    periodStartAt: number
    periodEndAt: number
  }>,
): Promise<
  | Exclude<FormanceDisplayBalanceResult, { kind: 'available' }>
  | (Extract<FormanceDisplayBalanceResult, { kind: 'available' }> & { currency: 'AUD'; balanceKind: 'agent_budget' })
> {
  if (spendingPeriodIdentity(input) === undefined) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_spending_period_input_invalid' })
  }
  const read = await readFormanceSignedAccount(
    context,
    formanceSpendingPeriodAccount(input.principalRef, input.periodKind, input.periodStartAt).available,
  )
  if (read.kind === 'setup_required' || read.kind === 'unavailable') return read
  const balance = read.kind === 'not_found' ? '0' : read.volumes['AUD/6']?.balanceUnits ?? '0'
  const units = BigInt(balance) < 0n ? '0' : balance
  return Object.freeze({
    kind: 'available',
    balanceKind: 'agent_budget',
    subjectRef: input.principalRef,
    currency: 'AUD',
    exponent: 6,
    units,
    observedAt: Date.now(),
    source: 'formance_live_read',
    authoritativeForConsequences: false,
  })
}

export async function readFormanceDisplayBalance(
  context: FormanceContext,
  input: Readonly<{
    balanceKind: FormanceBalanceKind
    subjectRef: string
    generation?: number
    now?: number
  }>,
): Promise<FormanceDisplayBalanceResult> {
  if (!boundedReference(input.subjectRef)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_balance_subject_invalid' })
  }
  if (input.balanceKind !== 'account_aud' && !positiveGeneration(input.generation)) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_balance_generation_invalid' })
  }
  const observedAt = input.now ?? Date.now()
  if (!Number.isSafeInteger(observedAt) || observedAt < 0) {
    return Object.freeze({ kind: 'setup_required', code: 'formance_balance_time_invalid' })
  }
  const address = balanceAccount(input.balanceKind, input.subjectRef, input.generation)
  const asset = balanceAsset(input.balanceKind)
  const read = await readFormanceAccount(context, address)
  if (read.kind === 'setup_required' || read.kind === 'unavailable') return read
  const units = read.kind === 'not_found' ? '0' : read.volumes[asset]?.balanceUnits ?? '0'
  return Object.freeze({
    kind: 'available',
    balanceKind: input.balanceKind,
    subjectRef: input.subjectRef,
    ...(input.generation === undefined ? {} : { generation: input.generation }),
    currency: asset === 'AUD/6' ? 'AUD' : 'USDC',
    exponent: 6,
    units,
    observedAt,
    source: 'formance_live_read',
    authoritativeForConsequences: false,
  })
}

export async function canRebindFormanceLegalCustomer(
  context: FormanceContext,
  input: Readonly<{
    legalCustomerRef: string
    generation: number
    pendingCallCount: number
  }>,
): Promise<FormanceLegalCustomerRebindResult> {
  if (!boundedReference(input.legalCustomerRef)
    || !positiveGeneration(input.generation)
    || !Number.isSafeInteger(input.pendingCallCount)
    || input.pendingCallCount < 0) {
    return Object.freeze({ kind: 'setup_required', code: 'legal_customer_rebind_input_invalid' })
  }
  if (input.pendingCallCount > 0) {
    return Object.freeze({ kind: 'refused', code: 'legal_customer_calls_pending' })
  }
  const read = await readFormanceAccount(
    context,
    capacityAccount('legal_customer_exposure', input.legalCustomerRef, input.generation).replace(
      /:exposure_available$/u,
      ':exposure_reserved',
    ),
  )
  if (read.kind === 'setup_required' || read.kind === 'unavailable') return read
  const reserved = read.kind === 'not_found' ? '0' : read.volumes['AUD/6']?.balanceUnits ?? '0'
  return reserved === '0'
    ? Object.freeze({ kind: 'allowed' })
    : Object.freeze({ kind: 'refused', code: 'legal_customer_capacity_reserved' })
}

async function executePrepared(
  context: FormanceContext,
  prepared: PreparedCommand,
): Promise<FormanceMoneyResult> {
  return prepared.kind === 'refused'
    ? prepared
    : await executeFormanceMoneyCommand(context, prepared.command)
}

async function executePreparedBulk(
  context: FormanceContext,
  prepared: PreparedManagedCallBulk,
): Promise<FormanceMoneyResult> {
  return prepared.kind === 'refused'
    ? prepared
    : await executeFormanceMoneyBulk(context, prepared.bulk)
}
