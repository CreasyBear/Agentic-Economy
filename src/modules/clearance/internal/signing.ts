import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'

import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import type { ClearanceSignaturePosture, ClearanceSignedRecordKind } from './clearance-schema'

export const ClearanceSigningVersion = 'clearance-signing:v1' as const
export const ClearanceSigningSecretEnvName = 'AE_CLEARANCE_SIGNING_SECRET' as const
export const ClearanceSigningKeyIdEnvName = 'AE_CLEARANCE_SIGNING_KEY_ID' as const

export const ClearanceSigningFailureReasonValues = [
  'missing_clearance_signing_secret',
  'missing_clearance_key_identity',
] as const
export type ClearanceSigningFailureReason = (typeof ClearanceSigningFailureReasonValues)[number]

export const ClearanceSignatureVerificationFailureReasonValues = [
  ...ClearanceSigningFailureReasonValues,
  'invalid_clearance_signature',
] as const
export type ClearanceSignatureVerificationFailureReason =
  (typeof ClearanceSignatureVerificationFailureReasonValues)[number]

export type ClearanceSigningPayload = StableHashValue

export type ClearanceSignedRecord = Readonly<{
  kind: 'signed'
  signaturePosture: Extract<ClearanceSignaturePosture, 'local_hmac'>
  keyIdentityRef: string
  signedAt: string
  signature: string
}>

export type ClearanceSigningProofGap = Readonly<{
  kind: 'proof_gap'
  reason: ClearanceSigningFailureReason
  signaturePosture: Extract<ClearanceSignaturePosture, 'local_hmac'>
  keyIdentityRef: string
}>

export type ClearanceSigningResult = ClearanceSignedRecord | ClearanceSigningProofGap

export type ClearanceSignatureVerification =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{
    kind: 'rejected'
    reason: ClearanceSignatureVerificationFailureReason
  }>

export function signClearanceRecord(input: {
  kind: ClearanceSignedRecordKind
  payload: ClearanceSigningPayload
  secret?: string | undefined
  keyIdentityRef: string
  signedAt: string
}): ClearanceSigningResult {
  const signingInput = normalizeSigningInputs(input.secret, input.keyIdentityRef)
  if (signingInput.kind === 'proof_gap') {
    return signingInput
  }

  return {
    kind: 'signed',
    signaturePosture: 'local_hmac',
    keyIdentityRef: input.keyIdentityRef,
    signedAt: input.signedAt,
    signature: clearanceHmacSignature({
      kind: input.kind,
      keyIdentityRef: input.keyIdentityRef,
      payload: input.payload,
      secret: signingInput.secret,
      signedAt: input.signedAt,
    }),
  }
}

export function verifyClearanceSignature(input: {
  kind: ClearanceSignedRecordKind
  payload: ClearanceSigningPayload
  secret?: string | undefined
  keyIdentityRef: string
  signedAt: string
  signature: string
}): ClearanceSignatureVerification {
  const signingInput = normalizeSigningInputs(input.secret, input.keyIdentityRef)
  if (signingInput.kind === 'proof_gap') {
    return {
      kind: 'rejected',
      reason: signingInput.reason,
    }
  }

  const expectedSignature = clearanceHmacSignature({
    kind: input.kind,
    keyIdentityRef: input.keyIdentityRef,
    payload: input.payload,
    secret: signingInput.secret,
    signedAt: input.signedAt,
  })

  if (!safeEqualHex(input.signature, expectedSignature)) {
    return { kind: 'rejected', reason: 'invalid_clearance_signature' }
  }

  return { kind: 'accepted' }
}

type NormalizedSigningInputs = ClearanceSigningProofGap | Readonly<{
  kind: 'ready'
  secret: string
}>

function normalizeSigningInputs(
  secret: string | undefined,
  keyIdentityRef: string,
): NormalizedSigningInputs {
  const trimmedSecret = secret?.trim()
  if (trimmedSecret === undefined || trimmedSecret.length === 0) {
    return {
      kind: 'proof_gap',
      reason: 'missing_clearance_signing_secret',
      signaturePosture: 'local_hmac',
      keyIdentityRef,
    }
  }

  if (keyIdentityRef.trim().length === 0) {
    return {
      kind: 'proof_gap',
      reason: 'missing_clearance_key_identity',
      signaturePosture: 'local_hmac',
      keyIdentityRef,
    }
  }

  return { kind: 'ready', secret: trimmedSecret }
}

function clearanceHmacSignature(input: {
  kind: ClearanceSignedRecordKind
  payload: ClearanceSigningPayload
  secret: string
  keyIdentityRef: string
  signedAt: string
}): string {
  const encoder = new TextEncoder()
  return bytesToHex(
    hmac(
      sha256,
      encoder.encode(input.secret),
      encoder.encode(stableStringify(clearanceSigningPayload(input))),
    ),
  )
}

function clearanceSigningPayload(input: {
  kind: ClearanceSignedRecordKind
  payload: ClearanceSigningPayload
  keyIdentityRef: string
  signedAt: string
}): StableHashValue {
  return {
    version: ClearanceSigningVersion,
    kind: input.kind,
    signaturePosture: 'local_hmac',
    keyIdentityRef: input.keyIdentityRef,
    signedAt: input.signedAt,
    payload: input.payload,
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function safeEqualHex(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length)
  let diff = left.length ^ right.length
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return diff === 0
}
