"use node"

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/utc-calendar'

import {
  canonicalFormanceUnits,
  executeFormanceMoneyBulk,
  executeFormanceMoneyCommand,
  formanceMonetaryVariable,
  readFormanceAccount,
  readFormanceSignedAccount,
  readFormanceTransactionByReference,
  LEGACY_FORMANCE_SCHEMA_VERSION,
  FORMANCE_SCHEMA_VERSION,
  type FormanceContext,
  type FormanceMoneyCommand,
  type FormanceMoneyBulkCommand,
  type FormanceMoneyResult,
} from './formance'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from './internal/commercial-policy'
import { spendingPeriodAdjustmentReference } from './internal/spending-period-values'

const SHA256 = /^sha256:[a-f0-9]{64}$/u
const BOUNDED_REFERENCE = /^[\u0020-\u007e]{1,500}$/u

export type FormanceFundingBooking = Readonly<{
  commandRef: string
  idempotencyKey: string
  accountRef: string
  processorRef: string
  principalUnits: string
  serviceFeeUnits: string
  taxUnits: string
  totalUnits: string
  policyDigest: string
  externalEvidenceDigest: string
}>

export type FormanceCapacityKind =
  | 'agent_budget'
  | 'legal_customer_exposure'
  | 'treasury_usdc'

export type FormanceBalanceKind = 'account_aud' | FormanceCapacityKind

export type FormanceCapacitySync = Readonly<{
  commandRef: string
  idempotencyKey: string
  kind: FormanceCapacityKind
  subjectRef: string
  generation: number
  targetUnits: string
  policyDigest: string
  externalEvidenceDigest: string
}>

export type FormanceManagedCallBooking = Readonly<{
  callRef: string
  quoteRef: string
  idempotencyKey: string
  accountRef: string
  principalRef: string
  agentBudgetGeneration: number
  legalCustomerRef: string
  legalCustomerGeneration: number
  treasuryRef: string
  treasuryGeneration: number
  toolRef: string
  providerRef: string
  authorityGeneration: number
  policyGeneration: number
  buyerAmountUnits: string
  buyerRevenueUnits: string
  buyerTaxUnits: string
  providerAmountUnits: string
  quoteDigest: string
  inputDigest: string
  policyDigest: string
  rateEvidenceDigest: string
  treasuryEvidenceDigest: string
  x402RequirementDigest: string
  spendingPeriods?: FormanceManagedCallSpendingPeriods
}>

export type FormanceManagedCallSpendingPeriod = Readonly<{
  periodStartAt: number
  periodEndAt: number
  revision: number
  limitUnits: string
}>

export type FormanceManagedCallSpendingPeriods = Readonly<{
  version: 'ae.spending-periods:v1'
  daily: FormanceManagedCallSpendingPeriod
  monthly: FormanceManagedCallSpendingPeriod
}>

export type FormanceSpendingPeriodKind = 'day' | 'month'

export type FormanceSpendingPeriodAdjustment = Readonly<{
  principalRef: string
  periodKind: FormanceSpendingPeriodKind
  periodStartAt: number
  periodEndAt: number
  revision: number
  previousLimitUnits: string
  targetLimitUnits: string
  authorityDigest: string
}>

export type FormanceManagedCallFinalization = Readonly<{
  booking: FormanceManagedCallBooking
  externalEvidenceDigest: string
}>

export type FormanceManagedCallRelease = FormanceManagedCallFinalization & Readonly<{
  submissionProvenAbsent: true
}>

export type FormanceProviderReversal = Readonly<{
  booking: FormanceManagedCallBooking
  originalSettlementRef: string
  correctionEvidenceDigest: string
}>

export type FormanceBuyerAdjustment = Readonly<{
  documentRef: string
  accountRef: string
  residualUnits: string
  policyDigest: string
  snapshotDigest: string
}>

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

type PreparedCommand =
  | Readonly<{ kind: 'prepared'; command: FormanceMoneyCommand }>
  | Readonly<{ kind: 'refused'; code: string; retryable: false }>

export type PreparedManagedCallBulk =
  | Readonly<{ kind: 'prepared'; bulk: FormanceMoneyBulkCommand }>
  | Readonly<{ kind: 'refused'; code: string; retryable: false }>

export function prepareFormanceFundingSettlement(input: FormanceFundingBooking): PreparedCommand {
  return prepareFundingCommand('FUNDING_SETTLED', 'funding', input)
}

export function prepareFormanceFundingReversal(input: FormanceFundingBooking): PreparedCommand {
  return prepareFundingCommand('FUNDING_REVERSED', 'funding-reversal', input)
}

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

