import type {
  ChargeAuthorizationResult,
  ExactAmount,
  MoneyAccount,
  MoneyLedgerEntry,
  MoneyRefusal,
  MoneyTransaction,
  MoneyUsageEvent,
  RakeSplit,
} from '../../public'
import { validateChargeContract } from '../charge-contract'
import { compareExactAmounts, rescaleExactAmount } from '../exact-amount'
import { validatePaymentBinding, type PaymentBinding } from '../payment-binding'
import { computeProviderFeeBreakdown, computeRakeSplit } from '../pricing-config'
import {
  appendUsage,
  applyProviderAccountCredit,
  beginFromPrior,
  createEntry,
  createUsage,
  paidChargeContractInput,
  refusalResult,
  transactionFrom,
  updateBalance,
  validAmount,
  validateChargeAccounts,
  withChanges,
  zeroAmountLike,
} from './shared'
import type {
  ChargePlan,
  LedgerOperationResult,
  LedgerState,
  PaidChargeInput,
  PlanPaidChargeInput,
} from './types'

type PreparedCharge = Readonly<{
  operator: MoneyAccount
  provider: MoneyAccount
  rake: MoneyAccount
  grossAmount: ExactAmount
  begun: ReturnType<typeof beginFromPrior>
  hasProviderAmount: boolean
  hasPlatformFee: boolean
}>

type PrepareChargeResult =
  | Readonly<{ kind: 'prepared'; value: PreparedCharge }>
  | Readonly<{ kind: 'refused'; refusal: MoneyRefusal }>

export function planPaidCharge(input: PlanPaidChargeInput): ChargePlan {
  const preparedResult = prepareCharge(input)
  if (preparedResult.kind === 'refused') return refusedChargePlan(preparedResult.refusal)
  const prepared = preparedResult.value
  const explicitSplit = resolveExplicitSplit(input, prepared)
  if (explicitSplit.kind === 'refused') return refusedChargePlan(explicitSplit.refusal)
  const freeTier = freeTierPlan(input, prepared.grossAmount)
  if (freeTier !== undefined) return freeTier
  const splitResult = resolveChargeSplit(input, prepared.grossAmount, explicitSplit.split)
  if (splitResult.kind === 'refused') return refusedChargePlan(splitResult.refusal)
  if (prepared.begun.kind === 'replay') {
    return replayChargePlan(input, prepared.begun.transaction, splitResult.split, prepared)
  }
  return newPaidChargePlan(input, prepared, splitResult.split)
}

function prepareCharge(input: PlanPaidChargeInput): PrepareChargeResult {
  const basicRefusal = basicChargeRefusal(input)
  if (basicRefusal !== undefined) return { kind: 'refused', refusal: basicRefusal }
  const bindingRefusal = paymentBindingRefusal(input)
  if (bindingRefusal !== undefined) return { kind: 'refused', refusal: bindingRefusal }
  const accountRefusal = chargeAccountRefusal(input)
  if (accountRefusal !== undefined) return { kind: 'refused', refusal: accountRefusal }
  const { operator, provider, rake } = input
  if (operator === undefined || provider === undefined || rake === undefined) {
    return { kind: 'refused', refusal: refusalResult('billing_identity_missing', false) }
  }
  const grossAmount = rescaleExactAmount(input.grossAmount, operator.balance.exponent)
  if (grossAmount === undefined || !chargeScalesMatch(input, operator, provider, rake)) {
    return { kind: 'refused', refusal: refusalResult('currency_mismatch', false) }
  }
  const begun = beginFromPrior(input.priorTransaction, input.transaction)
  if (begun.kind === 'refused') return { kind: 'refused', refusal: begun.refusal }
  return {
    kind: 'prepared',
    value: {
      operator, provider, rake, grossAmount, begun,
      hasProviderAmount: input.providerAmount !== undefined,
      hasPlatformFee: input.platformFee !== undefined,
    },
  }
}

