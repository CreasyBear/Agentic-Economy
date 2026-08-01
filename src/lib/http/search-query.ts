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
 * is not a whole positive number of minor units is dropped rather than
 * rejected: a malformed ceiling must not turn a real search into an error.
 */
export function optionalMaxPriceMinor(value: string | null): { maxPriceMinor?: number } {
  if (value === null) return {}
  const parsed = Number(value.trim())
  return Number.isInteger(parsed) && parsed > 0 && parsed <= Number.MAX_SAFE_INTEGER
    ? { maxPriceMinor: parsed }
    : {}
}

export function optionalHasPrice(value: string | null): { hasPrice?: boolean } {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return { hasPrice: true }
  if (normalized === 'false' || normalized === '0') return { hasPrice: false }
  return {}
}