export function prepareFormanceManagedCallReservation(
  input: FormanceManagedCallBooking,
): PreparedManagedCallBulk {
  const accounts = managedCallAccounts(input)
  const amounts = managedCallAmounts(input)
  if (accounts === undefined || amounts === undefined) {
    return refused('formance_managed_call_input_invalid')
  }
  return preparedBulk([
    managedCallCommand(input, 'reserve-aud', 'CALL_RESERVED_AUD', {
      account_available: accounts.accountAvailable,
      call_reserved: accounts.callReserved,
      legal_available: accounts.legalAvailable,
      legal_reserved: accounts.legalReserved,
      buyer_amount: amounts.buyer,
      exposure_amount: amounts.buyer,
      ...managedCallGenerationBudgetVariables(input, accounts, amounts, 'reserve'),
      ...managedCallPeriodVariables(input, accounts, amounts, 'reserve'),
    }),
    managedCallCommand(input, 'reserve-usdc', 'CALL_RESERVED_USDC', {
      source: accounts.treasuryAvailable,
      destination: accounts.treasuryCommitted,
      amount: amounts.provider,
    }),
    managedCallCommand(input, 'obligation-accrued', 'PROVIDER_OBLIGATION_ACCRUED', {
      expense: 'platform:expense:providers',
      obligation: accounts.obligationAccrued,
      amount: amounts.provider,
    }),
  ])
}

export function prepareFormanceManagedCallRelease(
  input: FormanceManagedCallRelease,
): PreparedManagedCallBulk {
  const accounts = managedCallAccounts(input.booking)
  const amounts = managedCallAmounts(input.booking)
  if (accounts === undefined
    || amounts === undefined
    || input.submissionProvenAbsent !== true
    || !SHA256.test(input.externalEvidenceDigest)) {
    return refused('formance_managed_call_input_invalid')
  }
  return preparedBulk([
    managedCallCommand(input.booking, 'release-aud', 'CALL_RELEASED_AUD', {
      account_available: accounts.accountAvailable,
      call_reserved: accounts.callReserved,
      legal_available: accounts.legalAvailable,
      legal_reserved: accounts.legalReserved,
      buyer_amount: amounts.buyer,
      exposure_amount: amounts.buyer,
      ...managedCallGenerationBudgetVariables(input.booking, accounts, amounts, 'release'),
      ...managedCallPeriodVariables(input.booking, accounts, amounts, 'release'),
    }, input.externalEvidenceDigest),
    managedCallCommand(input.booking, 'release-usdc', 'CALL_RELEASED_USDC', {
      treasury_committed: accounts.treasuryCommitted,
      treasury_available: accounts.treasuryAvailable,
      obligation_accrued: accounts.obligationAccrued,
      expense: 'platform:expense:providers',
      amount: amounts.provider,
    }, input.externalEvidenceDigest),
  ])
}

