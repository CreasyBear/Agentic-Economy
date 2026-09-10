import {
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

