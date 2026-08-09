import { convertToTokenAmount } from '@x402/core/utils'
import { z } from 'zod'

export type ExactAmount = Readonly<{
  currency: string
  units: string
  exponent: number
}>

const canonicalUnits = /^(0|[1-9]\d*)$/
const decimalNotation = /^\d+(?:\.\d*)?$/

export const currencySchema = z.string().regex(/^[A-Z][A-Z0-9]{2,19}$/)
export const exactAmountSchema = z.strictObject({
  currency: currencySchema,
  units: z.string().regex(canonicalUnits),
  exponent: z.number().int().min(0).max(18),
})

function readExactAmount(value: unknown): ExactAmount | undefined {
  try {
    const parsed = exactAmountSchema.safeParse(value)
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function readExponent(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 18 ? value : undefined
}

function sameCurrency(left: ExactAmount, right: ExactAmount): boolean {
  return left.currency === right.currency
}

function alignExactAmounts(left: unknown, right: unknown): Readonly<{ left: ExactAmount; right: ExactAmount }> | undefined {
  const parsedLeft = readExactAmount(left)
  const parsedRight = readExactAmount(right)
  if (parsedLeft === undefined || parsedRight === undefined || !sameCurrency(parsedLeft, parsedRight)) return undefined
  const exponent = parsedLeft.exponent >= parsedRight.exponent ? parsedLeft.exponent : parsedRight.exponent
  const alignedLeft = rescaleExactAmount(parsedLeft, exponent)
  const alignedRight = rescaleExactAmount(parsedRight, exponent)
  return alignedLeft === undefined || alignedRight === undefined ? undefined : { left: alignedLeft, right: alignedRight }
}

export function parseDecimalExactAmount(currency: unknown, decimalAmount: unknown, exponent: unknown): ExactAmount | undefined {
  const targetExponent = readExponent(exponent)
  if (targetExponent === undefined || typeof decimalAmount !== 'string' || !decimalNotation.test(decimalAmount)) return undefined
  let parsedCurrency: string
  try {
    const currencyResult = currencySchema.safeParse(currency)
    if (!currencyResult.success) return undefined
    parsedCurrency = currencyResult.data
  } catch {
    return undefined
  }
  const fractionalDigits = decimalAmount.split('.')[1] ?? ''
  if (/[1-9]/.test(fractionalDigits.slice(targetExponent))) return undefined
  try {
    const units = convertToTokenAmount(decimalAmount, targetExponent)
    return exactAmountSchema.parse({ currency: parsedCurrency, units, exponent: targetExponent })
  } catch {
    return undefined
  }
}

export function rescaleExactAmount(amount: unknown, targetExponent: unknown): ExactAmount | undefined {
  const parsed = readExactAmount(amount)
  const exponent = readExponent(targetExponent)
  if (parsed === undefined || exponent === undefined) return undefined
  if (parsed.exponent === exponent) return parsed
  if (exponent > parsed.exponent) {
    const factor = 10n ** BigInt(exponent - parsed.exponent)
    return { currency: parsed.currency, units: (BigInt(parsed.units) * factor).toString(), exponent }
  }
  const divisor = 10n ** BigInt(parsed.exponent - exponent)
  const units = BigInt(parsed.units)
  if (units % divisor !== 0n) return undefined
  return { currency: parsed.currency, units: (units / divisor).toString(), exponent }
}

export function compareExactAmounts(left: unknown, right: unknown): -1 | 0 | 1 | undefined {
  const aligned = alignExactAmounts(left, right)
  if (aligned === undefined) return undefined
  const leftUnits = BigInt(aligned.left.units)
  const rightUnits = BigInt(aligned.right.units)
  return leftUnits < rightUnits ? -1 : leftUnits > rightUnits ? 1 : 0
}

export function addExactAmounts(left: unknown, right: unknown): ExactAmount | undefined {
  const aligned = alignExactAmounts(left, right)
  if (aligned === undefined) return undefined
  return { currency: aligned.left.currency, units: (BigInt(aligned.left.units) + BigInt(aligned.right.units)).toString(), exponent: aligned.left.exponent }
}

export function subtractExactAmounts(left: unknown, right: unknown): ExactAmount | undefined {
  const aligned = alignExactAmounts(left, right)
  if (aligned === undefined) return undefined
  const units = BigInt(aligned.left.units) - BigInt(aligned.right.units)
  if (units < 0n) return undefined
  return { currency: aligned.left.currency, units: units.toString(), exponent: aligned.left.exponent }
}

export function multiplyExactAmountByBps(amount: unknown, bps: unknown, rounding: 'floor' | 'ceil'): ExactAmount | undefined {
  const parsed = readExactAmount(amount)
  if (parsed === undefined || typeof bps !== 'number' || !Number.isInteger(bps) || bps < 0 || bps > 10_000) return undefined
  if (rounding !== 'floor' && rounding !== 'ceil') return undefined
  const product = BigInt(parsed.units) * BigInt(bps)
  const divisor = 10_000n
  const units = rounding === 'floor' ? product / divisor : (product + divisor - 1n) / divisor
  return { currency: parsed.currency, units: units.toString(), exponent: parsed.exponent }
}

export function formatExactAmount(amount: unknown): string | undefined {
  const parsed = readExactAmount(amount)
  if (parsed === undefined) return undefined
  if (parsed.exponent === 0) return parsed.units
  const padded = parsed.units.padStart(parsed.exponent + 1, '0')
  const splitAt = padded.length - parsed.exponent
  const integerPart = padded.slice(0, splitAt)
  const fractionalPart = padded.slice(splitAt)
  return fractionalPart.length === 0 ? integerPart : `${integerPart}.${fractionalPart}`
}

export function formatCurrencyAmount(amount: ExactAmount): string {
  return `${amount.currency} ${formatExactAmount(amount) ?? '—'}`
}