function basicChargeRefusal(input: PlanPaidChargeInput): MoneyRefusal | undefined {
  if (input.principalId !== input.transaction.principalId) return refusalResult('billing_identity_mismatch', false)
  if (!validAmount(input.grossAmount)) return refusalResult('rake_not_configured', false)
  const providerPresent = input.providerAmount !== undefined
  const feePresent = input.platformFee !== undefined
  if (providerPresent !== feePresent) return refusalResult('rake_not_configured', false)
  if (input.providerAmount !== undefined && !validAmount(input.providerAmount)) return refusalResult('rake_not_configured', false)
  if (input.platformFee !== undefined && !validAmount(input.platformFee)) return refusalResult('rake_not_configured', false)
}

function paymentBindingRefusal(input: PlanPaidChargeInput): MoneyRefusal | undefined {
  if (input.paymentBinding === undefined) return undefined
  const requestedBinding: PaymentBinding = {
    ...input.paymentBinding.requested,
    amount: input.grossAmount,
    providerRef: input.providerAccountRef,
    idempotencyKey: input.transaction.idempotencyKey,
    ...(input.actionVersion === undefined ? {} : { actionVersion: input.actionVersion }),
  }
  const binding = validatePaymentBinding({
    approved: input.paymentBinding.approved,
    requested: requestedBinding,
    now: input.observedAt,
  })
  return binding.kind === 'refused' ? binding : undefined
}

function chargeAccountRefusal(input: PlanPaidChargeInput): MoneyRefusal | undefined {
  return validateChargeAccounts({
    operator: input.operator, provider: input.provider, rake: input.rake,
    operatorAccountRef: input.operatorAccountRef,
    providerAccountRef: input.providerAccountRef,
    rakeAccountRef: input.rakeAccountRef,
    accountId: input.accountId,
    businessId: input.businessId,
    currency: input.transaction.currency,
  })
}

function chargeScalesMatch(
  input: PlanPaidChargeInput,
  operator: MoneyAccount,
  provider: MoneyAccount,
  rake: MoneyAccount,
): boolean {
  return input.grossAmount.currency === input.transaction.currency
    && provider.balance.exponent === operator.balance.exponent
    && rake.balance.exponent === operator.balance.exponent
}

function resolveExplicitSplit(
  input: PlanPaidChargeInput,
  prepared: PreparedCharge,
): Readonly<{ kind: 'resolved'; split?: RakeSplit }> | Readonly<{ kind: 'refused'; refusal: MoneyRefusal }> {
  if (!prepared.hasProviderAmount && !prepared.hasPlatformFee) return { kind: 'resolved' }
  if (input.providerAmount === undefined || input.platformFee === undefined || input.rakeConfig.rakeBps !== 1_000) {
    return splitRefusal('rake_not_configured')
  }
  const breakdown = computeProviderFeeBreakdown(input.providerAmount)
  if ('kind' in breakdown || !explicitSplitMatchesInput(
    { ...input, providerAmount: input.providerAmount, platformFee: input.platformFee },
    breakdown.totalAmount,
    breakdown.platformFee,
  )) {
    return splitRefusal('rake_not_configured')
  }
  const providerAmount = rescaleExactAmount(input.providerAmount, prepared.operator.balance.exponent)
  const platformFee = rescaleExactAmount(input.platformFee, prepared.operator.balance.exponent)
  if (providerAmount === undefined || platformFee === undefined) return splitRefusal('currency_mismatch')
  return {
    kind: 'resolved',
    split: { grossAmount: prepared.grossAmount, rakeBps: 1_000, rake: platformFee, providerNet: providerAmount },
  }
}

function explicitSplitMatchesInput(
  input: PlanPaidChargeInput & Readonly<{ providerAmount: ExactAmount; platformFee: ExactAmount }>,
  totalAmount: ExactAmount,
  platformFee: ExactAmount,
): boolean {
  return amountsUseGrossScale(input.providerAmount, input.grossAmount)
    && amountsUseGrossScale(input.platformFee, input.grossAmount)
    && compareExactAmounts(totalAmount, input.grossAmount) === 0
    && compareExactAmounts(platformFee, input.platformFee) === 0
}

