import {
  computeRakeSplit,
  normalizePricingConfig,
  pricingConfigDigest,
  pricingConfigSchema,
  resolveInvocationPrice,
  type ExactAmount,
  type PricingConfig,
  type PricingResolution,
} from '@/modules/money/public'

export type SupplyPricingRefusal = 'price_unavailable' | 'pricing_config_invalid' | 'currency_mismatch'

export type PricingPreview = Readonly<{
  resolution: PricingResolution
  grossAmount: ExactAmount
  feeAmount: ExactAmount
  providerNetAmount: ExactAmount
  currency: string
  rakeBps: number
}>

export type PricingStepResult = Readonly<
  | { kind: 'ready'; config: PricingConfig; preview: PricingPreview }
  | { kind: 'refused'; reason: SupplyPricingRefusal }
>

export type PricingConfigPort = Readonly<{
  normalize: (input: unknown) => Readonly<{ kind: 'valid'; config: PricingConfig } | { kind: 'refused'; reason: SupplyPricingRefusal }>
  resolve: (input: Readonly<{ config: PricingConfig; freeCallsUsed: number; priceDigest?: string }>) => PricingStepResult
}>

export const DEFAULT_RAKE_BPS = 1000
export const defaultSupplyPricingConfig: PricingConfig = {
  version: 'pricing:v2',
  unit: 'call',
  paidAmount: { currency: 'AUD', units: '0', exponent: 2 },
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
    const grossAmount = resolution.amount
    const split = computeRakeSplit(grossAmount, { rakeBps: DEFAULT_RAKE_BPS })
    if ('kind' in split) return { kind: 'refused', reason: 'price_unavailable' }
    return {
      kind: 'ready', config: input.config,
      preview: {
        resolution, grossAmount, feeAmount: split.rake,
        providerNetAmount: split.providerNet, currency: grossAmount.currency, rakeBps: split.rakeBps,
      },
    }
  },
}

/** Named seam for development ordering; only the zero-price config is accepted. */
export const stubPricingConfigPort: PricingConfigPort = {
  normalize(input) {
    const parsed = pricingConfigSchema.safeParse(input)
    if (!parsed.success || parsed.data.paidAmount.units !== '0') return { kind: 'refused', reason: parsed.success ? 'price_unavailable' : 'pricing_config_invalid' }
    return { kind: 'valid', config: parsed.data }
  },
  resolve(input) {
    if (input.config.paidAmount.units !== '0') return { kind: 'refused', reason: 'price_unavailable' }
    return realPricingConfigPort.resolve(input)
  },
}

export function resolveSupplyPricing(
  config: unknown,
  options?: Readonly<{ freeCallsUsed?: number; priceDigest?: string }>,
): PricingStepResult {
  const resolved = realPricingConfigPort.normalize(config)
  if (resolved.kind === 'refused') return resolved
  return realPricingConfigPort.resolve({
    config: resolved.config,
    freeCallsUsed: options?.freeCallsUsed ?? 0,
    ...(options?.priceDigest === undefined ? {} : { priceDigest: options.priceDigest }),
  })
}
