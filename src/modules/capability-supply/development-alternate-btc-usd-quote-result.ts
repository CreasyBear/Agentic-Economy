import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  BtcUsdQuoteProjectionDecision,
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

const DEVELOPMENT_QUOTE_FRESHNESS_MS = 300_000

/**
 * Operation-owned interpretation of the labelled alternate provider fixture.
 * Its raw response shape does not escape this adapter.
 */
export function projectDevelopmentAlternateBtcUsdQuoteResult(input: Readonly<{
  payload: unknown
  receivedAt: string
}>): BtcUsdQuoteProjectionDecision {
  const payload = alternateProviderPayloadSchema.safeParse(input.payload)
  if (!payload.success) {
    return { kind: 'refused', code: 'btc_usd_quote_payload_invalid' }
  }
  const receivedAt = isoTimestamp.safeParse(input.receivedAt)
  if (!receivedAt.success) {
    return { kind: 'refused', code: 'btc_usd_quote_received_at_invalid' }
  }

  const observedAt = payload.data.spot.observed_at
  const observedTime = Date.parse(observedAt)
  const receivedTime = Date.parse(receivedAt.data)
  if (observedTime > receivedTime) {
    return { kind: 'refused', code: 'btc_usd_quote_observed_after_receipt' }
  }

  return {
    kind: 'accepted',
    result: {
      base: 'BTC',
      quote: 'USD',
      price: Number(payload.data.spot.amount),
      source: developmentAlternateBtcUsdQuoteSource,
      observedAt,
      receivedAt: receivedAt.data,
      freshness:
        receivedTime - observedTime <= DEVELOPMENT_QUOTE_FRESHNESS_MS
          ? 'fresh'
          : 'stale',
      rawEvidenceRef: canonicalDigest(input.payload as StableHashValue),
    },
  }
}