function amountsUseGrossScale(amount: ExactAmount, gross: ExactAmount): boolean {
  return amount.currency === gross.currency && amount.exponent === gross.exponent
}

function splitRefusal(code: MoneyRefusal['code']): Readonly<{ kind: 'refused'; refusal: MoneyRefusal }> {
  return { kind: 'refused', refusal: refusalResult(code, false) }
}

function freeTierPlan(input: PlanPaidChargeInput, grossAmount: ExactAmount): ChargePlan | undefined {
  if (input.freeTier !== true && grossAmount.units !== '0') return undefined
  const priorUsage = input.priorUsage
  if (priorUsage !== undefined) {
    return freeTierReplayMatches(priorUsage, grossAmount, input.priceDigest)
      ? acceptedChargePlan(freeTierAccepted(priorUsage))
      : refusedChargePlan(refusalResult('charge_reconciliation_required', false))
  }
  const usage = createUsage(input, 'free_tier', zeroAmountLike(grossAmount))
  return acceptedChargePlan(freeTierAccepted(usage), { usage })
}

function freeTierReplayMatches(usage: MoneyUsageEvent, grossAmount: ExactAmount, priceDigest: string): boolean {
  return usage.chargeState === 'free_tier'
    && compareExactAmounts(usage.amount, zeroAmountLike(grossAmount)) === 0
    && usage.priceDigest === priceDigest
}

function freeTierAccepted(usage: MoneyUsageEvent): ChargeAuthorizationResult {
  return {
    kind: 'accepted', chargeState: 'free_tier', amount: usage.amount,
    priceDigest: usage.priceDigest, usageRef: usage.usageRef, observedAt: usage.observedAt,
    ...(usage.transactionRef === undefined ? {} : { transactionRef: usage.transactionRef }),
  }
}

function resolveChargeSplit(
  input: PlanPaidChargeInput,
  grossAmount: ExactAmount,
  explicit: RakeSplit | undefined,
): Readonly<{ kind: 'resolved'; split: RakeSplit }> | Readonly<{ kind: 'refused'; refusal: MoneyRefusal }> {
  if (explicit !== undefined) return { kind: 'resolved', split: explicit }
  const configured = computeRakeSplit(grossAmount, input.rakeConfig)
  return 'kind' in configured
    ? splitRefusal(configured.code)
    : { kind: 'resolved', split: configured }
}

function replayChargePlan(
  input: PlanPaidChargeInput,
  transaction: MoneyTransaction,
  split: RakeSplit,
  prepared: PreparedCharge,
): ChargePlan {
  const usage = input.priorUsage
  if (usage === undefined || !replayUsageMatches(input, transaction, usage, prepared.grossAmount)) {
    return refusedChargePlan(refusalResult('charge_reconciliation_required', false))
  }
  const contract = validateChargeContract(paidChargeContractInput({
    transaction,
    usage,
    entries: input.priorEntries ?? [],
    operatorAccountRef: input.operatorAccountRef,
    providerAccountRef: input.providerAccountRef,
    rakeAccountRef: input.rakeAccountRef,
  }))
  if (contract === undefined || !replaySplitMatches(input, contract.providerAmount, contract.rakeAmount, split)) {
    return refusedChargePlan(refusalResult('charge_reconciliation_required', false))
  }
  return acceptedChargePlan({
    kind: 'accepted', chargeState: 'paid', amount: usage.amount, priceDigest: usage.priceDigest,
    usageRef: usage.usageRef, observedAt: usage.observedAt,
    ...(usage.transactionRef === undefined ? {} : { transactionRef: usage.transactionRef }),
    providerNet: contract.providerAmount, rake: contract.rakeAmount,
  })
}

function replayUsageMatches(
  input: PlanPaidChargeInput,
  transaction: MoneyTransaction,
  usage: MoneyUsageEvent,
  grossAmount: ExactAmount,
): boolean {
  return replayAccountingMatches(input, transaction, usage, grossAmount)
    && replayIdentityMatches(input, usage)
}

