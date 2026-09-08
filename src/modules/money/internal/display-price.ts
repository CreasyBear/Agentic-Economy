import { formatExactAmount, type ExactAmount } from './exact-amount'

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
  const amount = formatExactAmount(display.amount)
  if (amount === undefined || display.amount.currency !== 'AUD') return 'AUD estimate temporarily unavailable'
  const [whole, fraction = ''] = amount.split('.')
  const decimals = fraction.replace(/0+$/u, '').padEnd(2, '0')
  return `About A$${whole}.${decimals}`
}
