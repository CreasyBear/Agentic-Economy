import Decimal from 'decimal.js'
import { formatExactAmount, type ExactAmount } from './exact-amount'

const TINY_VALUE_THRESHOLD = new Decimal('0.01')

function currencySymbol(currency: string): string {
  return currency === 'AUD' ? 'A$' : `${currency} `
}

/** Shared 2dp cap + tiny-value marker. The one numeric rule for every buyer-facing money display. */
function formatCapped(amount: ExactAmount): string | undefined {
  const formatted = formatExactAmount(amount)
  if (formatted === undefined) return undefined
  const value = new Decimal(formatted)
  const symbol = currencySymbol(amount.currency)
  if (!value.isZero() && value.lt(TINY_VALUE_THRESHOLD)) return `<${symbol}0.01`
  return `${symbol}${value.toFixed(2)}`
}

/** Presentation only. Spending always uses the separately issued Quote. */
export function formatDisplayPrice(
  display: Readonly<{ kind: 'indicative'; amount: ExactAmount; validUntil: number }>
    | Readonly<{ kind: 'unavailable' }> | undefined,
  now = Date.now(),
): string | undefined {
  if (display === undefined) return undefined
  if (display.kind === 'unavailable' || display.validUntil <= now) {
    return 'AUD estimate temporarily unavailable'
  }
  if (display.amount.currency !== 'AUD') return 'AUD estimate temporarily unavailable'
  const formatted = formatCapped(display.amount)
  if (formatted === undefined) return 'AUD estimate temporarily unavailable'
  // A tiny-value marker ("<A$0.01") is already a bound, not a rounded estimate.
  return formatted.startsWith('<') ? formatted : `About ${formatted}`
}

/** A settled/known amount (balance, ledger row) — not an estimate, so no validity window or "About" prefix. */
export function formatDisplayAmount(amount: ExactAmount | undefined): string {
  if (amount === undefined) return 'Amount unknown'
  return formatCapped(amount) ?? 'Amount unknown'
}