function replayAccountingMatches(
  input: PlanPaidChargeInput,
  transaction: MoneyTransaction,
  usage: MoneyUsageEvent,
  grossAmount: ExactAmount,
): boolean {
  return usage.chargeState === 'paid'
    && usage.accountId === input.accountId
    && compareExactAmounts(usage.amount, grossAmount) === 0
    && usage.priceDigest === input.priceDigest
    && usage.transactionRef === transaction.transactionRef
    && transaction.accountId === input.accountId
    && transaction.currency === input.transaction.currency
    && transaction.exponent === usage.amount.exponent
}

function replayIdentityMatches(input: PlanPaidChargeInput, usage: MoneyUsageEvent): boolean {
  return usage.serviceRef === input.serviceRef
    && usage.offeringRef === input.offeringRef
    && usage.operationKey === input.operationKey
    && usage.businessId === input.businessId
}

function replaySplitMatches(
  input: PlanPaidChargeInput,
  providerAmount: ExactAmount,
  rakeAmount: ExactAmount,
  split: RakeSplit,
): boolean {
  return (input.providerAmount === undefined || compareExactAmounts(providerAmount, split.providerNet) === 0)
    && (input.platformFee === undefined || compareExactAmounts(rakeAmount, split.rake) === 0)
}

function newPaidChargePlan(input: PlanPaidChargeInput, prepared: PreparedCharge, split: RakeSplit): ChargePlan {
  if (input.priorUsage !== undefined) return refusedChargePlan(refusalResult('charge_reconciliation_required', false))
  const creditRefusal = operatorCreditRefusal(prepared.operator, prepared.grossAmount)
  if (creditRefusal !== undefined) {
    const usage = createUsage(input, 'insufficient_credit', prepared.grossAmount)
    return refusedChargePlan(creditRefusal, usage)
  }
  if (input.transaction.expectedAccountVersion !== prepared.operator.version) {
    return refusedChargePlan(refusalResult('ledger_cas_conflict', true))
  }
  return appliedPaidChargePlan(input, prepared, split)
}

function operatorCreditRefusal(operator: MoneyAccount, grossAmount: ExactAmount): MoneyRefusal | undefined {
  if (operator.state === 'active' && compareExactAmounts(operator.balance, grossAmount) !== -1) return undefined
  return refusalResult('insufficient_credit', false, {
    requiredAmount: grossAmount,
    availableAmount: operator.balance,
    nextAction: 'credit_topup_required',
  })
}

function appliedPaidChargePlan(input: PlanPaidChargeInput, prepared: PreparedCharge, split: RakeSplit): ChargePlan {
  const transaction = transactionFrom(
    { ...input.transaction, accountId: input.accountId, now: input.observedAt },
    'charge', 'applied', prepared.grossAmount.exponent,
  )
  const providerCredit = applyProviderAccountCredit(prepared.provider, split.providerNet, input.observedAt)
  if (providerCredit === undefined) return refusedChargePlan(refusalResult('charge_reconciliation_required', false))
  const entries = chargeEntries(input, transaction, prepared, split, providerCredit.recoveryPayment)
  const usage = createUsage(input, 'paid', prepared.grossAmount, transaction.transactionRef)
  return acceptedChargePlan({
    kind: 'accepted', chargeState: 'paid', amount: usage.amount, priceDigest: usage.priceDigest,
    usageRef: usage.usageRef, observedAt: usage.observedAt, transactionRef: transaction.transactionRef,
    providerNet: split.providerNet, rake: split.rake,
  }, {
    usage, transaction, entries,
    accounts: {
      operator: updateBalance(prepared.operator, prepared.grossAmount, 'debit', input.observedAt),
      provider: providerCredit.account,
      rake: updateBalance(prepared.rake, split.rake, 'credit', input.observedAt),
    },
  })
}

