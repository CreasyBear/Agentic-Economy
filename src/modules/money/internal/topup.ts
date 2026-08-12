import { isMoneyRefusal, type ExactAmount, type MoneyAcceptedCharge, type MoneyRefusal } from '../public'
import { addExactAmounts, compareExactAmounts, exactAmountSchema, multiplyExactAmountByBps, rescaleExactAmount } from './exact-amount'
import type { CreditPaymentEvidence, CreditPaymentPort } from './ports'
import type { StripeMoneyWebhookEvent } from './stripe-webhook'
import { applyTopup, type BeginTransactionInput, type LedgerState } from './ledger'
export const STRIPE_CREDIT_RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1_000

export type CreditTopupFinancials = Readonly<{
  amount: ExactAmount
  processingFee: ExactAmount
  chargeAmount: ExactAmount
}>

export function productionCreditTopupConfig(): CreditTopupConfig {
  return {
    minimumByCurrency: { USD: { currency: 'USD', units: '500', exponent: 2 } },
    maximumByCurrency: { USD: { currency: 'USD', units: '2500000', exponent: 2 } },
    topupFeeBps: 500,
  }
}

export function calculateCreditTopupFinancials(input: Readonly<{
  amount: ExactAmount
  accountCurrency: string
  accountExponent: number
  config: CreditTopupConfig
}>): CreditTopupFinancials | undefined {
  if (input.amount.currency !== input.accountCurrency) return undefined
  const amount = rescaleExactAmount(input.amount, input.accountExponent)
  if (amount === undefined) return undefined
  const minimum = input.config.minimumByCurrency[amount.currency]
  const maximum = input.config.maximumByCurrency[amount.currency]
  const feeBps = input.config.topupFeeBps ?? 500
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > 10_000 || !validAmount(amount) || minimum === undefined || maximum === undefined) return undefined
  const processingFee = multiplyExactAmountByBps(amount, feeBps, 'ceil')
  const chargeAmount = processingFee === undefined ? undefined : addExactAmounts(amount, processingFee)
  if (processingFee === undefined || chargeAmount === undefined) return undefined
  const minimumComparison = compareExactAmounts(amount, minimum)
  const maximumComparison = compareExactAmounts(amount, maximum)
  if (minimumComparison === undefined || maximumComparison === undefined || minimumComparison === -1 || maximumComparison === 1) return undefined
  return { amount, processingFee, chargeAmount }
}

export type CreditTopupConfig = Readonly<{
  minimumByCurrency: Readonly<Record<string, ExactAmount>>
  maximumByCurrency: Readonly<Record<string, ExactAmount>>
  topupFeeBps?: number
}>

export type AutoRechargeSettings = Readonly<{
  enabled: boolean
  threshold: ExactAmount
  rechargeAmount: ExactAmount
}>
export type CreditTopupCommand = Readonly<{
  commandRef: string
  principalId: string
  accountRef: string
  amount: ExactAmount
  processingFee: ExactAmount
  chargeAmount: ExactAmount
  idempotencyKey: string
  inputDigest: string
  providerRecoveryDeadlineAt: number
  state: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown'
  externalRef?: string
  buyerBalanceBefore?: ExactAmount
  buyerBalanceAfter?: ExactAmount
  appliedStripeEventId?: string
  appliedPayloadDigest?: string
  appliedTransactionRef?: string
  createdAt: number
  updatedAt: number
}>

export type TopupState = Readonly<{
  commands: readonly CreditTopupCommand[]
  autoRecharge: ReadonlyMap<string, AutoRechargeSettings>
}>

export type BeginTopupResult = Readonly<{
  state: TopupState
  ledgerState: LedgerState
  result: CreditTopupCommand | MoneyRefusal
  provider?: CreditPaymentEvidence
}>

export function createTopupState(): TopupState {
  return { commands: [], autoRecharge: new Map() }
}

