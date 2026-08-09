import { isMoneyRefusal, type ChargeAuthorizationResult, type ExactAmount, type MoneyRefusal } from '../public'
import { addExactAmounts, compareExactAmounts, exactAmountSchema, multiplyExactAmountByBps, rescaleExactAmount } from './exact-amount'
import type { CreditPaymentEvidence, CreditPaymentPort, CreditPaymentRequest } from './ports'
import type { CreditTopupWebhookEvent } from './stripe-webhook'
import { applyTopup, type BeginTransactionInput, type LedgerState } from './ledger'

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
  state: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown'
  externalRef?: string
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
  const amount = rescaleExactAmount(input.amount, account.balance.exponent)
  if (amount === undefined) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_amount_invalid', false) }
  }
  const currency = amount.currency
  const minimum = input.config.minimumByCurrency[currency]
  const maximum = input.config.maximumByCurrency[currency]
  const feeBps = input.config.topupFeeBps ?? 500
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > 10_000) return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_amount_invalid', false) }
  const processingFee = multiplyExactAmountByBps(amount, feeBps, 'ceil')
  const chargeAmount = processingFee === undefined ? undefined : addExactAmounts(amount, processingFee)
  if (minimum === undefined || maximum === undefined || !validAmount(amount) || processingFee === undefined || chargeAmount === undefined || compareExactAmounts(amount, minimum) === undefined || compareExactAmounts(amount, maximum) === undefined || compareExactAmounts(amount, minimum) === -1 || compareExactAmounts(amount, maximum) === 1) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_amount_invalid', false) }
  }
  const prior = input.state.commands.find((command) => command.idempotencyKey === input.idempotencyKey)
  if (prior !== undefined) {
    if (prior.inputDigest !== input.inputDigest || prior.principalId !== input.principalId) return { state: input.state, ledgerState: input.ledgerState, result: refusal('ledger_idempotency_conflict', false) }
    return { state: input.state, ledgerState: input.ledgerState, result: prior }
  }
  const request: CreditPaymentRequest = {
    principalId: input.principalId,
    accountRef: input.accountRef,
    amount: chargeAmount,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    successReturnRef: input.successReturnRef,
  }
  const providerResult = await input.port.createCreditPayment(request)
  if (isMoneyRefusal(providerResult)) return { state: input.state, ledgerState: input.ledgerState, result: providerResult }
  if (compareExactAmounts(providerResult.amount, chargeAmount) !== 0) return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_outcome_unknown', true) }
  const command: CreditTopupCommand = {
    commandRef: input.commandRef,
    principalId: input.principalId,
    accountRef: input.accountRef,
    amount,
    processingFee,
    chargeAmount,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    state: providerResult.status === 'outcome_unknown' ? 'outcome_unknown' : providerResult.status === 'failed' ? 'failed' : 'pending',
    externalRef: providerResult.externalRef,
    createdAt: input.now,
    updatedAt: input.now,
  }
  return { state: { ...input.state, commands: [...input.state.commands, command] }, ledgerState: input.ledgerState, result: command, provider: providerResult }
}

export function applyCreditTopup(input: Readonly<{
  state: TopupState
  ledgerState: LedgerState
  commandRef: string
  event: CreditTopupWebhookEvent
  transaction: BeginTransactionInput
  sourceDigest: string
  evidenceRefs: readonly string[]
}>): Readonly<{ state: TopupState; ledgerState: LedgerState; result: ChargeAuthorizationResult | MoneyRefusal }> {
  const command = input.state.commands.find((item) => item.commandRef === input.commandRef)
  if (command === undefined || command.principalId !== input.event.principalId || command.accountRef !== input.event.accountRef || compareExactAmounts(command.chargeAmount, input.event.amount) !== 0 || command.externalRef !== input.event.externalRef || input.transaction.principalId !== command.principalId || input.transaction.currency !== command.amount.currency || input.transaction.kind !== 'topup' || input.transaction.inputDigest !== command.inputDigest) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_pending', true) }
  }
  if (command.state === 'succeeded') {
    if (command.appliedStripeEventId !== input.event.stripeEventId || command.appliedPayloadDigest !== input.event.payloadDigest) return { state: input.state, ledgerState: input.ledgerState, result: refusal('ledger_idempotency_conflict', false) }
    if (command.appliedTransactionRef === undefined) return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_outcome_unknown', false) }
    return { state: input.state, ledgerState: input.ledgerState, result: { kind: 'accepted', chargeState: 'paid', amount: command.amount, priceDigest: command.inputDigest, transactionRef: command.appliedTransactionRef } }
  }
  const applied = applyTopup({ state: input.ledgerState, transaction: input.transaction, accountRef: command.accountRef, amount: command.amount, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs })
  if (applied.result.kind === 'refused') return { state: input.state, ledgerState: input.ledgerState, result: applied.result }
  const nextCommand = { ...command, state: 'succeeded' as const, appliedStripeEventId: input.event.stripeEventId, appliedPayloadDigest: input.event.payloadDigest, appliedTransactionRef: input.transaction.transactionRef, updatedAt: input.event.observedAt }
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
  return {
    minimumByCurrency: { USD: { currency: 'USD', units: '500', exponent: 2 } },
    maximumByCurrency: { USD: { currency: 'USD', units: '2500000', exponent: 2 } },
  }
}

function validAmount(value: ExactAmount): boolean {
  return exactAmountSchema.safeParse(value).success
}
function refusal(code: MoneyRefusal['code'], retryable: boolean): MoneyRefusal {
  return { kind: 'refused', code, retryable }
}