function chargeEntries(
  input: PlanPaidChargeInput,
  transaction: MoneyTransaction,
  prepared: PreparedCharge,
  split: RakeSplit,
  recoveryPayment: ExactAmount,
): readonly MoneyLedgerEntry[] {
  const common = { transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey,
    sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt }
  return [
    createEntry({ ...common, entryRef: `${transaction.transactionRef}:charge`, accountRef: prepared.operator.accountRef,
      entryType: 'charge', direction: 'debit', amount: prepared.grossAmount, principalId: input.principalId,
      invocationRef: input.invocationRef, attemptRef: input.attemptRef }),
    createEntry({ ...common, entryRef: `${transaction.transactionRef}:provider`, accountRef: prepared.provider.accountRef,
      entryType: 'payout_accrual', direction: 'credit', amount: split.providerNet, businessId: input.businessId,
      invocationRef: input.invocationRef, attemptRef: input.attemptRef }),
    createEntry({ ...common, entryRef: `${transaction.transactionRef}:rake`, accountRef: prepared.rake.accountRef,
      entryType: 'rake', direction: 'credit', amount: split.rake, businessId: input.businessId }),
    ...recoveryEntry(input, transaction, prepared.provider, recoveryPayment),
  ]
}

function recoveryEntry(
  input: PlanPaidChargeInput,
  transaction: MoneyTransaction,
  provider: MoneyAccount,
  recoveryPayment: ExactAmount,
): readonly MoneyLedgerEntry[] {
  if (recoveryPayment.units === '0') return []
  return [createEntry({ entryRef: `${transaction.transactionRef}:provider-recovery`,
    accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'debit', amount: recoveryPayment,
    transactionRef: transaction.transactionRef, idempotencyKey: transaction.idempotencyKey,
    businessId: input.businessId, invocationRef: input.invocationRef, attemptRef: input.attemptRef,
    sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs, createdAt: transaction.createdAt })]
}

function refusedChargePlan(result: MoneyRefusal, usage?: MoneyUsageEvent): ChargePlan {
  return { result, entries: [], ...(usage === undefined ? {} : { usage }) }
}

function acceptedChargePlan(
  result: ChargeAuthorizationResult,
  extra: Omit<ChargePlan, 'result' | 'entries'> & Readonly<{ entries?: readonly MoneyLedgerEntry[] }> = {},
): ChargePlan {
  const { entries, ...rest } = extra
  return { result, entries: entries ?? [], ...rest }
}

export function applyChargePlan(state: LedgerState, plan: ChargePlan): LedgerOperationResult<ChargeAuthorizationResult> {
  if (plan.result.kind === 'refused' || plan.result.chargeState === 'free_tier') {
    return { state: plan.usage === undefined ? state : appendUsage(state, plan.usage), result: plan.result }
  }
  if (plan.transaction === undefined || plan.accounts === undefined) return { state, result: plan.result }
  return {
    state: withChanges(state, plan.accounts.operator, plan.entries, plan.transaction,
      [plan.accounts.provider, plan.accounts.rake], plan.usage),
    result: plan.result,
  }
}

export function authorizePaidCharge(
  input: PaidChargeInput & Readonly<{ state: LedgerState }>,
): LedgerOperationResult<ChargeAuthorizationResult> {
  const priorTransaction = input.state.transactions.find((transaction) =>
    transaction.idempotencyKey === input.transaction.idempotencyKey)
  const usageRef = `${input.invocationRef}:${input.attemptRef}:${input.operationKey}`
  const priorUsage = input.state.usageEvents.find((usage) => usage.usageRef === usageRef)
  const priorEntries = priorTransaction === undefined
    ? []
    : input.state.entries.filter((entry) => entry.transactionRef === priorTransaction.transactionRef)
  return applyChargePlan(input.state, planPaidCharge({
    ...input,
    ...optionalAccount('operator', input.state.accounts.get(input.operatorAccountRef)),
    ...optionalAccount('provider', input.state.accounts.get(input.providerAccountRef)),
    ...optionalAccount('rake', input.state.accounts.get(input.rakeAccountRef)),
    ...(priorTransaction === undefined ? {} : { priorTransaction }),
    ...(priorUsage === undefined ? {} : { priorUsage }),
    priorEntries,
  }))
}

function optionalAccount<Key extends 'operator' | 'provider' | 'rake'>(key: Key, account: MoneyAccount | undefined) {
  return account === undefined ? {} : { [key]: account } as Record<Key, MoneyAccount>
}
