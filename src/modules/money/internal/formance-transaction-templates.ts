import { digestReference, digestValue, stripDigest } from './formance-digest'
import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/freshness'

import {
  canonicalFormanceUnits,
  formanceMonetaryVariable,
  LEGACY_FORMANCE_SCHEMA_VERSION,
  PERIOD_FORMANCE_SCHEMA_VERSION,
  PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
  type FormanceMoneyCommand,
  type FormanceMoneyBulkCommand,
} from '../formance'
import { PLAN_FORMANCE_SCHEMA_VERSION } from '../formance-schema'
import { refused } from '../formance-result'
import { spendingPeriodAdjustmentReference } from './spending-period-values'
import { MAX_PROMOTIONAL_GRANTS_PER_CALL, promotionalPurchasedAmounts, type PromotionalCreditAllocation } from '../promotional-credit-contracts'

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
  promotionalCreditAllocation?: PromotionalCreditAllocation
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

export type PlanHoldBooking = Readonly<{
  planRef: string
  planDigest: string
  idempotencyKey: string
  accountRef: string
  principalRef: string
  legalCustomerRef: string
  legalCustomerGeneration: number
  approvedTotalUnits: string
  spendingPeriods: FormanceManagedCallSpendingPeriods
}>

export type PlanNodeAllocation = PlanHoldBooking & Readonly<{
  nodeId: string
  callRef: string
  nodeCeilingUnits: string
  amountUnits: string
}>

export type PlanNodeSettlement = PlanNodeAllocation & Readonly<{
  buyerRevenueUnits: string
  buyerTaxUnits: string
  externalEvidenceDigest: string
}>

export type PlanNodeRelease = PlanNodeAllocation & Readonly<{
  externalEvidenceDigest: string
}> & (
  | Readonly<{ submissionProvenAbsent: true; authorizationProvenExpiredUnused?: never }>
  | Readonly<{ authorizationProvenExpiredUnused: true; submissionProvenAbsent?: never }>
)

export type PlanRelease = PlanHoldBooking & Readonly<{
  /** Exact balance read from this Plan's Formance Hold account. */
  holdBalanceUnits: string
  /** Caller-owned terminal gate: every Node Call is financially conclusive. */
  allNodeCallsFinanciallyConclusive: true
  terminalEvidenceDigest: string
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

export type FormanceManagedCallRelease = FormanceManagedCallFinalization & (
  | Readonly<{ submissionProvenAbsent: true; authorizationProvenExpiredUnused?: never }>
  | Readonly<{ authorizationProvenExpiredUnused: true; submissionProvenAbsent?: never }>
)

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

export type PreparedCommand =
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
      buyer_amount: amounts.purchased,
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
    ...promotionalCallCommands(input, 'reserve'),
  ])
}

export function preparePlanHold(input: PlanHoldBooking): PreparedManagedCallBulk {
  if (!validPlanHoldBooking(input)) return refused('formance_plan_hold_input_invalid')
  const amount = formanceMonetaryVariable('AUD', input.approvedTotalUnits)
  if (amount === undefined) return refused('formance_plan_hold_input_invalid')
  const legal = planLegalExposureAccounts(input.legalCustomerRef, input.legalCustomerGeneration)
  const periods = planSpendingPeriodAccounts(input.principalRef, input.spendingPeriods)
  return preparedBulk([
    planMoneyCommand(input, 'hold', 'PLAN_HOLD_RESERVED_AUD', {
      account_available: `accounts:${digestReference('account', input.accountRef)}:available`,
      plan_hold: planHoldAccountAddress(input),
      legal_available: legal.available,
      legal_reserved: legal.reserved,
      daily_available: periods.dailyAvailable,
      daily_reserved: periods.dailyReserved,
      monthly_available: periods.monthlyAvailable,
      monthly_reserved: periods.monthlyReserved,
      buyer_amount: amount,
      exposure_amount: amount,
      daily_amount: amount,
      monthly_amount: amount,
    }, input.planDigest),
  ])
}

