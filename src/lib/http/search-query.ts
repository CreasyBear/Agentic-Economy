import { exactAmountSchema } from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'

export function optionalSearchMode(
  value: string | null,
): { mode?: 'near_me' | 'whole_catalogue' } {
  if (value === 'near_me' || value === 'near') {
    return { mode: 'near_me' }
  }
  if (value === 'whole_catalogue' || value === 'catalogue' || value === 'catalog') {
    return { mode: 'whole_catalogue' }
  }
  return {}
}

export function optionalSearchLocation(value: string | null): { location?: string } {
  const normalized = value?.trim().replace(/\s+/g, ' ').slice(0, 80)
  return normalized === undefined || normalized.length === 0
    ? {}
    : { location: normalized }
}

/**
 * A budget an agent cannot express is a budget it will not send. Anything that
 * is not a complete, valid ExactAmount is dropped rather than rejected: a
 * malformed ceiling must not turn a real search into an error.
 */

export function optionalMaxPrice(
  currency: string | null,
  units: string | null,
  exponent: string | null,
): { maxPrice?: ExactAmount } {
  if (currency === null || units === null || exponent === null) return {}
  const normalizedExponent = exponent.trim()
  if (!/^(0|[1-9]\d*)$/u.test(normalizedExponent)) return {}
  const parsed = exactAmountSchema.safeParse({
    currency,
    units,
    exponent: Number(normalizedExponent),
  })
  return parsed.success ? { maxPrice: parsed.data } : {}
}

export function optionalHasPrice(value: string | null): { hasPrice?: boolean } {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return { hasPrice: true }
  if (normalized === 'false' || normalized === '0') return { hasPrice: false }
  return {}
}
