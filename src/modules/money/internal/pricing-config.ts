import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  addExactAmounts,
  compareExactAmounts,
  exactAmountSchema,
  multiplyExactAmountByBps,
  subtractExactAmounts,
} from './exact-amount'
import { pricingConfigSchema } from './pricing-contract'
import type { ExactAmount } from './exact-amount'
import type { PricingConfig, PricingResolution, RakeConfig, RakeSplit } from '../public'

export type ProviderFeeBreakdown = Readonly<{
  providerAmount: ExactAmount
  platformFee: ExactAmount
  totalAmount: ExactAmount
  feeBps: number
}>

type ProviderFeeBreakdownRefusal = Readonly<{
  kind: 'refused'
  code: 'rake_not_configured'
}>

export type NormalizePricingConfigResult =
  | Readonly<{ kind: 'valid'; config: PricingConfig }>
  | Readonly<{ kind: 'invalid'; code: 'pricing_config_invalid' }>

export type ResolveInvocationPriceInput = Readonly<{
  config: PricingConfig | unknown
  freeCallsUsed: number
  priceDigest: string
  expectedCurrency?: string
}>

export function computeProviderFeeBreakdown(
  providerAmount: unknown,
  feeBps = 1_000,
): ProviderFeeBreakdown | ProviderFeeBreakdownRefusal {
  const parsedProvider = exactAmountSchema.safeParse(providerAmount)
  if (
    !parsedProvider.success
    || !Number.isSafeInteger(feeBps)
    || feeBps < 0
    || feeBps > 10_000
  ) return { kind: 'refused', code: 'rake_not_configured' }
  const platformFee = multiplyExactAmountByBps(parsedProvider.data, feeBps, 'ceil')
  const totalAmount = platformFee === undefined
    ? undefined
    : addExactAmounts(parsedProvider.data, platformFee)
  if (platformFee === undefined || totalAmount === undefined) {
    return { kind: 'refused', code: 'rake_not_configured' }
  }
  return {
    providerAmount: parsedProvider.data,
    platformFee,
    totalAmount,
    feeBps,
  }
}

export function normalizePricingConfig(config: unknown): NormalizePricingConfigResult {
  try {
    const parsed = pricingConfigSchema.safeParse(config)
    if (!parsed.success) return { kind: 'invalid', code: 'pricing_config_invalid' }
    const hasProviderAmount = parsed.data.providerAmount !== undefined
    const hasPlatformFee = parsed.data.platformFee !== undefined
    if (hasProviderAmount !== hasPlatformFee) {
      return { kind: 'invalid', code: 'pricing_config_invalid' }
    }
    if (hasProviderAmount && hasPlatformFee) {
      const providerAmount = parsed.data.providerAmount
      const platformFee = parsed.data.platformFee
      if (providerAmount === undefined || platformFee === undefined) {
        return { kind: 'invalid', code: 'pricing_config_invalid' }
      }
      const breakdown = computeProviderFeeBreakdown(providerAmount)
      if (
        'kind' in breakdown
        || providerAmount.currency !== parsed.data.paidAmount.currency
        || providerAmount.exponent !== parsed.data.paidAmount.exponent
        || platformFee.currency !== parsed.data.paidAmount.currency
        || platformFee.exponent !== parsed.data.paidAmount.exponent
        || breakdown.providerAmount.currency !== providerAmount.currency
        || breakdown.providerAmount.exponent !== providerAmount.exponent
        || compareExactAmounts(providerAmount, breakdown.providerAmount) !== 0
        || compareExactAmounts(platformFee, breakdown.platformFee) !== 0
        || compareExactAmounts(parsed.data.paidAmount, breakdown.totalAmount) !== 0
      ) return { kind: 'invalid', code: 'pricing_config_invalid' }
    }
    return { kind: 'valid', config: parsed.data }
  } catch {
    return { kind: 'invalid', code: 'pricing_config_invalid' }
  }
}

export function pricingConfigDigest(config: PricingConfig): string {
  const normalized = normalizePricingConfig(config)
  if (normalized.kind === 'invalid') return 'invalid'
  return canonicalDigest(normalized.config)
}

export function resolveInvocationPrice(input: ResolveInvocationPriceInput): PricingResolution {
  const normalized = normalizePricingConfig(input.config)
  if (normalized.kind === 'invalid') return { kind: 'refused', code: 'pricing_config_invalid' }
  const config = normalized.config
  if (input.expectedCurrency !== undefined && input.expectedCurrency !== config.paidAmount.currency) {
    return { kind: 'refused', code: 'currency_mismatch' }
  }
  if (!Number.isSafeInteger(input.freeCallsUsed) || input.freeCallsUsed < 0) {
    return { kind: 'refused', code: 'pricing_config_invalid' }
  }
  const freeAmount: ExactAmount = { currency: config.paidAmount.currency, units: '0', exponent: config.paidAmount.exponent }
  if (config.paidAmount.units === '0') {
    return { kind: 'free', reason: 'zero_price', amount: freeAmount, priceDigest: input.priceDigest }
  }
  const freeTier = config.freeTier
  if (freeTier !== undefined && input.freeCallsUsed < freeTier.maxCalls) {
    return { kind: 'free', reason: 'free_tier', amount: freeAmount, priceDigest: input.priceDigest }
  }
  return { kind: 'paid', amount: config.paidAmount, priceDigest: input.priceDigest }
}

export function computeRakeSplit(grossAmount: ExactAmount, config: RakeConfig | unknown): RakeSplit | Readonly<{ kind: 'refused'; code: 'rake_not_configured' }> {
  try {
    const parsedGross = exactAmountSchema.safeParse(grossAmount)
    const rakeBps = typeof config === 'object' && config !== null && 'rakeBps' in config ? config.rakeBps : undefined
    if (!parsedGross.success || typeof rakeBps !== 'number' || !Number.isSafeInteger(rakeBps) || rakeBps < 0 || rakeBps > 10_000) {
      return { kind: 'refused', code: 'rake_not_configured' }
    }
    const rake = multiplyExactAmountByBps(parsedGross.data, rakeBps, 'floor')
    const providerNet = rake === undefined ? undefined : subtractExactAmounts(parsedGross.data, rake)
    if (rake === undefined || providerNet === undefined) return { kind: 'refused', code: 'rake_not_configured' }
    return { grossAmount: parsedGross.data, rakeBps, rake, providerNet }
  } catch {
    return { kind: 'refused', code: 'rake_not_configured' }
  }
}