export function preparePlanNodeAllocation(input: PlanNodeAllocation): PreparedManagedCallBulk {
  if (!validPlanNodeAllocation(input)) return refused('formance_plan_node_allocation_input_invalid')
  const amount = formanceMonetaryVariable('AUD', input.amountUnits)
  if (amount === undefined) return refused('formance_plan_node_allocation_input_invalid')
  return preparedBulk([
    planMoneyCommand(input, 'node-allocation', 'PLAN_NODE_ALLOCATED_AUD', {
      plan_hold: planHoldAccountAddress(input),
      call_reserved: `calls:${digestReference('call', input.callRef)}:buyer_reserved`,
      buyer_amount: amount,
    }, input.planDigest, input.nodeId),
  ])
}

export function preparePlanNodeSettlement(input: PlanNodeSettlement): PreparedManagedCallBulk {
  if (!validPlanNodeSettlement(input)) return refused('formance_plan_node_settlement_input_invalid')
  const revenue = formanceMonetaryVariable('AUD', input.buyerRevenueUnits)
  const tax = formanceMonetaryVariable('AUD', input.buyerTaxUnits, true)
  const amount = formanceMonetaryVariable('AUD', input.amountUnits)
  if (revenue === undefined || tax === undefined || amount === undefined) {
    return refused('formance_plan_node_settlement_input_invalid')
  }
  const legal = planLegalExposureAccounts(input.legalCustomerRef, input.legalCustomerGeneration)
  const periods = planSpendingPeriodAccounts(input.principalRef, input.spendingPeriods)
  return preparedBulk([
    planMoneyCommand(input, 'node-settlement', 'PLAN_NODE_SETTLED_AUD', {
      call_reserved: `calls:${digestReference('call', input.callRef)}:buyer_reserved`,
      revenue: 'platform:revenue:sales',
      tax: 'platform:tax:gst',
      legal_reserved: legal.reserved,
      legal_settled: legal.settled,
      daily_reserved: periods.dailyReserved,
      daily_spent: periods.dailySpent,
      monthly_reserved: periods.monthlyReserved,
      monthly_spent: periods.monthlySpent,
      revenue_amount: revenue,
      tax_amount: tax,
      exposure_amount: amount,
      daily_amount: amount,
      monthly_amount: amount,
    }, input.externalEvidenceDigest, input.nodeId),
  ])
}

export function preparePlanNodeRelease(input: PlanNodeRelease): PreparedManagedCallBulk {
  if (!validPlanNodeRelease(input)) return refused('formance_plan_node_release_input_invalid')
  const amount = formanceMonetaryVariable('AUD', input.amountUnits)
  if (amount === undefined) return refused('formance_plan_node_release_input_invalid')
  const legal = planLegalExposureAccounts(input.legalCustomerRef, input.legalCustomerGeneration)
  const periods = planSpendingPeriodAccounts(input.principalRef, input.spendingPeriods)
  return preparedBulk([
    planMoneyCommand(input, 'node-release', 'PLAN_NODE_RELEASED_AUD', {
      account_available: `accounts:${digestReference('account', input.accountRef)}:available`,
      call_reserved: `calls:${digestReference('call', input.callRef)}:buyer_reserved`,
      legal_available: legal.available,
      legal_reserved: legal.reserved,
      daily_available: periods.dailyAvailable,
      daily_reserved: periods.dailyReserved,
      monthly_available: periods.monthlyAvailable,
      monthly_reserved: periods.monthlyReserved,
      buyer_amount: amount,
      exposure_amount: amount,
      daily_amount: amount,
      monthly_amount: amount,
    }, input.externalEvidenceDigest, input.nodeId),
  ])
}

export function preparePlanRemainderRelease(input: PlanRelease): PreparedManagedCallBulk {
  if (!validPlanRelease(input)) return refused('formance_plan_release_input_invalid')
  const amount = formanceMonetaryVariable('AUD', input.holdBalanceUnits)
  if (amount === undefined) return refused('formance_plan_release_input_invalid')
  const legal = planLegalExposureAccounts(input.legalCustomerRef, input.legalCustomerGeneration)
  const periods = planSpendingPeriodAccounts(input.principalRef, input.spendingPeriods)
  return preparedBulk([
    planMoneyCommand(input, 'remainder-release', 'PLAN_REMAINDER_RELEASED_AUD', {
      account_available: `accounts:${digestReference('account', input.accountRef)}:available`,
      plan_hold: planHoldAccountAddress(input),
      legal_available: legal.available,
      legal_reserved: legal.reserved,
      daily_available: periods.dailyAvailable,
      daily_reserved: periods.dailyReserved,
      monthly_available: periods.monthlyAvailable,
      monthly_reserved: periods.monthlyReserved,
      buyer_amount: amount,
      exposure_amount: amount,
      daily_amount: amount,
      monthly_amount: amount,
    }, input.terminalEvidenceDigest),
  ])
}

