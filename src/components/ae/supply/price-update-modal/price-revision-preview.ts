import {
  AUD_EXPONENT,
  compareExactAmounts,
  formatExactAmount,
  parseDecimalExactAmount,
  rescaleExactAmount,
  type ExactAmount,
} from '@/modules/money/public'

export function parseDisplayAudPrice(display?: string): ExactAmount | undefined {
  if (display === undefined || display.trim() === '') return undefined
  const match = display.match(/^\s*(?:A\$|AUD)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*$/u)
  const price = match?.[1]
  if (price === undefined) return undefined
  const parsed = parseDecimalExactAmount('AUD', price.replaceAll(',', ''), 2)
  if (parsed === undefined || BigInt(parsed.units) <= 0n) return undefined
  return parsed
}

export function parsePositiveAudInput(value: string): ExactAmount | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = parseDecimalExactAmount('AUD', trimmed, 2)
  if (parsed === undefined || BigInt(parsed.units) <= 0n) return undefined
  return parsed
}

export function formatAudLabel(amount: ExactAmount | undefined): string {
  if (amount === undefined) return '—'
  const formatted = formatExactAmount(amount)
  if (formatted === undefined) return '—'
  return `A$${formatted}`
}

export function formatDelta(
  current: ExactAmount | undefined,
  next: ExactAmount | undefined,
): string {
  if (current === undefined || next === undefined) return '—'
  const comparison = compareExactAmounts(current, next)
  if (comparison === undefined) return '—'
  if (comparison === 0) return 'No change'
  const currentUnits = BigInt(current.units)
  const nextUnits = BigInt(next.units)
  const differenceUnits =
    nextUnits > currentUnits ? nextUnits - currentUnits : currentUnits - nextUnits
  const differenceDollars = Number(differenceUnits) / 100
  if (comparison < 0) return `+A$${differenceDollars.toFixed(2)}`
  return `-A$${differenceDollars.toFixed(2)}`
}

export function roundAudChipValue(value: number): string {
  const rounded = Math.max(0.01, Math.round(value * 100) / 100)
  return rounded.toFixed(2)
}

export function microUnitsFromAudInput(value: string): string | undefined {
  const parsed = parsePositiveAudInput(value)
  if (parsed === undefined) return undefined
  const micro = rescaleExactAmount(parsed, AUD_EXPONENT)
  return micro?.units
}

export type GstPresentation = Readonly<{
  baseText: string
  gstText: string
  totalText: string
}>

export function computeGstPresentation(
  priceAud: string,
  parsedNew: ExactAmount | undefined,
): GstPresentation {
  const grossMicroUnits = microUnitsFromAudInput(priceAud)
  if (grossMicroUnits === undefined) {
    return { baseText: '—', gstText: '—', totalText: '—' }
  }
  const baseText = `A$${(Number(grossMicroUnits) / 1_000_000).toFixed(4)}`
  const totalFormatted = formatExactAmount(parsedNew)
  const totalText = totalFormatted === undefined ? '—' : `A$${totalFormatted}`
  return { baseText, gstText: 'A$0.0000', totalText }
}

export function computePercentageAdjustedPrice(
  factor: number,
  parsedCurrent: ExactAmount | undefined,
  priceAud: string,
): string | undefined {
  const base = parsedCurrent ?? parsePositiveAudInput(priceAud) ?? undefined
  if (base === undefined) return undefined
  const dollars = Number(base.units) / 100
  return roundAudChipValue(dollars * factor)
}
