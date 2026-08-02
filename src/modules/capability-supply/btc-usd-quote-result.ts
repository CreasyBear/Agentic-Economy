import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type {
  PaidOperationPresentationBlock,
  PaidOperationResultDelivery,
} from '@/modules/action-invocation'

const isoTimestamp = z.iso.datetime({ offset: true })
const finitePositivePrice = z.number().finite().positive()

const providerPayloadSchema = z.strictObject({
  data: z.strictObject({
    BTC: z.strictObject({
      symbol: z.literal('BTC'),
      quote: z.strictObject({
        USD: z.strictObject({
          price: finitePositivePrice,
          last_updated: isoTimestamp,
        }),
      }),
    }),
  }),
})

export const developmentBtcUsdQuoteSource = {
  providerId: 'mock:business:published-api',
  operationId: 'cryptocurrency.quotes.latest',
  operationRevision: 7,
} as const

export type BtcUsdQuoteResult = Readonly<{
  base: 'BTC'
  quote: 'USD'
  price: number
  source: Readonly<{
    providerId: string
    operationId: string
    operationRevision: number
  }>
  observedAt: string
  receivedAt: string
  freshness: 'fresh' | 'stale' | 'unknown'
  rawEvidenceRef: string
}>

export type BtcUsdQuoteProjectionDecision =
  | Readonly<{ kind: 'accepted'; result: BtcUsdQuoteResult }>
  | Readonly<{
    kind: 'refused'
    code:
      | 'btc_usd_quote_payload_invalid'
      | 'btc_usd_quote_received_at_invalid'
      | 'btc_usd_quote_observed_after_receipt'
  }>

const DEVELOPMENT_QUOTE_FRESHNESS_MS = 300_000

type ParsedBtcUsdQuote = Readonly<{ price: number; observedAt: string }>

export function projectBtcUsdQuoteResult(input: Readonly<{
  payload: unknown
  receivedAt: string
}>, parsePayload: (payload: unknown) => ParsedBtcUsdQuote | undefined, source: BtcUsdQuoteResult['source']): BtcUsdQuoteProjectionDecision {
  const parsedPayload = parsePayload(input.payload)
  if (parsedPayload === undefined) {
    return { kind: 'refused', code: 'btc_usd_quote_payload_invalid' }
  }
  const receivedAt = isoTimestamp.safeParse(input.receivedAt)
  if (!receivedAt.success) {
    return { kind: 'refused', code: 'btc_usd_quote_received_at_invalid' }
  }

  const observedTime = Date.parse(parsedPayload.observedAt)
  const receivedTime = Date.parse(receivedAt.data)
  if (observedTime > receivedTime) {
    return { kind: 'refused', code: 'btc_usd_quote_observed_after_receipt' }
  }

  return {
    kind: 'accepted',
    result: {
      base: 'BTC',
      quote: 'USD',
      price: parsedPayload.price,
      source,
      observedAt: parsedPayload.observedAt,
      receivedAt: receivedAt.data,
      freshness: receivedTime - observedTime <= DEVELOPMENT_QUOTE_FRESHNESS_MS ? 'fresh' : 'stale',
      rawEvidenceRef: canonicalDigest(input.payload as StableHashValue),
    },
  }
}


/**
 * Operation-owned interpretation of the labelled Phase 3A provider fixture.
 *
 * The provider payload stays behind this adapter. Shared hosts receive only the
 * normalized result and a digest reference to the raw evidence.
 */
export function projectDevelopmentBtcUsdQuoteResult(input: Readonly<{
  payload: unknown
  receivedAt: string
}>): BtcUsdQuoteProjectionDecision {
  return projectBtcUsdQuoteResult(input, (payload) => {
    const parsed = providerPayloadSchema.safeParse(payload)
    return parsed.success
      ? { price: parsed.data.data.BTC.quote.USD.price, observedAt: parsed.data.data.BTC.quote.USD.last_updated }
      : undefined
  }, developmentBtcUsdQuoteSource)
}

/**
 * Operation-owned adapter into the query-agnostic paid-operation vocabulary.
 * The shared renderer never learns the provider payload shape or BTC schema.
 */
export function presentDevelopmentBtcUsdQuoteResult(
  result: BtcUsdQuoteResult,
): Readonly<{
  presentationBlocks: readonly PaidOperationPresentationBlock[]
  resultDelivery: PaidOperationResultDelivery
}> {
  const source: PaidOperationPresentationBlock = {
    kind: 'source',
    label: 'Provider',
    providerId: result.source.providerId,
    providerName: 'Development Quote Provider',
    operationRevision: String(result.source.operationRevision),
  }
  return {
    presentationBlocks: [
      { kind: 'text', label: 'Pair', value: `${result.base}/${result.quote}` },
      source,
    ],
    resultDelivery: {
      state: 'valid',
      blocks: [
        {
          kind: 'measurement',
          label: `${result.base} price`,
          value: result.price,
          unit: `${result.quote}/${result.base}`,
        },
        { kind: 'timestamp', label: 'Observed', value: result.observedAt },
        { kind: 'timestamp', label: 'Received', value: result.receivedAt },
        {
          kind: 'status',
          label: 'Freshness',
          value: result.freshness,
          tone: result.freshness === 'fresh' ? 'positive' : 'caution',
        },
        { kind: 'reference', label: 'Raw evidence', value: result.rawEvidenceRef },
        source,
      ],
      evidenceRefs: [result.rawEvidenceRef],
    },
  }
}
