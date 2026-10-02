import type { AccountFundingBalance, AccountFundingConstraints } from '@/modules/money/server'

export type AddCreditAmount = 5 | 10 | 20
export type AddCreditPaymentStatus = 'idle' | 'checking' | 'paused'

export type AddCreditSheetProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  signedIn: boolean
  payingOn: boolean
  enableBusy: boolean
  onEnablePaying: () => void
  shortfall?: { units: string; exponent: number }
  onFunded: () => void
}>

export type AddCreditPanelProps = Readonly<{
  signedIn: boolean
  payingOn: boolean
  enableBusy: boolean
  onEnablePaying: () => void
  signInHref: string
  selected: AddCreditAmount
  onSelect: (amount: AddCreditAmount) => void
  onBegin: () => void
  busy: boolean
  paymentStatus: AddCreditPaymentStatus
  onCheckPayment: () => void
  problem: string | null
  balance: Extract<AccountFundingBalance, { kind: 'available' }> | null
  constraints: AccountFundingConstraints | null
  shortfallTooLarge: boolean
}>

export function suggestedAddCreditAmount(shortfall?: { units: string; exponent: number }): Readonly<{
  amount: AddCreditAmount
  exceedsLargest: boolean
}> {
  if (shortfall === undefined || !/^\d+$/u.test(shortfall.units)
    || !Number.isSafeInteger(shortfall.exponent) || shortfall.exponent < 0) {
    return { amount: 5, exceedsLargest: false }
  }
  const units = shortfall.units.replace(/^0+(?=\d)/u, '')
  if (shortfall.exponent >= units.length) return { amount: 5, exceedsLargest: false }
  for (const amount of [5, 10, 20] as const) {
    const thresholdDigits = amount.toString()
    const thresholdLength = shortfall.exponent + thresholdDigits.length
    if (units.length < thresholdLength) return { amount, exceedsLargest: false }
    if (units.length > thresholdLength) continue
    const leadingDigits = units.slice(0, thresholdDigits.length)
    if (leadingDigits < thresholdDigits
      || (leadingDigits === thresholdDigits && /^0*$/u.test(units.slice(thresholdDigits.length)))) {
      return { amount, exceedsLargest: false }
    }
  }
  return { amount: 20, exceedsLargest: true }
}