export async function beginCreditTopup(input: Readonly<{
  state: TopupState
  ledgerState: LedgerState
  principalId: string
  accountRef: string
  amount: ExactAmount
  idempotencyKey: string
  inputDigest: string
  commandRef: string
  successReturnRef: string
  now: number
  config: CreditTopupConfig
  port: CreditPaymentPort
}>): Promise<BeginTopupResult> {
  const account = input.ledgerState.accounts.get(input.accountRef)
  if (
    account === undefined
    || account.accountKind !== 'operator_credit'
    || account.principalId !== input.principalId
    || account.balance.currency !== input.amount.currency
  ) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('billing_identity_missing', false) }
  }
  const financials = calculateCreditTopupFinancials({
    amount: input.amount,
    accountCurrency: account.balance.currency,
    accountExponent: account.balance.exponent,
    config: input.config,
  })
  if (financials === undefined) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_amount_invalid', false) }
  }
  const { amount, processingFee, chargeAmount } = financials
  const prior = input.state.commands.find((command) => command.idempotencyKey === input.idempotencyKey)
  if (prior !== undefined && (
    prior.inputDigest !== input.inputDigest
    || prior.principalId !== input.principalId
    || prior.accountRef !== input.accountRef
    || compareExactAmounts(prior.amount, amount) !== 0
  )) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('ledger_idempotency_conflict', false) }
  }
  const command = prior ?? {
    commandRef: input.commandRef,
    principalId: input.principalId,
    accountRef: input.accountRef,
    amount,
    processingFee,
    chargeAmount,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    providerRecoveryDeadlineAt: input.now + STRIPE_CREDIT_RECOVERY_WINDOW_MS,
    state: 'pending' as const,
    createdAt: input.now,
    updatedAt: input.now,
  }
  const reservedState = prior === undefined
    ? { ...input.state, commands: [...input.state.commands, command] }
    : input.state
  if (command.externalRef === undefined && input.now >= command.providerRecoveryDeadlineAt) {
    return { state: reservedState, ledgerState: input.ledgerState, result: refusal('credit_topup_outcome_unknown', true) }
  }
  const providerResult = await input.port.createOrRecoverCreditPayment({
    commandRef: command.commandRef,
    principalId: command.principalId,
    accountRef: command.accountRef,
    amount: command.chargeAmount,
    idempotencyKey: command.idempotencyKey,
    inputDigest: command.inputDigest,
    successReturnRef: input.successReturnRef,
    providerRecoveryDeadlineAt: command.providerRecoveryDeadlineAt,
    ...(command.externalRef === undefined ? {} : { boundExternalRef: command.externalRef }),
  })
  if (isMoneyRefusal(providerResult)) return { state: reservedState, ledgerState: input.ledgerState, result: providerResult }
  const evidence = providerResult.evidence
  if (compareExactAmounts(evidence.amount, chargeAmount) !== 0) {
    const unknown = { ...command, state: 'outcome_unknown' as const, updatedAt: input.now }
    return {
      state: { ...reservedState, commands: reservedState.commands.map((item) => item.commandRef === command.commandRef ? unknown : item) },
      ledgerState: input.ledgerState,
      result: refusal('credit_topup_outcome_unknown', true),
    }
  }
  const updated = {
    ...command,
    state: evidence.status === 'outcome_unknown' ? 'outcome_unknown' as const : evidence.status === 'failed' ? 'failed' as const : command.state,
    externalRef: evidence.externalRef,
    updatedAt: input.now,
  }
  return {
    state: { ...reservedState, commands: reservedState.commands.map((item) => item.commandRef === command.commandRef ? updated : item) },
    ledgerState: input.ledgerState,
    result: updated,
    provider: evidence,
  }
}

