import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  pricingConfigSchema,
} from './pricing-contract'
import type { PricingConfig, PricingResolution, RakeConfig, RakeSplit } from '../public'

export type NormalizePricingConfigResult =
  | Readonly<{ kind: 'valid'; config: PricingConfig }>
  | Readonly<{ kind: 'invalid'; code: 'pricing_config_invalid' }>

export type ResolveInvocationPriceInput = Readonly<{
  config: PricingConfig | unknown
  freeCallsUsed: number
  priceDigest: string
  expectedCurrency?: string
}>

const maxSafe = Number.MAX_SAFE_INTEGER

export function normalizePricingConfig(config: unknown): NormalizePricingConfigResult {
  const parsed = pricingConfigSchema.safeParse(config)
  if (!parsed.success) return { kind: 'invalid', code: 'pricing_config_invalid' }
  return { kind: 'valid', config: parsed.data }
}

export function pricingConfigDigest(config: PricingConfig): string {
  const normalized = normalizePricingConfig(config)
  if (normalized.kind === 'invalid') return 'invalid'
  const stableConfig = normalized.config.freeTier === undefined
    ? {
        version: normalized.config.version,
        unit: normalized.config.unit,
        currency: normalized.config.currency,
        paidAmountMinor: normalized.config.paidAmountMinor,
      }
    : {
        version: normalized.config.version,
        unit: normalized.config.unit,
        currency: normalized.config.currency,
        paidAmountMinor: normalized.config.paidAmountMinor,
        freeTier: {
          maxCalls: normalized.config.freeTier.maxCalls,
          window: normalized.config.freeTier.window,
        },
      }
  return canonicalDigest(stableConfig)
}

export function resolveInvocationPrice(input: ResolveInvocationPriceInput): PricingResolution {
  const normalized = normalizePricingConfig(input.config)
  if (normalized.kind === 'invalid') return { kind: 'refused', code: 'pricing_config_invalid' }
  const config = normalized.config
  if (input.expectedCurrency !== undefined && input.expectedCurrency !== config.currency) {
    return { kind: 'refused', code: 'currency_mismatch' }
  }
  if (!Number.isSafeInteger(input.freeCallsUsed) || input.freeCallsUsed < 0) {
    return { kind: 'refused', code: 'pricing_config_invalid' }
  }
  if (config.paidAmountMinor === 0) {
    return { kind: 'free', reason: 'zero_price', currency: config.currency, amountMinor: 0, priceDigest: input.priceDigest }
  }
  const freeTier = config.freeTier
  if (freeTier !== undefined && input.freeCallsUsed < freeTier.maxCalls) {
    return { kind: 'free', reason: 'free_tier', currency: config.currency, amountMinor: 0, priceDigest: input.priceDigest }
  }
  return { kind: 'paid', currency: config.currency, amountMinor: config.paidAmountMinor, priceDigest: input.priceDigest }
}

export function computeRakeSplit(grossAmountMinor: number, config: RakeConfig): RakeSplit | Readonly<{ kind: 'refused'; code: 'rake_not_configured' }> {
  if (!Number.isSafeInteger(grossAmountMinor) || grossAmountMinor < 0) {
    return { kind: 'refused', code: 'rake_not_configured' }
  }
  if (!Number.isSafeInteger(config.rakeBps) || config.rakeBps < 0 || config.rakeBps > 10_000) {
    return { kind: 'refused', code: 'rake_not_configured' }
  }
  const multiplied = grossAmountMinor * config.rakeBps
  if (!Number.isSafeInteger(multiplied)) return { kind: 'refused', code: 'rake_not_configured' }
  const rakeMinor = Math.floor(multiplied / 10_000)
  const providerNetMinor = grossAmountMinor - rakeMinor
  if (!Number.isSafeInteger(providerNetMinor) || providerNetMinor < 0) {
    return { kind: 'refused', code: 'rake_not_configured' }
  }
  return { grossAmountMinor, rakeBps: config.rakeBps, rakeMinor, providerNetMinor }
}


