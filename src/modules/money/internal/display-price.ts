import { readExactAmount, type ExactAmount } from './exact-amount'
import { convertUsdcToAud, type ReferenceRate } from './executable-rate'

/** Presentation only: exact micro-units stay unchanged for Quotes, records and exports. */
function formatAudCents(amount: ExactAmount): string | undefined {
  const exact = readExactAmount(amount)
  if (exact?.currency !== 'AUD') return undefined
  const units = BigInt(exact.units)
  const scale = 10n ** BigInt(Math.abs(exact.exponent - 2))
  const cents = exact.exponent <= 2 ? units * scale : (units + scale - 1n) / scale
  return `A$${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}

/** An indicative AUD amount or exact USDC source plus a fresh Coinbase observation. */
export function formatDisplayPrice(
  display: Readonly<{
    kind: 'indicative'
    amount: ExactAmount
    validUntil: number
    referenceRate?: ReferenceRate
  }> | Readonly<{ kind: 'unavailable' }> | undefined,
  now = Date.now(),
): string | undefined {
  if (display === undefined) return undefined
  if (display.kind === 'unavailable' || !Number.isSafeInteger(now)
    || !Number.isSafeInteger(display.validUntil) || display.validUntil <= now) {
    return 'AUD estimate temporarily unavailable'
  }
  const amount = display.amount.currency === 'USDC'
    ? display.referenceRate === undefined
      ? undefined
      : convertUsdcToAud(display.amount, display.referenceRate, now)
    : display.amount
  const formatted = amount === undefined ? undefined : formatAudCents(amount)
  return formatted ?? 'AUD estimate temporarily unavailable'
}

/** A known AUD amount (balance or ledger row), without an estimate window. */
export function formatDisplayAmount(amount: ExactAmount | undefined): string {
  if (amount === undefined) return 'Amount unknown'
  return formatAudCents(amount) ?? 'Amount unknown'
}
