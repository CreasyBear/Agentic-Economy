import { z } from 'zod'

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
  const normalized = value?.trim().replace(/\s+/g, ' ')
  return normalized === undefined || normalized.length === 0
    ? {}
    : { location: normalized }
}

/**
 * Normalize an already-validated optional ExactAmount query triple. Public
 * search adapters validate supplied filters before invoking these normalizers.
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


/** Raw query transport shape; the registered action still validates normalized inputs. */
export const businessListQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.string().optional(),
})

export const businessSearchQuerySchema = z.strictObject({
  q: z.string().optional(),
  mode: z.string().optional(),
  location: z.string().optional(),
  max_price_currency: z.string().optional(),
  max_price_units: z.string().optional(),
  max_price_exponent: z.string().optional(),
  has_price: z.string().optional(),
  ...businessListQuerySchema.shape,
}).superRefine((query, context) => {
  const priceKeys = ['max_price_currency', 'max_price_units', 'max_price_exponent'] as const
  if (priceKeys.some((key) => query[key] !== undefined)
    && optionalMaxPrice(query.max_price_currency ?? null, query.max_price_units ?? null, query.max_price_exponent ?? null).maxPrice === undefined) {
    context.addIssue({ code: 'custom', path: ['max_price_currency'], message: 'Supply a complete, valid exact price ceiling with currency, integer units and exponent.' })
  }
  if (query.has_price !== undefined && optionalHasPrice(query.has_price).hasPrice === undefined) {
    context.addIssue({ code: 'custom', path: ['has_price'], message: 'has_price must be true, false, 1, or 0.' })
  }
  if (query.limit !== undefined && query.limit.trim() === '') {
    context.addIssue({ code: 'custom', path: ['limit'], message: 'limit must be an integer from 1 through 50.' })
  }
})
