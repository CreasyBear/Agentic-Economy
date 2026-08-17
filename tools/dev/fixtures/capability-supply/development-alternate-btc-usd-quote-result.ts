import { z } from 'zod'

import {
  projectBtcUsdQuoteResult,
  type BtcUsdQuoteProjectionDecision,
} from './btc-usd-quote-result'

const isoTimestamp = z.iso.datetime({ offset: true })
const plainPositiveDecimal = z.string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .refine((value) => {
    const amount = Number(value)
    return Number.isFinite(amount) && amount > 0
  })

const alternateProviderPayloadSchema = z.strictObject({
  spot: z.strictObject({
    base: z.literal('BTC'),
    quote: z.literal('USD'),
    amount: plainPositiveDecimal,
    observed_at: isoTimestamp,
  }),
})

export const developmentAlternateBtcUsdQuoteSource = {
  providerId: 'mock:business:alternate-quote-api',
  operationId: 'btc-usd.spot',
  operationRevision: 3,
} as const

/**
 * Operation-owned interpretation of the labelled alternate provider fixture.
 * Its raw response shape does not escape this adapter.
 */
export function projectDevelopmentAlternateBtcUsdQuoteResult(input: Readonly<{
  payload: unknown
  receivedAt: string
}>): BtcUsdQuoteProjectionDecision {
  return projectBtcUsdQuoteResult(input, (payload) => {
    const parsed = alternateProviderPayloadSchema.safeParse(payload)
    return parsed.success
      ? { price: Number(parsed.data.spot.amount), observedAt: parsed.data.spot.observed_at }
      : undefined
  }, developmentAlternateBtcUsdQuoteSource)
}
