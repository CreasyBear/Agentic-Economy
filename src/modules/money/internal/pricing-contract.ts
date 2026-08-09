import { z } from 'zod'

import { exactAmountSchema } from './exact-amount'
export { currencySchema, exactAmountSchema } from './exact-amount'
export type { ExactAmount } from './exact-amount'

export const moneyRefSchema = z.string().trim().min(1).max(500)

const freeTierSchema = z.strictObject({
  maxCalls: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  window: z.enum(['day', 'month']),
})

export const pricingConfigSchema = z.strictObject({
  version: z.literal('pricing:v2'),
  unit: z.literal('call'),
  paidAmount: exactAmountSchema,
  freeTier: freeTierSchema.optional(),
})

export type PricingConfig = z.infer<typeof pricingConfigSchema>
export type PricingConfigInput = z.input<typeof pricingConfigSchema>
