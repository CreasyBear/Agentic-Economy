import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  addExactAmounts,
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

export type ResolveCallPriceInput = Readonly<{
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

export function resolveCallPrice(input: ResolveCallPriceInput): PricingResolution {
  const normalized = normalizePricingConfig(input.config)
  if (normalized.kind === 'invalid') return { kind: 'refused', code: 'pricing_config_invalid' }
  const config = normalized.config
  if (config.kind !== 'fixed_aud') {
    return { kind: 'refused', code: 'price_unavailable' }
  }
  const amount: ExactAmount = {
    currency: config.currency,
    exponent: config.exponent,
    units: config.amountUnits,
  }
  if (input.expectedCurrency !== undefined && input.expectedCurrency !== amount.currency) {
    return { kind: 'refused', code: 'currency_mismatch' }
  }
  if (!Number.isSafeInteger(input.freeCallsUsed) || input.freeCallsUsed < 0) {
    return { kind: 'refused', code: 'pricing_config_invalid' }
  }
  const freeAmount: ExactAmount = { ...amount, units: '0' }
  if (amount.units === '0') {
    return { kind: 'free', reason: 'zero_price', amount: freeAmount, priceDigest: input.priceDigest }
  }
  return { kind: 'paid', amount, priceDigest: input.priceDigest }
}

export function pricingConfigDecisionAmount(config: PricingConfig): ExactAmount | undefined {
  return config.kind === 'fixed_aud'
    ? { currency: config.currency, exponent: config.exponent, units: config.amountUnits }
    : undefined
}

export function pricingConfigSourceAmount(config: PricingConfig): ExactAmount {
  return config.kind === 'managed_x402'
    ? {
        currency: 'USDC',
        exponent: 6,
        units: config.sourceRequirement.atomicUnits,
      }
    : { currency: config.currency, exponent: config.exponent, units: config.amountUnits }
}

export function fixedAudPricingConfig(amount: unknown): PricingConfig | undefined {
  const parsed = exactAmountSchema.safeParse(amount)
  return parsed.success
    && parsed.data.currency === 'AUD'
    && parsed.data.exponent === 6
    ? {
        version: 'pricing:v3',
        kind: 'fixed_aud',
        currency: 'AUD',
        exponent: 6,
        amountUnits: parsed.data.units,
      }
    : undefined
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
