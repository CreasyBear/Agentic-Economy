import { x402Client } from '@x402/core/client'
import {
  decodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  x402HTTPClient,
} from '@x402/core/http'
import { validatePaymentRequired, type PaymentRequired as X402SchemaPaymentRequired } from '@x402/core/schemas'
import type { PaymentRequired, SettleResponse } from '@x402/core/types'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { appendPaymentIdentifierToExtensions, extractPaymentIdentifier, isPaymentIdentifierExtension } from '@x402/extensions/payment-identifier'
import { privateKeyToAccount } from 'viem/accounts'

import { isRecord } from '@/modules/common/is-record'

import type { X402PaymentSignatureRequest } from '../route-transport-runtime'

export type X402ValidatedPaymentRequired = X402SchemaPaymentRequired
export type X402PaymentRequired = PaymentRequired & Readonly<{ x402Version: 2 }>
export type X402SettlementStatus = 'settled' | 'not_settled' | 'unknown'
export type X402SettlementResponse = Readonly<{
  success: boolean
  transaction: string
  network: string
  amount?: string
  payer?: string
  errorReason?: string
  errorMessage?: string
}>
export type X402SettlementEvidence =
  | Readonly<{ kind: 'not_submitted' }>
  | Readonly<{
      kind: 'settled' | 'not_settled'
      response: X402SettlementResponse
      digest: string
    }>
  | Readonly<{
      kind: 'unknown'
      reason: string
      response?: X402SettlementResponse
      digest?: string
    }>

const paymentResponseClient = new x402HTTPClient(new x402Client())
const MAX_SETTLEMENT_FIELD_LENGTH = 4_096


export function encodeX402PaymentRequiredHeader(paymentRequired: X402PaymentRequired): string {
  return encodePaymentRequiredHeader(paymentRequired)
}

export function decodeX402PaymentRequiredHeader(header: string): unknown {
  return decodePaymentRequiredHeader(header)
}

export function decodeX402PaymentResponseHeader(header: string): unknown {
  return paymentResponseClient.getPaymentSettleResponse((name) =>
    name === 'PAYMENT-RESPONSE' || name === 'X-PAYMENT-RESPONSE'
      ? header
      : null,
  )
}

/**
 * @x402/core 2.18 exposes the SettleResponse type and HTTP decoder but does
 * not export its internal runtime schema. Keep this boundary guard limited to
 * the official fields and bounded material; unknown extension data is ignored.
 */
export function normalizeX402PaymentResponse(
  value: unknown,
): X402SettlementResponse | undefined {
  if (
    !isRecord(value)
    || typeof value.success !== 'boolean'
    || !boundedString(value.transaction, MAX_SETTLEMENT_FIELD_LENGTH)
    || !boundedString(value.network, 256)
    || !isX402Network(value.network)
  )
    return undefined
  for (const key of ['payer', 'amount', 'errorReason', 'errorMessage'] as const) {
    const candidate = value[key]
    if (
      candidate !== undefined
      && candidate !== null
      && !boundedString(candidate, MAX_SETTLEMENT_FIELD_LENGTH)
    )
      return undefined
  }
  for (const key of ['extensions', 'extra'] as const) {
    const candidate = value[key]
    if (candidate !== undefined && candidate !== null && !isRecord(candidate))
      return undefined
  }
  const response: SettleResponse = {
    success: value.success,
    transaction: value.transaction,
    network: value.network as SettleResponse['network'],
    ...(typeof value.amount === 'string' ? { amount: value.amount } : {}),
    ...(typeof value.payer === 'string' ? { payer: value.payer } : {}),
    ...(typeof value.errorReason === 'string'
      ? { errorReason: value.errorReason }
      : {}),
    ...(typeof value.errorMessage === 'string'
      ? { errorMessage: value.errorMessage }
      : {}),
  }
  return response
}

export function readX402PaymentResponseHeader(
  header: string,
): X402SettlementResponse | undefined {
  try {
    return normalizeX402PaymentResponse(
      decodeX402PaymentResponseHeader(header),
    )
  } catch {
    return undefined
  }
}

/**
 * Validates a PaymentRequired (402 challenge) document against the installed @x402 core schema.
 * Throws (zod error) when the document is not a valid V1/V2 PaymentRequired. This is the ONLY
 * admission-side @x402 protocol-SDK call site; the quarantine boundary keeps protocol imports in
 * this reviewed adapter file.
 */
export function validateX402PaymentRequired(value: unknown): X402ValidatedPaymentRequired {
  return validatePaymentRequired(value)
}

const privateKeyPattern = /^0x[0-9a-fA-F]{64}$/

export async function createEvmX402PaymentSignature(
  request: X402PaymentSignatureRequest,
): Promise<string | undefined> {
  if (!privateKeyPattern.test(request.credential)) return undefined
  try {
    const extensions = structuredClone(request.challenge.extensions ?? {})
    const paymentIdentifierExtension = extensions['payment-identifier']
    if (!isPaymentIdentifierExtension(paymentIdentifierExtension))
      return undefined
    const identifier = paymentIdentifier(request.paymentIdentifier)
    appendPaymentIdentifierToExtensions(extensions, identifier)
    const required: X402PaymentRequired = {
      x402Version: request.challenge.x402Version,
      resource: { ...request.challenge.resource },
      accepts: [{
        ...request.selectedRequirement,
        extra: { ...request.selectedRequirement.extra },
      }],
      extensions,
    }
    const signer = privateKeyToAccount(request.credential as `0x${string}`)
    const core = new x402Client().register(
      request.selectedRequirement.network,
      new ExactEvmScheme(signer),
    )
    const client = new x402HTTPClient(core)
    const payload = await client.createPaymentPayload(required)
    const header = client.encodePaymentSignatureHeader(payload)['PAYMENT-SIGNATURE']
    return extractPaymentIdentifier(payload) === identifier ? header : undefined
  } catch {
    return undefined
  }
}

function boundedString(value: unknown, max: number): value is string {
  return (
    typeof value === 'string'
    && value.trim().length > 0
    && value.length <= max
  )
}

function isX402Network(value: string): value is SettleResponse['network'] {
  return /^[^:]+:[^:]+$/.test(value)
}
export function readX402PaymentPayer(
  paymentSignature: string,
): string | undefined {
  try {
    const payload = decodePaymentSignatureHeader(paymentSignature)
    if (!isRecord(payload.payload)) return undefined
    const authorization = payload.payload.authorization
    if (isRecord(authorization) && boundedString(authorization.from, 256))
      return authorization.from
    const permit2Authorization = payload.payload.permit2Authorization
    if (
      isRecord(permit2Authorization)
      && boundedString(permit2Authorization.from, 256)
    )
      return permit2Authorization.from
  } catch {
    return undefined
  }
  return undefined
}

function paymentIdentifier(operationKeyDigest: string): string {
  const normalized = `ae_${operationKeyDigest.replace(/[^A-Za-z0-9_-]/g, '_')}`
  return normalized.slice(0, 128).padEnd(16, '_')
}
