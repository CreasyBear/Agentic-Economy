import type { OfferingPrice } from '@/modules/catalog/public'

export function formatMoney(currency: string, amountMinor: number): string {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amountMinor / 100)
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`
  }
}

export function formatPublishedPrice(price: OfferingPrice): string {
  if (price.kind === 'quote_only') return 'Quote required'
  const amount = price.amountMinor
  if (amount === undefined) return 'Price not published'
  const lower = formatMoney(price.currency, amount)
  const upper = price.kind === 'range' && price.maximumAmountMinor !== undefined
    ? `–${formatMoney(price.currency, price.maximumAmountMinor)}`
    : ''
  const qualifier = price.kind === 'from' ? 'From ' : ''
  const unit = price.unit === undefined ? '' : ` / ${price.unit}`
  const tax = price.taxTreatment === 'inclusive' ? ' incl. tax' : price.taxTreatment === 'exclusive' ? ' + tax' : ''
  return `${qualifier}${lower}${upper}${unit}${tax}`
}