export function prepareFormanceManagedCallRelease(
  input: FormanceManagedCallRelease,
): PreparedManagedCallBulk {
  const accounts = managedCallAccounts(input.booking)
  const amounts = managedCallAmounts(input.booking)
  if (accounts === undefined
    || amounts === undefined
    || (input.submissionProvenAbsent !== true && input.authorizationProvenExpiredUnused !== true)
    || !SHA256.test(input.externalEvidenceDigest)) {
    return refused('formance_managed_call_input_invalid')
  }
  return preparedBulk([
    managedCallCommand(input.booking, 'release-aud', 'CALL_RELEASED_AUD', {
      account_available: accounts.accountAvailable,
      call_reserved: accounts.callReserved,
      legal_available: accounts.legalAvailable,
      legal_reserved: accounts.legalReserved,
      buyer_amount: amounts.purchased,
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
    ...promotionalCallCommands(input.booking, 'release', input.externalEvidenceDigest),
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
      revenue_amount: amounts.purchasedRevenue,
      tax_amount: amounts.purchasedTax,
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
    ...promotionalCallCommands(input.booking, 'settle', input.externalEvidenceDigest),
  ])
}

/**
 * Paid service, no recoverable buyer result: return the buyer's reservation,
 * but consume treasury funds and settle the Provider obligation. The Provider
 * expense remains AE's expense; this must never reverse the onchain payment.
 * Requires independently verified payment before execution. Stable per-Call
 * references and an atomic bulk make retries and competing finalizations safe.
 */
export function prepareFormancePaidCallRemedy(
  input: FormanceManagedCallFinalization,
): PreparedManagedCallBulk {
  const accounts = managedCallAccounts(input.booking)
  const amounts = managedCallAmounts(input.booking)
  const settlement = prepareFormanceManagedCallSettlement(input)
  if (accounts === undefined || amounts === undefined || settlement.kind === 'refused') {
    return refused('formance_managed_call_input_invalid')
  }
  const provider = settlement.bulk.commands[1]
  if (provider === undefined) return refused('formance_managed_call_input_invalid')
  return preparedBulk([
    managedCallCommand(input.booking, 'release-aud', 'CALL_RELEASED_AUD', {
      account_available: accounts.accountAvailable,
      call_reserved: accounts.callReserved,
      legal_available: accounts.legalAvailable,
      legal_reserved: accounts.legalReserved,
      buyer_amount: amounts.purchased,
      exposure_amount: amounts.buyer,
      ...managedCallGenerationBudgetVariables(input.booking, accounts, amounts, 'release'),
      ...managedCallPeriodVariables(input.booking, accounts, amounts, 'release'),
    }, input.externalEvidenceDigest),
    provider,
    ...promotionalCallCommands(input.booking, 'release', input.externalEvidenceDigest),
  ])
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
      schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
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

export function prepareFundingCommand(
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
      schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
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

export function fundingSemantic(input: FormanceFundingBooking) {
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

export function capacitySemantic(input: FormanceCapacitySync) {
  if (!boundedReference(input.commandRef)
    || !boundedReference(input.idempotencyKey)
    || !boundedReference(input.subjectRef)
    || !positiveGeneration(input.generation)
    || !SHA256.test(input.policyDigest)
    || !SHA256.test(input.externalEvidenceDigest)
    || canonicalFormanceUnits(input.targetUnits) === undefined) return undefined
  return Object.freeze({ format: 'ae.formance-capacity-sync:v1', ...input })
}

export function validManagedCallSpendingPeriods(
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

export function validSpendingPeriod(
  principalRef: unknown,
  periodKind: FormanceSpendingPeriodKind,
  period: unknown,
): period is FormanceManagedCallSpendingPeriod {
  if (!boundedReference(principalRef)
    || typeof period !== 'object'
    || period === null) return false
  const candidate = period as Partial<FormanceManagedCallSpendingPeriod>
  if (typeof candidate.periodStartAt !== 'number'
    || typeof candidate.periodEndAt !== 'number'
    || !Number.isSafeInteger(candidate.periodStartAt)
    || !Number.isSafeInteger(candidate.periodEndAt)
    || !positiveGeneration(candidate.revision)
    || canonicalFormanceUnits(candidate.limitUnits ?? '', false) === undefined) return false
  return validUtcPeriod(periodKind, candidate.periodStartAt, candidate.periodEndAt)
}

export function validUtcPeriod(
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
  } catch (cause) {
    void cause;
    return false
  }
}

export function spendingPeriodIdentity(input: Readonly<{
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

export function spendingPeriodAccounts(input: FormanceManagedCallBooking): Readonly<{
  dailyAvailable?: string
  dailyReserved?: string
  dailySpent?: string
  monthlyAvailable?: string
  monthlyReserved?: string
  monthlySpent?: string
}> {
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

export function spendingPeriodAdjustmentSemantic(input: FormanceSpendingPeriodAdjustment) {
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

export function managedCallGenerationBudgetVariables(
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

export function managedCallPeriodVariables(
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

export function managedCallAccounts(input: FormanceManagedCallBooking) {
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

export function promotionalGrantAccount(accountRef: string, grantRef: string): string {
  return `accounts:${digestReference('account', accountRef)}:promo:${digestReference('promotional_grant', grantRef)}:available`
}

export function promotionalCallCommands(
  input: FormanceManagedCallBooking,
  stage: 'reserve' | 'release' | 'settle',
  externalEvidenceDigest = input.x402RequirementDigest,
): readonly FormanceMoneyCommand[] {
  const allocation = input.promotionalCreditAllocation
  if (allocation === undefined) return []
  const reserved = `calls:${digestReference('call', input.callRef)}:buyer_promo_reserved`
  return allocation.grants.map((grant) => {
    const grantAccount = promotionalGrantAccount(input.accountRef, grant.grantRef)
    const template = stage === 'reserve' ? 'CALL_PROMO_RESERVED'
      : stage === 'release' ? 'CALL_PROMO_RELEASED' : 'CALL_PROMO_SETTLED'
    const destination = stage === 'reserve' ? reserved
      : stage === 'release' ? grantAccount : 'platform:expense:marketing'
    const source = stage === 'reserve' ? grantAccount : reserved
    return managedCallCommand(input, `${stage}-promo`, template, {
      source, destination, amount: `AUD/6 ${grant.amountUnits}`,
    }, externalEvidenceDigest, grant.grantRef)
  })
}

export function managedCallAmounts(input: FormanceManagedCallBooking) {
  if (!managedCallSemantic(input)) return undefined
  const buyer = formanceMonetaryVariable('AUD', input.buyerAmountUnits)
  const revenue = formanceMonetaryVariable('AUD', input.buyerRevenueUnits)
  const tax = formanceMonetaryVariable('AUD', input.buyerTaxUnits, true)
  const provider = formanceMonetaryVariable('USDC', input.providerAmountUnits)
  const purchased = input.promotionalCreditAllocation?.purchasedUnits ?? input.buyerAmountUnits
  const apportioned = promotionalPurchasedAmounts(input.buyerAmountUnits, input.buyerTaxUnits, purchased)
  const purchasedAmount = formanceMonetaryVariable('AUD', purchased, true)
  const purchasedRevenue = apportioned === undefined ? undefined : formanceMonetaryVariable('AUD', apportioned.revenueUnits, true)
  const purchasedTax = apportioned === undefined ? undefined : formanceMonetaryVariable('AUD', apportioned.taxUnits, true)
  return buyer === undefined || revenue === undefined || tax === undefined || provider === undefined
    || purchasedAmount === undefined || purchasedRevenue === undefined || purchasedTax === undefined
    ? undefined
    : Object.freeze({ buyer, revenue, tax, provider,
      purchased: purchasedAmount, purchasedRevenue, purchasedTax })
}

/** Frozen split is checked before any command can be constructed. */
export function validPromotionalCreditAllocation(input: FormanceManagedCallBooking): boolean {
  const allocation = input.promotionalCreditAllocation
  if (allocation === undefined) return true
  if (allocation.version !== 'ae.promotional-credit-allocation:v1'
    || canonicalFormanceUnits(allocation.purchasedUnits, false) === undefined
    || !Array.isArray(allocation.grants)
    || allocation.grants.length > MAX_PROMOTIONAL_GRANTS_PER_CALL) return false
  let sum = BigInt(allocation.purchasedUnits)
  const seen = new Set<string>()
  for (const grant of allocation.grants) {
    if (!boundedReference(grant.grantRef)
      || seen.has(grant.grantRef)
      || canonicalFormanceUnits(grant.amountUnits) === undefined
      || !Number.isSafeInteger(grant.expiresAt)
      || grant.expiresAt <= 0) return false
    seen.add(grant.grantRef)
    sum += BigInt(grant.amountUnits)
  }
  return sum === BigInt(input.buyerAmountUnits)
}

export function managedCallSemantic(input: FormanceManagedCallBooking): boolean {
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
    && validPromotionalCreditAllocation(input)
    && (input.promotionalCreditAllocation === undefined || input.spendingPeriods !== undefined)
    && (input.spendingPeriods === undefined || validManagedCallSpendingPeriods(input))
}

export function managedCallCommand(
  input: FormanceManagedCallBooking,
  stage: string,
  template: FormanceMoneyCommand['template'],
  variables: Readonly<Record<string, string>>,
  externalEvidenceDigest = input.x402RequirementDigest,
  promotionalGrantRef?: string,
): FormanceMoneyCommand {
  const identity = { callRef: input.callRef, quoteRef: input.quoteRef, stage,
    ...(promotionalGrantRef === undefined ? {} : { promotionalGrantRef }),
  }
  const idempotencyDigest = digestValue('managed-call-idempotency', {
    idempotencyKey: input.idempotencyKey,
    ...identity,
  })
  return Object.freeze({
    commandRef: formanceReference(identity, stage.includes('-promo-') ? 'promo-call' : stage),
    idempotencyKey: idempotencyDigest,
    schemaVersion: input.promotionalCreditAllocation !== undefined
      ? PROMOTIONAL_FORMANCE_SCHEMA_VERSION
      : input.spendingPeriods === undefined
        ? LEGACY_FORMANCE_SCHEMA_VERSION
        : PERIOD_FORMANCE_SCHEMA_VERSION,
    template,
    variables: Object.freeze({ ...variables }),
    metadata: Object.freeze({
      account_digest: digestReference('account', input.accountRef),
      call_digest: digestReference('call', input.callRef),
      command_digest: digestValue('managed-call-command', {
        format: input.promotionalCreditAllocation !== undefined
          ? 'ae.formance-managed-call:v3'
          : input.spendingPeriods === undefined
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

function validPlanHoldBooking(input: PlanHoldBooking): boolean {
  return validPlanMoneyIdentity(input)
    && boundedReference(input.principalRef)
    && boundedReference(input.legalCustomerRef)
    && positiveGeneration(input.legalCustomerGeneration)
    && canonicalFormanceUnits(input.approvedTotalUnits) !== undefined
    && validPlanSpendingPeriods(input.principalRef, input.spendingPeriods)
}

function validPlanNodeAllocation(input: PlanNodeAllocation): boolean {
  return validPlanHoldBooking(input)
    && boundedReference(input.nodeId)
    && boundedReference(input.callRef)
    && canonicalFormanceUnits(input.nodeCeilingUnits) !== undefined
    && canonicalFormanceUnits(input.amountUnits) !== undefined
    && BigInt(input.amountUnits) <= BigInt(input.nodeCeilingUnits)
    && BigInt(input.amountUnits) <= BigInt(input.approvedTotalUnits)
}

function validPlanNodeSettlement(input: PlanNodeSettlement): boolean {
  return validPlanNodeAllocation(input)
    && SHA256.test(input.externalEvidenceDigest)
    && canonicalFormanceUnits(input.buyerRevenueUnits) !== undefined
    && canonicalFormanceUnits(input.buyerTaxUnits, false) !== undefined
    && BigInt(input.buyerRevenueUnits) + BigInt(input.buyerTaxUnits) === BigInt(input.amountUnits)
}

function validPlanNodeRelease(input: PlanNodeRelease): boolean {
  return validPlanNodeAllocation(input)
    && SHA256.test(input.externalEvidenceDigest)
    && (input.submissionProvenAbsent === true || input.authorizationProvenExpiredUnused === true)
}

function validPlanRelease(input: PlanRelease): boolean {
  return validPlanHoldBooking(input)
    && canonicalFormanceUnits(input.holdBalanceUnits) !== undefined
    && BigInt(input.holdBalanceUnits) <= BigInt(input.approvedTotalUnits)
    && input.allNodeCallsFinanciallyConclusive === true
    && SHA256.test(input.terminalEvidenceDigest)
}

function validPlanMoneyIdentity(input: Readonly<{
  planRef: string
  planDigest: string
  idempotencyKey: string
  accountRef: string
}>): boolean {
  return boundedReference(input.planRef)
    && SHA256.test(input.planDigest)
    && boundedReference(input.idempotencyKey)
    && boundedReference(input.accountRef)
}

function validPlanSpendingPeriods(
  principalRef: string,
  periods: FormanceManagedCallSpendingPeriods,
): boolean {
  return typeof periods === 'object'
    && periods !== null
    && periods.version === 'ae.spending-periods:v1'
    && validSpendingPeriod(principalRef, 'day', periods.daily)
    && validSpendingPeriod(principalRef, 'month', periods.monthly)
    && periods.daily.periodStartAt >= periods.monthly.periodStartAt
    && periods.daily.periodEndAt <= periods.monthly.periodEndAt
}

export function planHoldAccountAddress(input: Pick<PlanHoldBooking, 'planRef' | 'planDigest' | 'accountRef'>): string {
  const digest = digestReference('plan_hold', {
    planRef: input.planRef,
    planDigest: input.planDigest,
    accountRef: input.accountRef,
  })
  return `plans:${digest}:hold`
}

function planLegalExposureAccounts(legalCustomerRef: string, generation: number) {
  const digest = digestReference('legal_customer_exposure', {
    subjectRef: legalCustomerRef,
    generation,
  })
  return Object.freeze({
    available: `legal_customers:${digest}:exposure_available`,
    reserved: `legal_customers:${digest}:exposure_reserved`,
    settled: `legal_customers:${digest}:exposure_settled`,
  })
}

function planSpendingPeriodAccounts(
  principalRef: string,
  periods: FormanceManagedCallSpendingPeriods,
) {
  const daily = formanceSpendingPeriodAccount(principalRef, 'day', periods.daily.periodStartAt)
  const monthly = formanceSpendingPeriodAccount(principalRef, 'month', periods.monthly.periodStartAt)
  return Object.freeze({
    dailyAvailable: daily.available,
    dailyReserved: daily.reserved,
    dailySpent: daily.spent,
    monthlyAvailable: monthly.available,
    monthlyReserved: monthly.reserved,
    monthlySpent: monthly.spent,
  })
}

function planMoneyCommand(
  input: Readonly<{
    planRef: string
    planDigest: string
    idempotencyKey: string
    accountRef: string
  }>,
  stage: 'hold' | 'node-allocation' | 'node-settlement' | 'node-release' | 'remainder-release',
  template: FormanceMoneyCommand['template'],
  variables: Readonly<Record<string, string>>,
  evidenceDigest: string,
  nodeId?: string,
): FormanceMoneyCommand {
  const identity = {
    planDigest: stripDigest(input.planDigest),
    planRef: input.planRef,
    stage,
    ...(nodeId === undefined ? {} : { nodeId }),
  }
  const idempotencyDigest = digestValue('plan-money-idempotency', {
    idempotencyKey: input.idempotencyKey,
    ...identity,
  })
  return Object.freeze({
    commandRef: formanceReference(identity, stage),
    idempotencyKey: idempotencyDigest,
    schemaVersion: PLAN_FORMANCE_SCHEMA_VERSION,
    template,
    variables: Object.freeze({ ...variables }),
    metadata: Object.freeze({
      account_digest: digestReference('account', input.accountRef),
      command_digest: digestValue('plan-money-command', {
        format: 'ae.formance-plan-money:v1',
        input,
        stage,
        template,
        evidenceDigest,
      }),
      commitment_digest: stripDigest(input.planDigest),
      external_evidence_digest: stripDigest(evidenceDigest),
      idempotency_digest: idempotencyDigest,
      operation_digest: digestReference('plan', input.planRef),
    }),
  })
}

export function preparedBulk(commands: readonly FormanceMoneyCommand[]): PreparedManagedCallBulk {
  return Object.freeze({ kind: 'prepared', bulk: Object.freeze({ commands: Object.freeze([...commands]) }) })
}

export function balanceAccount(
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

export function capacityAccount(kind: FormanceCapacityKind, subjectRef: string, generation: number): string {
  const digest = digestReference(kind, { subjectRef, generation })
  if (kind === 'agent_budget') return `agents:${digest}:budget_available`
  if (kind === 'legal_customer_exposure') {
    return `legal_customers:${digest}:exposure_available`
  }
  return `treasury:corporate:${digest}:available`
}

export function balanceAsset(kind: FormanceBalanceKind): 'AUD/6' | 'USDC/6' {
  return kind === 'treasury_usdc' ? 'USDC/6' : 'AUD/6'
}

export function capacityAsset(kind: FormanceCapacityKind): 'AUD/6' | 'USDC/6' {
  return balanceAsset(kind)
}

export function formanceReference(commandIdentity: unknown, suffix: string): string {
  return `ae-p4:${digestValue('transaction-reference', commandIdentity)}:${suffix}`
}

export function formanceAccountMetadataDigest(accountRef: string): string | undefined {
  return boundedReference(accountRef) ? digestReference('account', accountRef) : undefined
}

export function boundedReference(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && BOUNDED_REFERENCE.test(value)
}

export function positiveGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function prepareFormanceCapacitySync(input: FormanceCapacitySync): PreparedCommand {
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
  return Object.freeze({
    kind: 'prepared',
    command: Object.freeze({
      commandRef: reference,
      idempotencyKey: idempotencyDigest,
      schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
      template: 'TREASURY_CAPACITY_SYNCED',
      variables: {
        capacity: account,
        amount,
      },
      metadata,
    }),
  })
}

export function prepareFormanceSpendingPeriodAdjustment(
  input: FormanceSpendingPeriodAdjustment,
): PreparedCommand {
  const semantic = spendingPeriodAdjustmentSemantic(input)
  if (semantic === undefined) return refused('formance_spending_period_adjustment_input_invalid')
  const delta = BigInt(input.targetLimitUnits) - BigInt(input.previousLimitUnits)
  if (delta === 0n) return refused('formance_spending_period_adjustment_input_invalid')
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
  return Object.freeze({
    kind: 'prepared',
    command: Object.freeze({
      commandRef: spendingPeriodAdjustmentReference(input),
      idempotencyKey: idempotencyDigest,
      schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
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
    }),
  })
}

export function expectedProviderSettlementCommand(
  input: FormanceProviderReversal,
): FormanceMoneyCommand | undefined {
  if (!SHA256.test(input.correctionEvidenceDigest)) return undefined
  const accounts = managedCallAccounts(input.booking)
  const amounts = managedCallAmounts(input.booking)
  if (accounts === undefined || amounts === undefined) return undefined
  return managedCallCommand(
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
}

export function prepareFormanceProviderReversal(input: FormanceProviderReversal): PreparedCommand {
  if (!SHA256.test(input.correctionEvidenceDigest)) {
    return refused('formance_provider_reversal_input_invalid')
  }
  const accounts = managedCallAccounts(input.booking)
  const amounts = managedCallAmounts(input.booking)
  if (accounts === undefined || amounts === undefined) {
    return refused('formance_provider_reversal_input_invalid')
  }
  const expected = expectedProviderSettlementCommand(input)
  if (expected === undefined) return refused('formance_provider_reversal_input_invalid')
  if (expected.commandRef !== input.originalSettlementRef) {
    return refused('formance_provider_settlement_reference_invalid')
  }
  return Object.freeze({
    kind: 'prepared',
    command: managedCallCommand(
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
    ),
  })
}
