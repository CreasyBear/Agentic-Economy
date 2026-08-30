import type { ExactAmount } from '../../public'
import { addExactAmounts, amountAtScale, compareExactAmounts, subtractExactAmounts } from '../exact-amount'
import type { PayoutAccrualAmounts } from './types'

export function payoutAccrualFromChargeAmounts(input: Readonly<{
  transactionRef: string
  businessId: string
  chargeAmount: ExactAmount
  providerAmount: ExactAmount
  rakeAmount: ExactAmount
  recoveryAmount: ExactAmount
  accountCurrency: string
  accountExponent: number
}>): PayoutAccrualAmounts | undefined {
  const scaled = scaleAccrualAmounts(input)
  if (scaled === undefined) return undefined
  const grossAccrual = subtractExactAmounts(scaled.gross, scaled.recovery)
  const providerNet = subtractExactAmounts(scaled.provider, scaled.recovery)
  if (grossAccrual === undefined || providerNet === undefined) return undefined
  const expectedGross = addExactAmounts(providerNet, scaled.rake)
  if (expectedGross === undefined || compareExactAmounts(expectedGross, grossAccrual) !== 0) return undefined
  return {
    transactionRef: input.transactionRef,
    businessId: input.businessId,
    currency: input.accountCurrency,
    exponent: input.accountExponent,
    grossAccrual,
    rake: scaled.rake,
    providerNet,
  }
}

function scaleAccrualAmounts(input: Readonly<{
  chargeAmount: ExactAmount
  providerAmount: ExactAmount
  rakeAmount: ExactAmount
  recoveryAmount: ExactAmount
  accountCurrency: string
  accountExponent: number
}>): Readonly<{ gross: ExactAmount; provider: ExactAmount; rake: ExactAmount; recovery: ExactAmount }> | undefined {
  const gross = amountAtScale(input.chargeAmount, input.accountCurrency, input.accountExponent)
  const provider = amountAtScale(input.providerAmount, input.accountCurrency, input.accountExponent)
  const rake = amountAtScale(input.rakeAmount, input.accountCurrency, input.accountExponent)
  const recovery = amountAtScale(input.recoveryAmount, input.accountCurrency, input.accountExponent)
  return gross === undefined || provider === undefined || rake === undefined || recovery === undefined
    ? undefined
    : { gross, provider, rake, recovery }
}