export function applyCreditTopup(input: Readonly<{
  state: TopupState
  ledgerState: LedgerState
  commandRef: string
  event: StripeMoneyWebhookEvent
  transaction: BeginTransactionInput
  sourceDigest: string
  evidenceRefs: readonly string[]
}>): Readonly<{ state: TopupState; ledgerState: LedgerState; result: MoneyAcceptedCharge | MoneyRefusal }> {
  if (input.event.kind !== 'checkout' || input.event.status !== 'paid' || input.event.commandRef !== input.commandRef || input.event.externalRef !== input.event.sessionId) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_pending', true) }
  }
  const command = input.state.commands.find((item) => item.commandRef === input.commandRef)
  if (command === undefined || compareExactAmounts(command.chargeAmount, input.event.amount) !== 0 || (command.externalRef !== undefined && command.externalRef !== input.event.externalRef) || input.transaction.principalId !== command.principalId || input.transaction.currency !== command.amount.currency || input.transaction.kind !== 'topup' || input.transaction.inputDigest !== command.inputDigest) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_pending', true) }
  }
  if (command.state === 'succeeded') {
    if (command.appliedStripeEventId !== input.event.stripeEventId || command.appliedPayloadDigest !== input.event.payloadDigest) return { state: input.state, ledgerState: input.ledgerState, result: refusal('ledger_idempotency_conflict', false) }
    if (command.appliedTransactionRef === undefined || command.buyerBalanceBefore === undefined || command.buyerBalanceAfter === undefined) return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_outcome_unknown', false) }
    return { state: input.state, ledgerState: input.ledgerState, result: { kind: 'accepted', chargeState: 'paid', amount: command.amount, priceDigest: command.inputDigest, transactionRef: command.appliedTransactionRef } }
  }
  const beforeAccount = input.ledgerState.accounts.get(command.accountRef)
  const applied = applyTopup({ state: input.ledgerState, transaction: input.transaction, accountRef: command.accountRef, amount: command.amount, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs })
  if (applied.result.kind === 'refused') return { state: input.state, ledgerState: input.ledgerState, result: applied.result }
  const afterAccount = applied.state.accounts.get(command.accountRef)
  if (beforeAccount === undefined || afterAccount === undefined) return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_outcome_unknown', false) }
  const nextCommand = { ...command, state: 'succeeded' as const, externalRef: input.event.externalRef, buyerBalanceBefore: beforeAccount.balance, buyerBalanceAfter: afterAccount.balance, appliedStripeEventId: input.event.stripeEventId, appliedPayloadDigest: input.event.payloadDigest, appliedTransactionRef: input.transaction.transactionRef, updatedAt: input.event.observedAt }
  return { state: { ...input.state, commands: input.state.commands.map((item) => item.commandRef === command.commandRef ? nextCommand : item) }, ledgerState: applied.state, result: applied.result }
}


export function markCreditTopupOutcomeUnknown(input: Readonly<{ state: TopupState; commandRef: string; externalRef: string; now: number }>): Readonly<{ state: TopupState; result: CreditTopupCommand | MoneyRefusal }> {
  const command = input.state.commands.find((item) => item.commandRef === input.commandRef)
  if (command === undefined || command.externalRef !== input.externalRef) return { state: input.state, result: refusal('credit_topup_pending', true) }
  if (command.state === 'succeeded') return { state: input.state, result: command }
  const updated = { ...command, state: 'outcome_unknown' as const, updatedAt: input.now }
  return { state: { ...input.state, commands: input.state.commands.map((item) => item.commandRef === command.commandRef ? updated : item) }, result: updated }
}

export function setAutoRecharge(input: Readonly<{ state: TopupState; accountRef: string; settings: AutoRechargeSettings; config: CreditTopupConfig }>): Readonly<{ state: TopupState; result: AutoRechargeSettings | MoneyRefusal }> {
  const currency = input.settings.threshold.currency
  const minimum = input.config.minimumByCurrency[currency]
  const maximum = input.config.maximumByCurrency[currency]
  const thresholdMin = minimum === undefined ? undefined : compareExactAmounts(input.settings.threshold, minimum)
  const thresholdMax = maximum === undefined ? undefined : compareExactAmounts(input.settings.threshold, maximum)
  const rechargeMin = minimum === undefined ? undefined : compareExactAmounts(input.settings.rechargeAmount, minimum)
  const rechargeMax = maximum === undefined ? undefined : compareExactAmounts(input.settings.rechargeAmount, maximum)
  if (minimum === undefined || maximum === undefined || !validAmount(input.settings.threshold) || !validAmount(input.settings.rechargeAmount) || thresholdMin === undefined || thresholdMax === undefined || rechargeMin === undefined || rechargeMax === undefined || thresholdMin === -1 || thresholdMax === 1 || rechargeMin === -1 || rechargeMax === 1) {
    return { state: input.state, result: refusal('credit_topup_amount_invalid', false) }
  }
  const autoRecharge = new Map(input.state.autoRecharge)
  autoRecharge.set(input.accountRef, input.settings)
  return { state: { ...input.state, autoRecharge }, result: input.settings }
}

export function fixtureUsdTopupConfig(): CreditTopupConfig {
  return productionCreditTopupConfig()
}

function validAmount(value: ExactAmount): boolean {
  return exactAmountSchema.safeParse(value).success
}
function refusal(code: MoneyRefusal['code'], retryable: boolean): MoneyRefusal {
  return { kind: 'refused', code, retryable }
}
