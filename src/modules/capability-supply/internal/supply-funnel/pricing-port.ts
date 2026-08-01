import {
  computeRakeSplit,
  normalizePricingConfig,
  pricingConfigDigest,
  pricingConfigSchema,
  resolveInvocationPrice,
  type PricingConfig,
  type PricingResolution,
} from '@/modules/money/public'

export type SupplyPricingRefusal = 'price_unavailable' | 'pricing_config_invalid' | 'currency_mismatch'

export type PricingPreview = Readonly<{
  resolution: PricingResolution
  grossAmountMinor: number
  feeAmountMinor: number
  providerNetAmountMinor: number
  currency: string
  rakeBps: number
}>

export type PricingConfigPort = Readonly<{
  normalize: (input: unknown) => Readonly<{ kind: 'valid'; config: PricingConfig } | { kind: 'refused'; reason: SupplyPricingRefusal }>
  resolve: (input: Readonly<{ config: PricingConfig; freeCallsUsed: number; priceDigest?: string }>) => PricingStepResult
}>

type PricingStepResult = Readonly<{ kind: 'ready'; config: PricingConfig; preview: PricingPreview } | { kind: 'refused'; reason: SupplyPricingRefusal }>

export const DEFAULT_RAKE_BPS = 1000
export const defaultSupplyPricingConfig: PricingConfig = {
  version: 'pricing:v1', unit: 'call', currency: 'AUD', paidAmountMinor: 0,
}

export const realPricingConfigPort: PricingConfigPort = {
  normalize(input) {
    const parsed = normalizePricingConfig(input)
    return parsed.kind === 'valid' ? parsed : { kind: 'refused', reason: parsed.code }
  },
  resolve(input) {
    const priceDigest = input.priceDigest ?? pricingConfigDigest(input.config)
    const resolution = resolveInvocationPrice({ config: input.config, freeCallsUsed: input.freeCallsUsed, priceDigest })
    if (resolution.kind === 'refused') return { kind: 'refused', reason: resolution.code }
    const grossAmountMinor = resolution.amountMinor
    const split = computeRakeSplit(grossAmountMinor, { rakeBps: DEFAULT_RAKE_BPS })
    if (!('rakeMinor' in split)) return { kind: 'refused', reason: 'price_unavailable' }
    return {
      kind: 'ready', config: input.config,
      preview: {
        resolution, grossAmountMinor, feeAmountMinor: split.rakeMinor,
        providerNetAmountMinor: split.providerNetMinor, currency: resolution.currency, rakeBps: split.rakeBps,
      },
    }
  },
}

/** Named seam for development ordering; only the zero-price config is accepted. */
export const stubPricingConfigPort: PricingConfigPort = {
  normalize(input) {
    const parsed = pricingConfigSchema.safeParse(input)
    if (!parsed.success || parsed.data.paidAmountMinor !== 0) return { kind: 'refused', reason: parsed.success ? 'price_unavailable' : 'pricing_config_invalid' }
    return { kind: 'valid', config: parsed.data }
  },
  resolve(input) {
    if (input.config.paidAmountMinor !== 0) return { kind: 'refused', reason: 'price_unavailable' }
    return realPricingConfigPort.resolve(input)
  },
}
