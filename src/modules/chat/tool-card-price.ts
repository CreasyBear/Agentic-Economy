import { isRecord } from '@/modules/common/is-record'
import { publicToolDisplayPriceSchema } from '@/modules/capability-supply/tool-schemas'
import type { PublicToolPrice } from '@/modules/capability-supply/public'
import { formatDisplayAmount, formatDisplayPrice, formatExactAmount, parseDecimalExactAmount, type ExactAmount } from '@/modules/money/public'
import { projectCompareContrasts, readPrice } from './internal/tool-card-compare'

export function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? Array.from(value.trim()).slice(0, 120).join('')
    : undefined
}

function buyerAmount(amount: ExactAmount): string | undefined {
  if (amount.currency === 'AUD') return formatDisplayAmount(amount)
  if (amount.currency !== 'USD' && amount.currency !== 'USDC') return undefined
  const formatted = formatExactAmount(amount)
  if (formatted === undefined) return undefined
  const normalized = formatted.includes('.') ? formatted.replace(/0+$/u, '').replace(/\.$/u, '') : formatted
  return `US$${normalized}`
}

function usdPriceFromSource(source: unknown): string | undefined {
  if (typeof source !== 'string') return undefined
  const decimal = /^(\d+(?:\.\d+)?) USDC$/u.exec(source)?.[1]
    ?? /^USDC (\d+(?:\.\d+)?)$/u.exec(source)?.[1]
  const amount = decimal === undefined ? undefined : parseDecimalExactAmount('USDC', decimal, 6)
  return amount === undefined ? undefined : buyerAmount(amount)
}

export function buyerPrice(price: PublicToolPrice): string | undefined {
  if (price.kind === 'on_request') return undefined
  if (price.kind === 'fixed') return buyerAmount(price.amount)
  if (price.minimum.currency !== price.maximum.currency) return undefined
  const minimum = buyerAmount(price.minimum)
  const maximum = buyerAmount(price.maximum)
  return minimum === undefined || maximum === undefined ? undefined : `${minimum}–${maximum}`
}

export function choicePriceFields(value: Record<string, unknown>) {
  const display = publicToolDisplayPriceSchema.safeParse(value.displayPrice)
  const formatted = display.success && display.data.kind === 'indicative'
    && display.data.validUntil > Date.now() ? formatDisplayPrice(display.data) : undefined
  const listedPrice = isRecord(value.price) && value.price.kind === 'indicative' && typeof value.price.label === 'string'
    ? value.price.label : undefined
  const listedAudIsFresh = listedPrice?.startsWith('A$') === true
    && isRecord(value.price) && typeof value.price.validUntil === 'number' && value.price.validUntil > Date.now()
  const price = formatted?.startsWith('A$') ? formatted
    : listedAudIsFresh ? stringField(listedPrice)
      : usdPriceFromSource(value.sourcePrice) ?? usdPriceFromSource(listedPrice)
  const priceValidUntil = price?.startsWith('A$') !== true ? undefined
    : display.success && display.data.kind === 'indicative' ? display.data.validUntil
      : listedAudIsFresh && isRecord(value.price) && typeof value.price.validUntil === 'number'
        ? value.price.validUntil : undefined
  return {
    ...(price === undefined ? {} : { price }),
    ...(priceValidUntil === undefined ? {} : { priceValidUntil }),
  }
}

export function buyerCompareContrasts(
  output: Record<string, unknown>,
  choices: Parameters<typeof projectCompareContrasts>[1],
): ReturnType<typeof projectCompareContrasts> {
  const contrasts = projectCompareContrasts(output, choices)
  if (!Array.isArray(output.facts)) return contrasts
  const priceFact = output.facts.find((fact) => isRecord(fact) && fact.field === 'price')
  if (!isRecord(priceFact) || !Array.isArray(priceFact.values)) return contrasts
  const prices: string[] = []
  for (const cell of priceFact.values) {
    if (!isRecord(cell)) continue
    const price = readPrice(cell.value)
    if (price === undefined) continue
    const title = typeof cell.toolRef === 'string'
      ? choices.find((choice) => choice.toolRef === cell.toolRef)?.title
      : undefined
    const label = buyerPrice(price)
    if (label === undefined) continue
    prices.push(title === undefined ? label : `${title}: ${label}`)
  }
  return contrasts.flatMap(fact => fact.label !== 'Price'
    ? [fact]
    : prices.length > 0 ? [{ ...fact, value: prices.join('; ') }] : [])
}

export function paidLabel(charge: ExactAmount | undefined): string | undefined {
  return charge?.currency === 'AUD' && BigInt(charge.units) > 0n
    ? `Paid ${formatDisplayAmount(charge)}`
    : undefined
}
