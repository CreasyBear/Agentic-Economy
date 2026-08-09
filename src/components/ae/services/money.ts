import type { OfferingPrice } from '@/modules/catalog/public'
import { formatCurrencyAmount } from '@/modules/money/public'

export function formatPublishedPrice(price: OfferingPrice): string {
  if (price.kind === 'quote_only') return 'Quote required'
  const lower = formatCurrencyAmount(price.kind === 'range' ? price.minimum : price.amount)
  const upper = price.kind === 'range' ? `–${formatCurrencyAmount(price.maximum)}` : ''
  const qualifier = price.kind === 'from' ? 'From ' : ''
  const unit = price.unit === undefined ? '' : ` / ${price.unit}`
  const tax = price.taxTreatment === 'inclusive' ? ' incl. tax' : price.taxTreatment === 'exclusive' ? ' + tax' : ''
  return `${qualifier}${lower}${upper}${unit}${tax}`
}
