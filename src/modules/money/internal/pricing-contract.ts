import { z } from 'zod'

export const moneyRefSchema = z.string().trim().min(1).max(500)
export const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/)
export const minorAmountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const freeTierSchema = z.strictObject({
  maxCalls: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  window: z.enum(['day', 'month']),
})

export const pricingConfigSchema = z.strictObject({
  version: z.literal('pricing:v1'),
  unit: z.literal('call'),
  currency: currencySchema,
  paidAmountMinor: minorAmountSchema,
  freeTier: freeTierSchema.optional(),
})

export type PricingConfig = z.infer<typeof pricingConfigSchema>
export type PricingConfigInput = z.input<typeof pricingConfigSchema>
