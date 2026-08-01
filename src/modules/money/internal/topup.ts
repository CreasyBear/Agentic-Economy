import type { ChargeAuthorizationResult, MoneyRefusal } from '../public'
import type { CreditPaymentEvidence, CreditPaymentPort, CreditPaymentRequest } from './ports'
import { applyTopup, type BeginTransactionInput, type LedgerState } from './ledger'

export type CreditTopupConfig = Readonly<{
  minimumByCurrency: Readonly<Record<string, number>>
  maximumByCurrency: Readonly<Record<string, number>>
  topupFeeBps?: number
}>

export type AutoRechargeSettings = Readonly<{
  enabled: boolean
  thresholdMinor: number
  rechargeAmountMinor: number
}>
export type CreditTopupCommand = Readonly<{
  commandRef: string
  principalId: string
  accountRef: string
  currency: string
  amountMinor: number
  processingFeeMinor: number
  chargeAmountMinor: number
  idempotencyKey: string
  inputDigest: string
  state: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown'
  externalRef?: string
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
  currency: string
  amountMinor: number
  idempotencyKey: string
  inputDigest: string
  commandRef: string
  successReturnRef: string
  now: number
  config: CreditTopupConfig
  port: CreditPaymentPort
}>): Promise<BeginTopupResult> {
  const minimum = input.config.minimumByCurrency[input.currency]
  const maximum = input.config.maximumByCurrency[input.currency]
  const feeBps = input.config.topupFeeBps ?? 500
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > 10_000) return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_amount_invalid', false) }
  const processingFeeMinor = Math.ceil((input.amountMinor * feeBps) / 10_000)
  const chargeAmountMinor = input.amountMinor + processingFeeMinor
  if (!Number.isSafeInteger(processingFeeMinor) || !Number.isSafeInteger(chargeAmountMinor)) return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_amount_invalid', false) }
  if (minimum === undefined || maximum === undefined || !validAmount(input.amountMinor) || input.amountMinor < minimum || input.amountMinor > maximum) {
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
    amountMinor: chargeAmountMinor,
    currency: input.currency,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    successReturnRef: input.successReturnRef,
  }
  const providerResult = await input.port.createCreditPayment(request)
  if (isMoneyRefusal(providerResult)) return { state: input.state, ledgerState: input.ledgerState, result: providerResult }
  const command: CreditTopupCommand = {
    commandRef: input.commandRef,
    principalId: input.principalId,
    accountRef: input.accountRef,
    amountMinor: input.amountMinor,
    processingFeeMinor,
    chargeAmountMinor,
    currency: input.currency,
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
  event: Readonly<{ stripeEventId: string; eventType: 'payment_intent.succeeded'; externalRef: string; principalId: string; accountRef: string; currency: string; amountMinor: number; payloadDigest: string; observedAt: number }>
  transaction: BeginTransactionInput
  sourceDigest: string
  evidenceRefs: readonly string[]
}>): Readonly<{ state: TopupState; ledgerState: LedgerState; result: ChargeAuthorizationResult | MoneyRefusal }> {
  const command = input.state.commands.find((item) => item.commandRef === input.commandRef)
  if (command === undefined || command.principalId !== input.event.principalId || command.accountRef !== input.event.accountRef || command.currency !== input.event.currency || command.chargeAmountMinor !== input.event.amountMinor || command.externalRef !== input.event.externalRef) {
    return { state: input.state, ledgerState: input.ledgerState, result: refusal('credit_topup_pending', true) }
  }
  if (command.state === 'succeeded') {
    return { state: input.state, ledgerState: input.ledgerState, result: { kind: 'accepted', chargeState: 'paid', currency: command.currency, amountMinor: command.amountMinor, priceDigest: command.inputDigest, transactionRef: input.transaction.transactionRef } }
  }
  const applied = applyTopup({ state: input.ledgerState, transaction: input.transaction, accountRef: command.accountRef, amountMinor: command.amountMinor, sourceDigest: input.sourceDigest, evidenceRefs: input.evidenceRefs })
  if (applied.result.kind === 'refused') return { state: input.state, ledgerState: input.ledgerState, result: applied.result }
  const nextCommand = { ...command, state: 'succeeded' as const, updatedAt: input.event.observedAt }
  return { state: { ...input.state, commands: input.state.commands.map((item) => item.commandRef === command.commandRef ? nextCommand : item) }, ledgerState: applied.state, result: applied.result }
}

export function markCreditTopupOutcomeUnknown(input: Readonly<{ state: TopupState; commandRef: string; externalRef: string; now: number }>): Readonly<{ state: TopupState; result: CreditTopupCommand | MoneyRefusal }> {
  const command = input.state.commands.find((item) => item.commandRef === input.commandRef)
  if (command === undefined || command.externalRef !== input.externalRef) return { state: input.state, result: refusal('credit_topup_pending', true) }
  if (command.state === 'succeeded') return { state: input.state, result: command }
  const updated = { ...command, state: 'outcome_unknown' as const, updatedAt: input.now }
  return { state: { ...input.state, commands: input.state.commands.map((item) => item.commandRef === command.commandRef ? updated : item) }, result: updated }
}

export function setAutoRecharge(input: Readonly<{ state: TopupState; accountRef: string; settings: AutoRechargeSettings; config: CreditTopupConfig; currency: string }>): Readonly<{ state: TopupState; result: AutoRechargeSettings | MoneyRefusal }> {
  const minimum = input.config.minimumByCurrency[input.currency]
  const maximum = input.config.maximumByCurrency[input.currency]
  if (minimum === undefined || maximum === undefined || !validAmount(input.settings.thresholdMinor) || !validAmount(input.settings.rechargeAmountMinor) || input.settings.thresholdMinor < minimum || input.settings.thresholdMinor > maximum || input.settings.rechargeAmountMinor < minimum || input.settings.rechargeAmountMinor > maximum) {
    return { state: input.state, result: refusal('credit_topup_amount_invalid', false) }
  }
  const autoRecharge = new Map(input.state.autoRecharge)
  autoRecharge.set(input.accountRef, input.settings)
  return { state: { ...input.state, autoRecharge }, result: input.settings }
}

export function fixtureUsdTopupConfig(): CreditTopupConfig {
  return { minimumByCurrency: { USD: 500 }, maximumByCurrency: { USD: 2_500_000 } }
}

function validAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function refusal(code: MoneyRefusal['code'], retryable: boolean): MoneyRefusal {
  return { kind: 'refused', code, retryable }
}
function isMoneyRefusal(value: CreditPaymentEvidence | MoneyRefusal): value is MoneyRefusal {
  return 'kind' in value && value.kind === 'refused'
}
