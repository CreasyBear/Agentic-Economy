import { z } from 'zod'

export { currencySchema, exactAmountSchema } from './exact-amount'
export type { ExactAmount } from './exact-amount'

export const moneyRefSchema = z.string().trim().min(1).max(500)

export const pricingConfigSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    version: z.literal('pricing:v3'),
    kind: z.literal('fixed_aud'),
    currency: z.literal('AUD'),
    exponent: z.literal(6),
    amountUnits: z.string().regex(/^(?:0|[1-9]\d*)$/u),
  }),
  z.strictObject({
    version: z.literal('pricing:v3'),
    kind: z.literal('managed_x402'),
    effectTiming: z.literal('payment_required_before_effect'),
    sourceRequirement: z.strictObject({
      network: z.string().trim().min(1).max(200),
      asset: z.string().trim().min(1).max(200),
      atomicUnits: z.string().regex(/^[1-9]\d*$/u),
    }),
    pricingPolicyRef: moneyRefSchema,
    publicDisplay: z.literal('on_request'),
  }),
])

export type PricingConfig = z.infer<typeof pricingConfigSchema>
export type PricingConfigInput = z.input<typeof pricingConfigSchema>
