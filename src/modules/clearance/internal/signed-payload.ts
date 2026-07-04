import type { StableHashValue } from '@/modules/common/stable-hash'

import type { ClearanceActionClass } from './clearance-schema'

export type StableHashObject = { readonly [key: string]: StableHashValue }

export const ClearanceGreenlightPayloadVersion = 'clearance-greenlight:v1' as const
export const ClearanceReceiptPayloadVersion = 'clearance-receipt:v1' as const

export type ClearanceGreenlightPayloadInput = Readonly<{
  principalId: string
  actionClass: ClearanceActionClass
  actionRef: string
  mandateId: string
  requestRef: string
  idempotencyKey: string
  issuedAt: number
  expiresAt: number
  payloadHash: string
}>

export type ClearanceReceiptPayloadInput = Readonly<{
  principalId: string
  actionClass: ClearanceActionClass
  actionRef: string
  mandateId: string
  requestRef: string
  greenlightRef: string
  receiptRef: string
  idempotencyKey: string
  outcome: 'accepted' | 'refused' | 'proof_gap' | 'expired'
  issuedAt: number
  payloadHash: string
  previousReceiptHash?: string | undefined
}>

export function buildClearanceGreenlightSigningPayload(
  input: ClearanceGreenlightPayloadInput,
): StableHashObject {
  return {
    version: ClearanceGreenlightPayloadVersion,
    recordKind: 'greenlight',
    principalId: input.principalId,
    actionClass: input.actionClass,
    actionRef: input.actionRef,
    mandateId: input.mandateId,
    requestRef: input.requestRef,
    idempotencyKey: input.idempotencyKey,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    payloadHash: input.payloadHash,
  }
}

export function buildClearanceReceiptSigningPayload(input: ClearanceReceiptPayloadInput): StableHashObject {
  return {
    version: ClearanceReceiptPayloadVersion,
    recordKind: 'receipt',
    principalId: input.principalId,
    actionClass: input.actionClass,
    actionRef: input.actionRef,
    mandateId: input.mandateId,
    requestRef: input.requestRef,
    greenlightRef: input.greenlightRef,
    receiptRef: input.receiptRef,
    idempotencyKey: input.idempotencyKey,
    outcome: input.outcome,
    issuedAt: input.issuedAt,
    payloadHash: input.payloadHash,
    ...(input.previousReceiptHash === undefined ? {} : { previousReceiptHash: input.previousReceiptHash }),
  }
}
