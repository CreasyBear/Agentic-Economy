import { z } from 'zod'

import { parseBoundedJson } from '@/modules/common/bounded-json'

import type { X402SettlementEvidence } from './x402-payment-signer'

export const MAX_RESPONSE_BYTES = 512 * 1024

export type RouteTransportObservation = Readonly<{
  transport: 'http' | 'mcp' | 'x402' | 'unknown'
  disposition: 'succeeded' | 'refused' | 'partial' | 'unknown'
  releaseStarted: boolean
  queryReleaseStatus?: 'not_released' | 'released' | 'unknown'
  paymentAuthorizationStatus?: 'not_created' | 'created' | 'unknown'
  paymentSubmissionStatus?:
    'not_submitted' | 'possibly_submitted' | 'observed' | 'unknown'
  settlementEvidence?: X402SettlementEvidence
  quoteDeliveryStatus?: 'not_delivered' | 'delivered' | 'unknown'
  requestDigest: string
  responseDigest?: string
  outputJson?: string
  providerReceipt?: string
  providerOfferDigest?: string
  paymentProof?: string
  paymentChallengeDigest?: string
  continuationToken?: string
  failureCode?: string
}>

export function boundedString(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= max
  )
}

export function transportKind(
  adapterId: string,
): RouteTransportObservation['transport'] {
  if (adapterId === 'http-json:v1') return 'http'
  if (adapterId === 'mcp-jsonrpc:v1') return 'mcp'
  if (adapterId === 'x402-fetch:v2') return 'x402'
  return 'unknown'
}

export function refused(
  transport: RouteTransportObservation['transport'],
  requestDigest: string,
  releaseStarted: boolean,
  failureCode: string,
): RouteTransportObservation {
  return {
    transport,
    disposition: 'refused',
    releaseStarted,
    requestDigest,
    failureCode,
  }
}

export function unknown(
  transport: RouteTransportObservation['transport'],
  requestDigest: string,
  releaseStarted: boolean,
  failureCode: string,
): RouteTransportObservation {
  return {
    transport,
    disposition: 'unknown',
    releaseStarted,
    requestDigest,
    failureCode,
  }
}

export function parseRouteTransportObservationJson(
  value: string,
): RouteTransportObservation | undefined {
  if (new TextEncoder().encode(value).byteLength > MAX_RESPONSE_BYTES)
    return undefined
  const bounded = (max: number) =>
    z.string().refine((text) => boundedString(text, max))
  const settlementResponse = z.strictObject({
    success: z.boolean(),
    transaction: bounded(4_096),
    network: bounded(256),
    amount: bounded(4_096).exactOptional(),
    payer: bounded(4_096).exactOptional(),
    errorReason: bounded(4_096).exactOptional(),
    errorMessage: bounded(4_096).exactOptional(),
  })
  const settlementEvidence = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('not_submitted') }),
    z.strictObject({
      kind: z.enum(['settled', 'not_settled']),
      response: settlementResponse,
      digest: bounded(200),
    }),
    z.strictObject({
      kind: z.literal('unknown'),
      reason: bounded(200),
      response: settlementResponse.exactOptional(),
      digest: bounded(200).exactOptional(),
    }),
  ])
  const observationSchema: z.ZodType<RouteTransportObservation> =
    z.strictObject({
      transport: z.enum(['http', 'mcp', 'x402', 'unknown']),
      disposition: z.enum(['succeeded', 'refused', 'partial', 'unknown']),
      releaseStarted: z.boolean(),
      queryReleaseStatus: z
        .enum(['not_released', 'released', 'unknown'])
        .exactOptional(),
      paymentAuthorizationStatus: z
        .enum(['not_created', 'created', 'unknown'])
        .exactOptional(),
      paymentSubmissionStatus: z
        .enum(['not_submitted', 'possibly_submitted', 'observed', 'unknown'])
        .exactOptional(),
      settlementEvidence: settlementEvidence.exactOptional(),
      quoteDeliveryStatus: z
        .enum(['not_delivered', 'delivered', 'unknown'])
        .exactOptional(),
      requestDigest: bounded(200),
      responseDigest: bounded(MAX_RESPONSE_BYTES).exactOptional(),
      outputJson: bounded(MAX_RESPONSE_BYTES).exactOptional(),
      providerReceipt: bounded(MAX_RESPONSE_BYTES).exactOptional(),
      providerOfferDigest: bounded(200).exactOptional(),
      paymentProof: bounded(MAX_RESPONSE_BYTES).exactOptional(),
      paymentChallengeDigest: bounded(MAX_RESPONSE_BYTES).exactOptional(),
      continuationToken: bounded(MAX_RESPONSE_BYTES).exactOptional(),
      failureCode: bounded(MAX_RESPONSE_BYTES).exactOptional(),
    })
  const parsed = observationSchema.safeParse(parseBoundedJson(value))
  return parsed.success ? parsed.data : undefined
}
