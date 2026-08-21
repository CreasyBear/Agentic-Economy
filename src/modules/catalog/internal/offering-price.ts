import { z } from 'zod'
import { compareExactAmounts, exactAmountSchema, formatExactAmount, rescaleExactAmount } from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'

/**
 * A published price a machine can compare.
 *
 * `pricingSummary` stays exactly as it is: the verbatim sentence the business
 * wrote, never reworded and never derived. This record sits beside it and
 * carries the same fact in a form that can be filtered, sorted, and checked
 * against a spend limit. Nothing here is inferred from prose: a business
 * publishes a comparable price or it does not.
 */

export const OfferingPriceKindValues = ['fixed', 'from', 'range', 'quote_only'] as const

/** Currencies currently supported by owner-entered offering prices. */
export const SUPPORTED_OFFERING_CURRENCIES = ['AUD', 'USD'] as const
export type SupportedOfferingCurrency = (typeof SUPPORTED_OFFERING_CURRENCIES)[number]
export const DEFAULT_OFFERING_PRICE_CURRENCY: SupportedOfferingCurrency = 'USD'
export const supportedOfferingCurrencySchema = z.enum(SUPPORTED_OFFERING_CURRENCIES)

export function isSupportedOfferingCurrency(value: unknown): value is SupportedOfferingCurrency {
  return supportedOfferingCurrencySchema.safeParse(value).success
}
export type OfferingPriceKind = (typeof OfferingPriceKindValues)[number]

/** What one unit of the amount buys. Bounded so two prices stay comparable. */
export const OfferingPriceUnitValues = ['call', 'job', 'hour', 'visit', 'item', 'day', 'week', 'month'] as const
export type OfferingPriceUnit = (typeof OfferingPriceUnitValues)[number]

/** Australian supply publishes tax-inclusive prices; say which, never assume. */
export const OfferingPriceTaxTreatmentValues = ['inclusive', 'exclusive', 'unstated'] as const
export type OfferingPriceTaxTreatment = (typeof OfferingPriceTaxTreatmentValues)[number]

type OfferingPriceTerms = Readonly<{
  unit?: OfferingPriceUnit
  taxTreatment: OfferingPriceTaxTreatment
}>

export type OfferingPrice =
  | (OfferingPriceTerms & Readonly<{
      kind: 'quote_only'
      /** Quote-only prices retain their published currency without an amount. */
      currency: string
    }>)
  | (OfferingPriceTerms & Readonly<{
      kind: 'fixed' | 'from'
      amount: ExactAmount
    }>)
  | (OfferingPriceTerms & Readonly<{
      kind: 'range'
      minimum: ExactAmount
      maximum: ExactAmount
    }>)

export type OfferingPriceInput = Readonly<{
  kind?: string
  currency?: string
  amount?: unknown
  minimum?: unknown
  maximum?: unknown
  unit?: string
  taxTreatment?: string
}>

/**
 * Returns the price only when it is internally consistent. A half-published
 * price is worse than none: it would sort and filter against a number the
 * business never agreed to.
 */
export function normalizeOfferingPrice(input: OfferingPriceInput | undefined): OfferingPrice | undefined {
  if (input === undefined) return undefined

  const kind = OfferingPriceKindValues.find((value) => value === input.kind)
  if (kind === undefined) return undefined

  const taxTreatment = OfferingPriceTaxTreatmentValues.find((value) => value === input.taxTreatment) ?? 'unstated'
  const unit = OfferingPriceUnitValues.find((value) => value === input.unit)

  if (kind === 'quote_only') {
    const currency = input.currency?.trim().toUpperCase()
    if (currency === undefined || !/^[A-Z]{3}$/u.test(currency)) return undefined
    return { kind, currency, taxTreatment, ...(unit === undefined ? {} : { unit }) }
  }

  if (kind === 'fixed' || kind === 'from') {
    const amount = readExactAmount(input.amount)
    if (amount === undefined) return undefined
    return { kind, amount, taxTreatment, ...(unit === undefined ? {} : { unit }) }
  }

  const minimum = readExactAmount(input.minimum)
  const maximum = readExactAmount(input.maximum)
  const comparisonExponent = minimum === undefined || maximum === undefined
    ? undefined
    : Math.max(minimum.exponent, maximum.exponent)
  const comparableMinimum = comparisonExponent === undefined || minimum === undefined
    ? undefined
    : rescaleExactAmount(minimum, comparisonExponent)
  const comparableMaximum = comparisonExponent === undefined || maximum === undefined
    ? undefined
    : rescaleExactAmount(maximum, comparisonExponent)
  const comparison = comparableMinimum === undefined || comparableMaximum === undefined
    ? undefined
    : compareExactAmounts(comparableMinimum, comparableMaximum)
  if (minimum === undefined || maximum === undefined || comparison === undefined || comparison > 0) return undefined

  return {
    kind,
    minimum,
    maximum,
    taxTreatment,
    ...(unit === undefined ? {} : { unit }),
  }
}

/** Plain customer copy. Never a substitute for a published `pricingSummary`. */
export function formatOfferingPrice(price: OfferingPrice): string {
  const unit = price.unit === undefined ? '' : ` per ${price.unit}`
  const tax = price.taxTreatment === 'inclusive'
    ? ' incl. tax'
    : price.taxTreatment === 'exclusive' ? ' excl. tax' : ''

  if (price.kind === 'quote_only') return `Quoted on request (${price.currency})`

  const amount = formatAmount(price.kind === 'range' ? price.minimum : price.amount)
  if (price.kind === 'range') {
    return `${amount}–${formatAmount(price.maximum)}${unit}${tax}`
  }
  return `${price.kind === 'from' ? 'From ' : ''}${amount}${unit}${tax}`
}

function formatAmount(amount: ExactAmount): string {
  return `${amount.currency} ${formatExactAmount(amount) ?? '—'}`
}

function readExactAmount(value: unknown): ExactAmount | undefined {
  const parsed = exactAmountSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