export function prepareFormanceManagedCallSettlement(
  input: FormanceManagedCallFinalization,
): PreparedManagedCallBulk {
  const accounts = managedCallAccounts(input.booking)
  const amounts = managedCallAmounts(input.booking)
  if (accounts === undefined || amounts === undefined || !SHA256.test(input.externalEvidenceDigest)) {
    return refused('formance_managed_call_input_invalid')
  }
  return preparedBulk([
    managedCallCommand(input.booking, 'settle-buyer', 'BUYER_SALE_SETTLED', {
      call_reserved: accounts.callReserved,
      revenue: 'platform:revenue:sales',
      tax: 'platform:tax:gst',
      legal_reserved: accounts.legalReserved,
      legal_settled: accounts.legalSettled,
      revenue_amount: amounts.revenue,
      tax_amount: amounts.tax,
      exposure_amount: amounts.buyer,
      ...managedCallGenerationBudgetVariables(input.booking, accounts, amounts, 'settle'),
      ...managedCallPeriodVariables(input.booking, accounts, amounts, 'settle'),
    }, input.externalEvidenceDigest),
    managedCallCommand(input.booking, 'settle-provider', 'PROVIDER_SETTLED', {
      treasury_committed: accounts.treasuryCommitted,
      provider_settlement: accounts.providerSettlement,
      obligation_accrued: accounts.obligationAccrued,
      obligation_settled: accounts.obligationSettled,
      amount: amounts.provider,
    }, input.externalEvidenceDigest),
  ])
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

export async function reverseFormanceProviderSettlement(
  context: FormanceContext,
  input: FormanceProviderReversal,
): Promise<FormanceMoneyResult> {
  if (!SHA256.test(input.correctionEvidenceDigest)) {
    return refused('formance_provider_reversal_input_invalid')
  }
  const accounts = managedCallAccounts(input.booking)
  const amounts = managedCallAmounts(input.booking)
  if (accounts === undefined || amounts === undefined) {
    return refused('formance_provider_reversal_input_invalid')
  }
  const expectedSettlement = managedCallCommand(
    input.booking,
    'settle-provider',
    'PROVIDER_SETTLED',
    {
      treasury_committed: accounts.treasuryCommitted,
      provider_settlement: accounts.providerSettlement,
      obligation_accrued: accounts.obligationAccrued,
      obligation_settled: accounts.obligationSettled,
      amount: amounts.provider,
    },
    input.correctionEvidenceDigest,
  )
  if (expectedSettlement.commandRef !== input.originalSettlementRef) {
    return refused('formance_provider_settlement_reference_invalid')
  }
  const settlement = await readFormanceTransactionByReference(context, input.originalSettlementRef)
  if (settlement.kind === 'setup_required') return refused(settlement.code)
  if (settlement.kind === 'unavailable') return unavailable(settlement.code)
  if (settlement.kind !== 'found'
    || settlement.template !== 'PROVIDER_SETTLED'
    || settlement.metadata.account_digest !== expectedSettlement.metadata.account_digest
    || settlement.metadata.call_digest !== expectedSettlement.metadata.call_digest
    || settlement.metadata.provider_digest !== expectedSettlement.metadata.provider_digest
    || settlement.metadata.policy_digest !== expectedSettlement.metadata.policy_digest) {
    return refused('formance_provider_settlement_evidence_invalid')
  }
  return await executeFormanceMoneyCommand(context, managedCallCommand(
    input.booking,
    'reverse-provider',
    'PROVIDER_REVERSED',
    {
      treasury_available: accounts.treasuryAvailable,
      provider_settlement: accounts.providerSettlement,
      obligation_settled: accounts.obligationSettled,
      obligation_reversed: accounts.obligationReversed,
      amount: amounts.provider,
    },
    input.correctionEvidenceDigest,
  ))
}

export function prepareFormanceBuyerAdjustment(input: FormanceBuyerAdjustment): PreparedCommand {
  if (!boundedReference(input.documentRef)
    || !boundedReference(input.accountRef)
    || !/^-?[1-9]\d{0,15}$/u.test(input.residualUnits)
    || !SHA256.test(input.policyDigest)
    || !SHA256.test(input.snapshotDigest)) return refused('formance_buyer_adjustment_input_invalid')
  const signedUnits = BigInt(input.residualUnits)
  const absoluteUnits = signedUnits < 0n ? -signedUnits : signedUnits
  const amount = formanceMonetaryVariable('AUD', absoluteUnits.toString())
  if (amount === undefined) return refused('formance_buyer_adjustment_input_invalid')
  const accountDigest = digestReference('account', input.accountRef)
  const adjustmentAccount = `adjustments:${digestReference('document', input.documentRef)}:buyer`
  const commandIdentity = { documentRef: input.documentRef, kind: 'statement-rounding' }
  const idempotencyDigest = digestValue('document-adjustment-idempotency', commandIdentity)
  return Object.freeze({
    kind: 'prepared',
    command: Object.freeze({
      commandRef: formanceReference(commandIdentity, 'buyer-adjustment'),
      idempotencyKey: idempotencyDigest,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      template: 'BUYER_ADJUSTED',
      variables: Object.freeze({
        source: signedUnits > 0n ? adjustmentAccount : 'platform:revenue:sales',
        destination: signedUnits > 0n ? 'platform:revenue:sales' : adjustmentAccount,
        amount,
      }),
      metadata: Object.freeze({
        account_digest: accountDigest,
        command_digest: digestValue('document-adjustment-command', {
          format: 'ae.formance-document-adjustment:v1',
          ...input,
        }),
        external_evidence_digest: stripDigest(input.snapshotDigest),
        idempotency_digest: idempotencyDigest,
        policy_digest: stripDigest(input.policyDigest),
      }),
    }),
  })
}

export async function bookFormanceBuyerAdjustment(
  context: FormanceContext,
  input: FormanceBuyerAdjustment,
): Promise<FormanceMoneyResult> {
  return executePrepared(context, prepareFormanceBuyerAdjustment(input))
}

export async function syncFormanceCapacity(
  context: FormanceContext,
  input: FormanceCapacitySync,
): Promise<FormanceMoneyResult> {
  const semantic = capacitySemantic(input)
  if (semantic === undefined) return refused('formance_capacity_input_invalid')
  const generationIdentity = {
    kind: input.kind,
    subjectRef: input.subjectRef,
    generation: input.generation,
  }
  const reference = formanceReference(generationIdentity, 'capacity')
  const idempotencyDigest = digestValue('capacity-idempotency', generationIdentity)
  const commandDigest = digestValue('capacity-command', semantic)
  const existing = await readFormanceTransactionByReference(context, reference)
  if (existing.kind === 'found') {
    return existing.template === 'TREASURY_CAPACITY_SYNCED'
      && existing.metadata.command_digest === commandDigest
      && existing.metadata.idempotency_digest === idempotencyDigest
      ? completed(reference, true)
      : refused('formance_reference_conflict')
  }
  if (existing.kind === 'setup_required') return refused(existing.code)
  if (existing.kind === 'unavailable') return unavailable(existing.code)

  const account = capacityAccount(input.kind, input.subjectRef, input.generation)
  const asset = capacityAsset(input.kind)
  const amount = `${asset} ${input.targetUnits}`
  const subjectDigest = digestReference(input.kind, input.subjectRef)
  const metadata = {
    command_digest: commandDigest,
    idempotency_digest: idempotencyDigest,
    external_evidence_digest: stripDigest(input.externalEvidenceDigest),
    policy_digest: stripDigest(input.policyDigest),
    ...(input.kind === 'agent_budget' ? { principal_digest: subjectDigest } : {}),
    ...(input.kind === 'legal_customer_exposure'
      ? { legal_customer_digest: subjectDigest }
      : {}),
  }
  return await executeFormanceMoneyCommand(context, {
    commandRef: reference,
    idempotencyKey: idempotencyDigest,
    schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
    template: 'TREASURY_CAPACITY_SYNCED',
    variables: {
      capacity: account,
      amount,
    },
    metadata,
  })
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
  const semantic = spendingPeriodAdjustmentSemantic(input)
  if (semantic === undefined) return refused('formance_spending_period_adjustment_input_invalid')
  const delta = BigInt(input.targetLimitUnits) - BigInt(input.previousLimitUnits)
  if (delta === 0n) return Object.freeze({ kind: 'completed', transactionRefs: Object.freeze([]), replayed: false })

  const periodAccount = formanceSpendingPeriodAccount(
    input.principalRef,
    input.periodKind,
    input.periodStartAt,
  )
  const identity = {
    principalRef: input.principalRef,
    periodKind: input.periodKind,
    periodStartAt: input.periodStartAt,
    revision: input.revision,
  }
  const idempotencyDigest = digestValue('spending-period-adjustment-idempotency', identity)
  const commandDigest = digestValue('spending-period-adjustment-command', semantic)
  const decrease = delta < 0n
  const absoluteDelta = (decrease ? -delta : delta).toString()
  const retired = `adjustments:${digestReference('spending_period', identity)}:buyer`
  return await executeFormanceMoneyCommand(context, {
    commandRef: spendingPeriodAdjustmentReference(input),
    idempotencyKey: idempotencyDigest,
    schemaVersion: FORMANCE_SCHEMA_VERSION,
    template: decrease ? 'SPENDING_PERIOD_DECREASED' : 'SPENDING_PERIOD_INCREASED',
    variables: Object.freeze({
      period_available: periodAccount.available,
      ...(decrease ? { retired } : {}),
      amount: `AUD/6 ${absoluteDelta}`,
    }),
    metadata: Object.freeze({
      command_digest: commandDigest,
      idempotency_digest: idempotencyDigest,
      policy_digest: stripDigest(input.authorityDigest),
      principal_digest: digestReference('principal', input.principalRef),
    }),
  })
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
): Promise<FormanceDisplayBalanceResult> {
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

function prepareFundingCommand(
  template: 'FUNDING_SETTLED' | 'FUNDING_REVERSED',
  suffix: 'funding' | 'funding-reversal',
  input: FormanceFundingBooking,
): PreparedCommand {
  const semantic = fundingSemantic(input)
  if (semantic === undefined) return refused('formance_funding_input_invalid')
  const principalAmount = formanceMonetaryVariable('AUD', input.principalUnits)
  const serviceFeeAmount = formanceMonetaryVariable('AUD', input.serviceFeeUnits)
  const taxAmount = formanceMonetaryVariable('AUD', input.taxUnits)
  const totalAmount = formanceMonetaryVariable('AUD', input.totalUnits)
  if (principalAmount === undefined
    || serviceFeeAmount === undefined
    || taxAmount === undefined
    || totalAmount === undefined) return refused('formance_funding_amount_invalid')
  const accountDigest = digestReference('account', input.accountRef)
  const processorDigest = digestReference('processor', input.processorRef)
  const idempotencyDigest = digestValue('idempotency', input.idempotencyKey)
  const commandDigest = digestValue(`${template}:command`, semantic)
  return Object.freeze({
    kind: 'prepared',
    command: Object.freeze({
      commandRef: formanceReference(input.commandRef, suffix),
      idempotencyKey: idempotencyDigest,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      template,
      variables: Object.freeze({
        processor: `processor:${processorDigest}:settlement`,
        account: `accounts:${accountDigest}:available`,
        revenue: 'platform:revenue:sales',
        tax: 'platform:tax:gst',
        principal_amount: principalAmount,
        service_fee_amount: serviceFeeAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      }),
      metadata: Object.freeze({
        account_digest: accountDigest,
        command_digest: commandDigest,
        external_evidence_digest: stripDigest(input.externalEvidenceDigest),
        idempotency_digest: idempotencyDigest,
        policy_digest: stripDigest(input.policyDigest),
      }),
    }),
  })
}

function fundingSemantic(input: FormanceFundingBooking) {
  if (!boundedReference(input.commandRef)
    || !boundedReference(input.idempotencyKey)
    || !boundedReference(input.accountRef)
    || !boundedReference(input.processorRef)
    || !SHA256.test(input.policyDigest)
    || !SHA256.test(input.externalEvidenceDigest)) return undefined
  const amounts = [
    input.principalUnits,
    input.serviceFeeUnits,
    input.taxUnits,
    input.totalUnits,
  ]
  if (amounts.some((amount) => canonicalFormanceUnits(amount) === undefined)) return undefined
  if (BigInt(input.principalUnits) + BigInt(input.serviceFeeUnits) + BigInt(input.taxUnits)
    !== BigInt(input.totalUnits)) return undefined
  return Object.freeze({
    format: 'ae.formance-funding-booking:v1',
    ...input,
  })
}

function capacitySemantic(input: FormanceCapacitySync) {
  if (!boundedReference(input.commandRef)
    || !boundedReference(input.idempotencyKey)
    || !boundedReference(input.subjectRef)
    || !positiveGeneration(input.generation)
    || !SHA256.test(input.policyDigest)
    || !SHA256.test(input.externalEvidenceDigest)
    || canonicalFormanceUnits(input.targetUnits) === undefined) return undefined
  return Object.freeze({ format: 'ae.formance-capacity-sync:v1', ...input })
}

function validManagedCallSpendingPeriods(
  input: FormanceManagedCallBooking,
): boolean {
  const periods = input.spendingPeriods
  if (periods === undefined || typeof periods !== 'object' || periods === null
    || periods.version !== 'ae.spending-periods:v1') return false
  if (!validSpendingPeriod(input.principalRef, 'day', periods.daily)
    || !validSpendingPeriod(input.principalRef, 'month', periods.monthly)) return false
  return periods.daily.periodStartAt >= periods.monthly.periodStartAt
    && periods.daily.periodEndAt <= periods.monthly.periodEndAt
}

function validSpendingPeriod(
  principalRef: unknown,
  periodKind: FormanceSpendingPeriodKind,
  period: unknown,
): period is FormanceManagedCallSpendingPeriod {
  if (!boundedReference(principalRef)
    || typeof period !== 'object'
    || period === null) return false
  const candidate = period as Partial<FormanceManagedCallSpendingPeriod>
  if (!Number.isSafeInteger(candidate.periodStartAt)
    || !Number.isSafeInteger(candidate.periodEndAt)
    || !positiveGeneration(candidate.revision)
    || canonicalFormanceUnits(candidate.limitUnits ?? '', false) === undefined) return false
  return validUtcPeriod(periodKind, candidate.periodStartAt, candidate.periodEndAt)
}

function validUtcPeriod(
  periodKind: FormanceSpendingPeriodKind,
  periodStartAt: number,
  periodEndAt: number,
): boolean {
  if (!Number.isSafeInteger(periodStartAt)
    || !Number.isSafeInteger(periodEndAt)
    || periodStartAt < 0
    || periodEndAt <= periodStartAt) return false
  try {
    const expected = periodKind === 'day'
      ? currentUtcDayBounds(periodStartAt)
      : currentUtcMonthBounds(periodStartAt)
    return expected.periodStartAt === periodStartAt && expected.periodEndAt === periodEndAt
  } catch {
    return false
  }
}

function spendingPeriodIdentity(input: Readonly<{
  principalRef: unknown
  periodKind: unknown
  periodStartAt: unknown
  periodEndAt: unknown
}>): input is Readonly<{
  principalRef: string
  periodKind: FormanceSpendingPeriodKind
  periodStartAt: number
  periodEndAt: number
}> {
  if (typeof input !== 'object' || input === null) return false
  return (input.periodKind === 'day' || input.periodKind === 'month')
    && validSpendingPeriod(input.principalRef, input.periodKind, {
      periodStartAt: input.periodStartAt,
      periodEndAt: input.periodEndAt,
      revision: 1,
      limitUnits: '0',
    })
}

function spendingPeriodAccounts(input: FormanceManagedCallBooking): Readonly<Record<string, string>> {
  const periods = input.spendingPeriods
  if (periods === undefined) return Object.freeze({})
  const daily = formanceSpendingPeriodAccount(input.principalRef, 'day', periods.daily.periodStartAt)
  const monthly = formanceSpendingPeriodAccount(input.principalRef, 'month', periods.monthly.periodStartAt)
  return Object.freeze({
    dailyAvailable: daily.available,
    dailyReserved: daily.reserved,
    dailySpent: daily.spent,
    monthlyAvailable: monthly.available,
    monthlyReserved: monthly.reserved,
    monthlySpent: monthly.spent,
  })
}

export function formanceSpendingPeriodAccount(
  principalRef: string,
  periodKind: FormanceSpendingPeriodKind,
  periodStartAt: number,
): Readonly<{ available: string; reserved: string; spent: string }> {
  const digest = digestReference('spending_period', { principalRef, periodKind, periodStartAt })
  return Object.freeze({
    available: `spending_periods:${digest}:available`,
    reserved: `spending_periods:${digest}:reserved`,
    spent: `spending_periods:${digest}:spent`,
  })
}

function spendingPeriodAdjustmentSemantic(input: FormanceSpendingPeriodAdjustment) {
  if (typeof input !== 'object' || input === null
    || !spendingPeriodIdentity(input)
    || !positiveGeneration(input.revision)
    || canonicalFormanceUnits(input.previousLimitUnits, false) === undefined
    || canonicalFormanceUnits(input.targetLimitUnits, false) === undefined
    || !SHA256.test(input.authorityDigest)) return undefined
  return Object.freeze({
    format: 'ae.formance-spending-period-adjustment:v1',
    ...input,
  })
}

function managedCallGenerationBudgetVariables(
  input: FormanceManagedCallBooking,
  accounts: NonNullable<ReturnType<typeof managedCallAccounts>>,
  amounts: Readonly<{ buyer: string }>,
  operation: 'reserve' | 'release' | 'settle',
): Readonly<Record<string, string>> {
  // v1.3 accepted Calls reserve the generation budget. v1.4 period-aware
  // Calls use daily/monthly capacity as that budget and must not debit a
  // second, generation-scoped allowance.
  if (input.spendingPeriods !== undefined) return Object.freeze({})
  return operation === 'settle'
    ? Object.freeze({
        agent_reserved: accounts.agentReserved,
        agent_spent: accounts.agentSpent,
        budget_amount: amounts.buyer,
      })
    : Object.freeze({
        agent_available: accounts.agentAvailable,
        agent_reserved: accounts.agentReserved,
        budget_amount: amounts.buyer,
      })
}

function managedCallPeriodVariables(
  input: FormanceManagedCallBooking,
  accounts: NonNullable<ReturnType<typeof managedCallAccounts>>,
  amounts: Readonly<{ buyer: string }>,
  operation: 'reserve' | 'release' | 'settle',
): Readonly<Record<string, string>> {
  if (input.spendingPeriods === undefined
    || accounts.dailyAvailable === undefined
    || accounts.dailyReserved === undefined
    || accounts.dailySpent === undefined
    || accounts.monthlyAvailable === undefined
    || accounts.monthlyReserved === undefined
    || accounts.monthlySpent === undefined) return Object.freeze({})
  const fields = operation === 'reserve'
    ? {
        daily_available: accounts.dailyAvailable,
        daily_reserved: accounts.dailyReserved,
        monthly_available: accounts.monthlyAvailable,
        monthly_reserved: accounts.monthlyReserved,
      }
    : operation === 'release'
      ? {
          daily_reserved: accounts.dailyReserved,
          daily_available: accounts.dailyAvailable,
          monthly_reserved: accounts.monthlyReserved,
          monthly_available: accounts.monthlyAvailable,
        }
      : {
          daily_reserved: accounts.dailyReserved,
          daily_spent: accounts.dailySpent,
          monthly_reserved: accounts.monthlyReserved,
          monthly_spent: accounts.monthlySpent,
        }
  return Object.freeze({ ...fields, daily_amount: amounts.buyer, monthly_amount: amounts.buyer })
}

function managedCallAccounts(input: FormanceManagedCallBooking) {
  if (!managedCallSemantic(input)) return undefined
  const callDigest = digestReference('call', input.callRef)
  const agentDigest = digestReference('agent_budget', {
    subjectRef: input.principalRef,
    generation: input.agentBudgetGeneration,
  })
  const legalDigest = digestReference('legal_customer_exposure', {
    subjectRef: input.legalCustomerRef,
    generation: input.legalCustomerGeneration,
  })
  const treasuryDigest = digestReference('treasury_usdc', {
    subjectRef: input.treasuryRef,
    generation: input.treasuryGeneration,
  })
  const periodAccounts = spendingPeriodAccounts(input)
  return Object.freeze({
    accountAvailable: `accounts:${digestReference('account', input.accountRef)}:available`,
    callReserved: `calls:${callDigest}:buyer_reserved`,
    agentAvailable: `agents:${agentDigest}:budget_available`,
    agentReserved: `agents:${agentDigest}:budget_reserved`,
    agentSpent: `agents:${agentDigest}:budget_spent`,
    legalAvailable: `legal_customers:${legalDigest}:exposure_available`,
    legalReserved: `legal_customers:${legalDigest}:exposure_reserved`,
    legalSettled: `legal_customers:${legalDigest}:exposure_settled`,
    treasuryAvailable: `treasury:corporate:${treasuryDigest}:available`,
    treasuryCommitted: `treasury:corporate:${treasuryDigest}:committed`,
    obligationAccrued: `provider_obligations:${callDigest}:accrued`,
    obligationSettled: `provider_obligations:${callDigest}:settled`,
    obligationReversed: `provider_obligations:${callDigest}:reversed`,
    providerSettlement: `providers:${digestReference('provider', input.providerRef)}:settlement`,
    ...periodAccounts,
  })
}

function managedCallAmounts(input: FormanceManagedCallBooking) {
  if (!managedCallSemantic(input)) return undefined
  const buyer = formanceMonetaryVariable('AUD', input.buyerAmountUnits)
  const revenue = formanceMonetaryVariable('AUD', input.buyerRevenueUnits)
  const tax = formanceMonetaryVariable('AUD', input.buyerTaxUnits, true)
  const provider = formanceMonetaryVariable('USDC', input.providerAmountUnits)
  return buyer === undefined || revenue === undefined || tax === undefined || provider === undefined
    ? undefined
    : Object.freeze({ buyer, revenue, tax, provider })
}

function managedCallSemantic(input: FormanceManagedCallBooking): boolean {
  const refs = [
    input.callRef,
    input.quoteRef,
    input.idempotencyKey,
    input.accountRef,
    input.principalRef,
    input.legalCustomerRef,
    input.treasuryRef,
    input.toolRef,
    input.providerRef,
  ]
  const generations = [
    input.agentBudgetGeneration,
    input.legalCustomerGeneration,
    input.treasuryGeneration,
    input.authorityGeneration,
    input.policyGeneration,
  ]
  const digests = [
    input.quoteDigest,
    input.inputDigest,
    input.policyDigest,
    input.rateEvidenceDigest,
    input.treasuryEvidenceDigest,
    input.x402RequirementDigest,
  ]
  const amounts = [
    input.buyerAmountUnits,
    input.buyerRevenueUnits,
    input.providerAmountUnits,
  ]
  return refs.every(boundedReference)
    && generations.every(positiveGeneration)
    && digests.every((digest) => SHA256.test(digest))
    && amounts.every((amount) => canonicalFormanceUnits(amount) !== undefined)
    && canonicalFormanceUnits(input.buyerTaxUnits, false) !== undefined
    && BigInt(input.buyerRevenueUnits) + BigInt(input.buyerTaxUnits)
      === BigInt(input.buyerAmountUnits)
    && (input.spendingPeriods === undefined || validManagedCallSpendingPeriods(input))
}

function managedCallCommand(
  input: FormanceManagedCallBooking,
  stage: string,
  template: FormanceMoneyCommand['template'],
  variables: Readonly<Record<string, string>>,
  externalEvidenceDigest = input.x402RequirementDigest,
): FormanceMoneyCommand {
  const identity = { callRef: input.callRef, quoteRef: input.quoteRef, stage }
  const idempotencyDigest = digestValue('managed-call-idempotency', {
    idempotencyKey: input.idempotencyKey,
    ...identity,
  })
  return Object.freeze({
    commandRef: formanceReference(identity, stage),
    idempotencyKey: idempotencyDigest,
    schemaVersion: input.spendingPeriods === undefined
      ? LEGACY_FORMANCE_SCHEMA_VERSION
      : FORMANCE_SCHEMA_VERSION,
    template,
    variables: Object.freeze({ ...variables }),
    metadata: Object.freeze({
      account_digest: digestReference('account', input.accountRef),
      call_digest: digestReference('call', input.callRef),
      command_digest: digestValue('managed-call-command', {
        format: input.spendingPeriods === undefined
          ? 'ae.formance-managed-call:v1'
          : 'ae.formance-managed-call:v2',
        // The legacy branch intentionally receives the original object shape;
        // adding a missing optional property would change accepted digests.
        input,
        stage,
        template,
        externalEvidenceDigest,
      }),
      // Formance's command envelope retains its historical key; the value is
      // sourced from the current Quote evidence field.
      commitment_digest: stripDigest(input.quoteDigest),
      external_evidence_digest: stripDigest(externalEvidenceDigest),
      idempotency_digest: idempotencyDigest,
      legal_customer_digest: digestReference('legal_customer', input.legalCustomerRef),
      operation_digest: digestReference('operation', input.toolRef),
      policy_digest: stripDigest(input.policyDigest),
      principal_digest: digestReference('principal', input.principalRef),
      provider_digest: digestReference('provider', input.providerRef),
    }),
  })
}

function preparedBulk(commands: readonly FormanceMoneyCommand[]): PreparedManagedCallBulk {
  return Object.freeze({ kind: 'prepared', bulk: Object.freeze({ commands: Object.freeze([...commands]) }) })
}

function balanceAccount(
  kind: FormanceBalanceKind,
  subjectRef: string,
  generation: number | undefined,
): string {
  if (kind === 'account_aud') {
    return `accounts:${digestReference('account', subjectRef)}:available`
  }
  if (generation === undefined) throw new Error('formance_balance_generation_missing')
  return capacityAccount(kind, subjectRef, generation)
}

function capacityAccount(kind: FormanceCapacityKind, subjectRef: string, generation: number): string {
  const digest = digestReference(kind, { subjectRef, generation })
  if (kind === 'agent_budget') return `agents:${digest}:budget_available`
  if (kind === 'legal_customer_exposure') {
    return `legal_customers:${digest}:exposure_available`
  }
  return `treasury:corporate:${digest}:available`
}

function balanceAsset(kind: FormanceBalanceKind): 'AUD/6' | 'USDC/6' {
  return kind === 'treasury_usdc' ? 'USDC/6' : 'AUD/6'
}

function capacityAsset(kind: FormanceCapacityKind): 'AUD/6' | 'USDC/6' {
  return balanceAsset(kind)
}

function formanceReference(commandIdentity: unknown, suffix: string): string {
  return `ae-p4:${digestValue('transaction-reference', commandIdentity)}:${suffix}`
}

function digestReference(kind: string, reference: unknown): string {
  return digestValue('account-segment', { kind, reference })
}

export function formanceAccountMetadataDigest(accountRef: string): string | undefined {
  return boundedReference(accountRef) ? digestReference('account', accountRef) : undefined
}

function digestValue(kind: string, value: unknown): string {
  return stripDigest(canonicalDigest({ format: `ae.formance-${kind}:v1`, value }))
}

function stripDigest(value: string): string {
  return value.slice('sha256:'.length)
}

function boundedReference(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && BOUNDED_REFERENCE.test(value)
}

function positiveGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
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

function completed(reference: string, replayed: boolean): FormanceMoneyResult {
  return Object.freeze({ kind: 'completed', transactionRefs: Object.freeze([reference]), replayed })
}

function refused(code: string): Readonly<{ kind: 'refused'; code: string; retryable: false }> {
  return Object.freeze({ kind: 'refused', code, retryable: false })
}

function unavailable(code: string): FormanceMoneyResult {
  return Object.freeze({ kind: 'unavailable', code, submissionProvenAbsent: true })
}
