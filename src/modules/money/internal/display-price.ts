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

/**
 * A per-call price keeps its sub-cent digits: two significant figures, rounded up at that place,
 * so a 0.001 USDC call reads A$0.0016, never A$0.01. A cent or more rounds up to whole cents.
 */
function formatAudPrice(amount: ExactAmount): string | undefined {
  const exact = readExactAmount(amount)
  if (exact?.currency !== 'AUD') return undefined
  const units = BigInt(exact.units)
  if (exact.exponent <= 2 || units === 0n) return formatAudCents(amount)
  const decimals = Math.min(exact.exponent, Math.max(2, exact.exponent - units.toString().length + 2))
  const scale = 10n ** BigInt(exact.exponent - decimals)
  const shown = (units + scale - 1n) / scale
  const padded = shown.toString().padStart(decimals + 1, '0')
  const whole = padded.slice(0, padded.length - decimals)
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/u, '').padEnd(2, '0')
  return `A$${whole}.${fraction}`
}

function formatUsdAmount(amount: ExactAmount): string | undefined {
  const exact = readExactAmount(amount)
  if (exact === undefined || (exact.currency !== 'USD' && exact.currency !== 'USDC')) return undefined
  const units = BigInt(exact.units)
  const padded = units.toString().padStart(exact.exponent + 1, '0')
  const splitAt = padded.length - exact.exponent
  const whole = padded.slice(0, splitAt)
  const fraction = padded.slice(splitAt).replace(/0+$/u, '')
  const subCent = units > 0n && exact.exponent > 2
    && units < 10n ** BigInt(exact.exponent - 2)
  return `US$${whole}.${subCent ? fraction : fraction.padEnd(2, '0')}`
}

/** An indicative amount; USDC falls back to its exact USD value without fresh AUD evidence. */
export function formatDisplayPrice(
  display: Readonly<{
    kind: 'indicative'
    amount: ExactAmount
    validUntil?: number
    referenceRate?: ReferenceRate
  }> | Readonly<{ kind: 'unavailable' }> | undefined,
  now = Date.now(),
): string | undefined {
  if (display === undefined || display.kind === 'unavailable') return undefined
  const withinEstimateWindow = Number.isSafeInteger(now)
    && display.validUntil !== undefined
    && Number.isSafeInteger(display.validUntil)
    && display.validUntil > now
  if (display.amount.currency === 'USDC') {
    const aud = withinEstimateWindow && display.referenceRate !== undefined
      ? convertUsdcToAud(display.amount, display.referenceRate, now)
      : undefined
    return (aud === undefined ? undefined : formatAudPrice(aud)) ?? formatUsdAmount(display.amount)
  }
  if (display.amount.currency === 'USD') return formatUsdAmount(display.amount)
  return withinEstimateWindow ? formatAudPrice(display.amount) : undefined
}

/** A known AUD amount (balance or ledger row), without an estimate window. */
export function formatDisplayAmount(amount: ExactAmount | undefined): string {
  if (amount === undefined) return 'Amount unknown'
  return formatAudCents(amount) ?? 'Amount unknown'
}
