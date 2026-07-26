/**
 * A published price a machine can compare.
 *
 * `pricingSummary` stays exactly as it is: the verbatim sentence the business
 * wrote, never reworded and never derived. This record sits beside it and
 * carries the same fact in a form that can be filtered, sorted, and checked
 * against a spend limit. A Request already reasons in minor units
 * (`maximumSpendMinor`), so supply was the only side still speaking prose.
 *
 * Nothing here is inferred from the prose. A business publishes this or it does
 * not, and an absent price stays absent rather than becoming a guess.
 */

export const OfferingPriceKindValues = ['fixed', 'from', 'range', 'quote_only'] as const
export type OfferingPriceKind = (typeof OfferingPriceKindValues)[number]

/** What one unit of the amount buys. Bounded so two prices stay comparable. */
export const OfferingPriceUnitValues = ['job', 'hour', 'visit', 'item', 'day', 'week', 'month'] as const
export type OfferingPriceUnit = (typeof OfferingPriceUnitValues)[number]

/** Australian supply publishes tax-inclusive prices; say which, never assume. */
export const OfferingPriceTaxTreatmentValues = ['inclusive', 'exclusive', 'unstated'] as const
export type OfferingPriceTaxTreatment = (typeof OfferingPriceTaxTreatmentValues)[number]

export type OfferingPrice = Readonly<{
  kind: OfferingPriceKind
  /** ISO 4217, upper case. */
  currency: string
  /** Absent only for `quote_only`. Lower bound for `range`. */
  amountMinor?: number
  /** Present only for `range`. */
  maximumAmountMinor?: number
  unit?: OfferingPriceUnit
  taxTreatment: OfferingPriceTaxTreatment
}>

export type OfferingPriceInput = Readonly<{
  kind?: string
  currency?: string
  amountMinor?: number
  maximumAmountMinor?: number
  unit?: string
  taxTreatment?: string
}>

/** One hundred thousand dollars in minor units: past this, someone typoed. */
const maximumAmountMinor = 10_000_000

/**
 * Returns the price only when it is internally consistent. A half-published
 * price is worse than none: it would sort and filter against a number the
 * business never agreed to.
 */
export function normalizeOfferingPrice(input: OfferingPriceInput | undefined): OfferingPrice | undefined {
  if (input === undefined) return undefined

  const kind = OfferingPriceKindValues.find((value) => value === input.kind)
  if (kind === undefined) return undefined

  const currency = input.currency?.trim().toUpperCase()
  if (currency === undefined || !/^[A-Z]{3}$/u.test(currency)) return undefined

  const taxTreatment = OfferingPriceTaxTreatmentValues.find((value) => value === input.taxTreatment) ?? 'unstated'
  const unit = OfferingPriceUnitValues.find((value) => value === input.unit)

  if (kind === 'quote_only') {
    return { kind, currency, taxTreatment, ...(unit === undefined ? {} : { unit }) }
  }

  const amount = normalizeAmount(input.amountMinor)
  if (amount === undefined) return undefined

  if (kind !== 'range') {
    return { kind, currency, amountMinor: amount, taxTreatment, ...(unit === undefined ? {} : { unit }) }
  }

  const maximum = normalizeAmount(input.maximumAmountMinor)
  if (maximum === undefined || maximum < amount) return undefined

  return {
    kind,
    currency,
    amountMinor: amount,
    maximumAmountMinor: maximum,
    taxTreatment,
    ...(unit === undefined ? {} : { unit }),
  }
}

/**
 * The amount a caller must be willing to spend before this option is worth
 * showing. `quote_only` has no ceiling to compare, so it never filters out —
 * refusing to show an unpriced option would hide most real local supply.
 */
export function offeringPriceCeilingMinor(price: OfferingPrice | undefined): number | undefined {
  if (price === undefined || price.kind === 'quote_only') return undefined
  return price.maximumAmountMinor ?? price.amountMinor
}

/** Plain customer copy. Never a substitute for a published `pricingSummary`. */
export function formatOfferingPrice(price: OfferingPrice): string {
  const unit = price.unit === undefined ? '' : ` per ${price.unit}`
  const tax = price.taxTreatment === 'inclusive'
    ? ' incl. tax'
    : price.taxTreatment === 'exclusive' ? ' excl. tax' : ''

  if (price.kind === 'quote_only') return `Quoted on request (${price.currency})`

  const amount = formatMajor(price.amountMinor ?? 0, price.currency)
  if (price.kind === 'range') {
    return `${amount}–${formatMajor(price.maximumAmountMinor ?? 0, price.currency)}${unit}${tax}`
  }
  return `${price.kind === 'from' ? 'From ' : ''}${amount}${unit}${tax}`
}

function formatMajor(amountMinor: number, currency: string): string {
  const major = amountMinor / 100
  const rendered = Number.isInteger(major) ? String(major) : major.toFixed(2)
  return `${currency} ${rendered}`
}

function normalizeAmount(value: number | undefined): number | undefined {
  return value === undefined
    || !Number.isInteger(value)
    || value < 0
    || value > maximumAmountMinor
    ? undefined
    : value
}
