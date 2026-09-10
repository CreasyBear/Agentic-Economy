import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  exactAmountSchema,
  multiplyExactAmountByBps,
  subtractExactAmounts,
} from './exact-amount'
import { pricingConfigSchema } from './pricing-contract'
import type { ExactAmount } from './exact-amount'
import type { PricingConfig, PricingResolution, RakeConfig, RakeSplit } from '../public'

export type NormalizePricingConfigResult =
  | Readonly<{ kind: 'valid'; config: PricingConfig }>
  | Readonly<{ kind: 'invalid'; code: 'pricing_config_invalid' }>

export type ResolveCallPriceInput = Readonly<{
  config: PricingConfig | unknown
  freeCallsUsed: number
  priceDigest: string
  expectedCurrency?: string
}>

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

/**
 * Display-only price shape for catalogue presentation. Mirrors the
 * `capabilityOfferings.presentation.price` union (see
 * `src/modules/capability-supply/internal/convex-schema.ts`), redefined here
 * because `money` cannot import from `capability-supply`
 * (`src/modules/module-boundaries.ts`). Callers there should point their
 * `price` field type at this `DisplayPrice` instead of redeclaring it.
 */
export type DisplayPrice =
  | Readonly<{ kind: 'fixed'; amount: ExactAmount }>
  | Readonly<{ kind: 'range'; minimum: ExactAmount; maximum: ExactAmount }>
  | Readonly<{ kind: 'on_request' }>

/**
 * Derives the catalogue display price from the pricing config Quote actually
 * reads (`normalizePricingConfig`). `fixed_aud` has a single exact amount, so
 * it maps to `fixed`; every other (metered/unknown) variant is `on_request`
 * until a tiered `PricingConfig` variant exists to populate `range`.
 */
export function displayPriceFromPricingConfig(config: PricingConfig): DisplayPrice {
  const amount = pricingConfigDecisionAmount(config)
  return amount === undefined ? { kind: 'on_request' } : { kind: 'fixed', amount }
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
