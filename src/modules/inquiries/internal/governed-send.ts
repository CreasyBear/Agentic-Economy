import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { constantTimeStringEqual } from '@/lib/server/constant-time'
import type { BusinessId, OfferingRef, OperationKey, OwnerId } from '@/modules/common/ids'
import { stableStringify } from '@/modules/common/stable-hash'
import type {
  GenericGovernedActionIntent,
  GovernedActionReceiptStorage,
} from '@/modules/governed-action/public'
import type { AdmissionProofClass } from './admission'
import { R1TargetAdmissionVersion } from './admission'
import type { InquiryCustomerAccessKeyring } from './customer-access'
import type { SubmitInquiryErrorCode } from './commands'
import type {
  InquiryOriginRef,
  InquiryTargetRef,
  InquiryThreadId,
  PublicInquiryContactInput,
} from './schema'

export const GOVERNED_SEND_ACTION_CLASS = 'inquiry.send:v1' as const
export const GOVERNED_SEND_SCHEMA_VERSION = 1 as const
export const GOVERNED_SEND_INTEGRITY_VERSION = 'governed-send-integrity:v1' as const

export type GovernedSendIntegrityKeyring = Readonly<{
  activeKeyId: string
  signingSecret: string
  verificationSecrets: Readonly<Record<string, string>>
}>

export function resolveGovernedSendIntegrityKeyring(
  environment: Readonly<Record<string, string | undefined>>,
): GovernedSendIntegrityKeyring {
  const signingSecret = environment.AE_GOVERNED_SEND_INTEGRITY_SECRET?.trim()
  if (signingSecret === undefined || signingSecret.length < 32) {
    throw new Error('AE_GOVERNED_SEND_INTEGRITY_SECRET must contain at least 32 characters.')
  }
  const derivedKeyId = `governed-send-integrity-sha256-${bytesToHex(sha256(signingSecret)).slice(0, 16)}`
  const activeKeyId = environment.AE_GOVERNED_SEND_INTEGRITY_KEY_ID?.trim() || derivedKeyId
  const verificationSecrets = Object.create(null) as Record<string, string>
  const historicalJson = environment.AE_GOVERNED_SEND_INTEGRITY_VERIFICATION_KEYS?.trim()
  if (historicalJson !== undefined && historicalJson.length > 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(historicalJson)
    } catch {
      throw new Error('AE_GOVERNED_SEND_INTEGRITY_VERIFICATION_KEYS must be a JSON object.')
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AE_GOVERNED_SEND_INTEGRITY_VERIFICATION_KEYS must be a JSON object.')
    }
    for (const [keyId, secret] of Object.entries(parsed)) {
      const canonicalKeyId = keyId.trim()
      if (canonicalKeyId.length === 0 || canonicalKeyId !== keyId || typeof secret !== 'string' || secret.trim().length < 32) {
        throw new Error('Governed-send integrity verification keys must have canonical non-empty IDs and 32-character secrets.')
      }
      verificationSecrets[canonicalKeyId] = secret.trim()
    }
  }
  const retainedActiveSecret = verificationSecrets[activeKeyId]
  if (retainedActiveSecret !== undefined && retainedActiveSecret !== signingSecret) {
    throw new Error('Governed-send integrity key ID identifies different secret material.')
  }
  verificationSecrets[activeKeyId] = signingSecret
  return { activeKeyId, signingSecret, verificationSecrets }
}

/**
 * The ordered v1 field contract shared by review rendering and payload construction.
 * `key` is the canonical payload key; array order is the required review-row order.
 */
export const GOVERNED_SEND_CANONICAL_FIELDS = Object.freeze([
  Object.freeze({ key: 'businessId', label: 'Business' }),
  Object.freeze({ key: 'offeringRef', label: 'Offering' }),
  Object.freeze({ key: 'body', label: 'Request' }),
  Object.freeze({ key: 'contactName', label: 'Name' }),
  Object.freeze({ key: 'contactEmail', label: 'Email' }),
  Object.freeze({ key: 'contactPhone', label: 'Phone' }),
  Object.freeze({ key: 'originThreadId', label: 'Earlier record' }),
] as const)

export type GovernedSendCanonicalField = (typeof GOVERNED_SEND_CANONICAL_FIELDS)[number]
export type GovernedSendCanonicalFieldKey = GovernedSendCanonicalField['key']

export type GovernedSendPayload = Readonly<Record<GovernedSendCanonicalFieldKey, string | null>>

export type GovernedSendIntentInput = Readonly<{
  target: InquiryTargetRef
  body: string
  contact: PublicInquiryContactInput
  origin?: InquiryOriginRef
}>

/** Maps the local inquiry model into the governed-action module's opaque payload. */
export function buildGovernedSendIntent(
  input: GovernedSendIntentInput,
): GenericGovernedActionIntent<GovernedSendPayload> {
  const values: Record<GovernedSendCanonicalFieldKey, string | null> = {
    businessId: String(input.target.businessId),
    offeringRef: String(input.target.offeringRef),
    body: input.body,
    contactName: input.contact.name ?? null,
    contactEmail: input.contact.email ?? null,
    contactPhone: input.contact.phone ?? null,
    originThreadId: input.origin?.threadId ?? null,
  }

  const payload = Object.fromEntries(
    GOVERNED_SEND_CANONICAL_FIELDS.map(({ key }) => [key, values[key]]),
  ) as GovernedSendPayload

  return Object.freeze({
    commitmentKind: 'generic',
    schemaVersion: GOVERNED_SEND_SCHEMA_VERSION,
    actionClass: GOVERNED_SEND_ACTION_CLASS,
    payload: Object.freeze(payload),
  })
}

export type GovernedSendAdmissionProofSnapshot = Readonly<{
  version: typeof R1TargetAdmissionVersion
  admitted: true
  proof: AdmissionProofClass
}>

type GovernedSendReceiptBase = Omit<GovernedActionReceiptStorage, 'canonicalBytesBase64'> & Readonly<{
  operationKey: OperationKey
  threadId: InquiryThreadId
  admissionProof: GovernedSendAdmissionProofSnapshot
  recipientRef: string
}>

/** Append-only evidence for one admitted dispatch; mutable projections must not replace it. */
export type GovernedSendReceiptRecord = GovernedSendReceiptBase & (
  | Readonly<{
      retention: 'recoverable'
      canonicalBytesBase64: string
    }>
  | Readonly<{
      retention: 'erased'
      erasedAt: number
      erasureEventId: string
    }>
)

export type GovernedSendIntegrityTargetBinding = Readonly<{
  businessId: BusinessId
  ownerId: OwnerId
  offeringRef: OfferingRef
  claimRef: string
  recipientRef: string
}>

/** Source-keyed authority over the receipt digest and its historical admission target. */
export type GovernedSendIntegrityCommitmentRecord = Readonly<{
  version: typeof GOVERNED_SEND_INTEGRITY_VERSION
  receiptRef: string
  operationKey: OperationKey
  threadId: InquiryThreadId
  digest: `sha256:${string}`
  keyId: string
  targetBinding: GovernedSendIntegrityTargetBinding
  signature: `hmac-sha256:${string}`
  createdAt: number
}>

export function createGovernedSendIntegrityCommitment(input: Readonly<{
  receipt: GovernedSendReceiptRecord
  targetBinding: GovernedSendIntegrityTargetBinding
  keyring: GovernedSendIntegrityKeyring
}>): GovernedSendIntegrityCommitmentRecord {
  const commitment = {
    version: GOVERNED_SEND_INTEGRITY_VERSION,
    receiptRef: `governed-send-receipt:${input.receipt.operationKey}`,
    operationKey: input.receipt.operationKey,
    threadId: input.receipt.threadId,
    digest: input.receipt.digest,
    keyId: input.keyring.activeKeyId,
    targetBinding: input.targetBinding,
    createdAt: input.receipt.createdAt,
  } as const
  return {
    ...commitment,
    signature: governedSendIntegritySignature(input.receipt, commitment, input.keyring.signingSecret),
  }
}

export function verifyGovernedSendIntegrityCommitment(input: Readonly<{
  receipt: GovernedSendReceiptRecord
  commitment: GovernedSendIntegrityCommitmentRecord
  keyring: GovernedSendIntegrityKeyring
}>): boolean {
  const { receipt, commitment, keyring } = input
  if (
    commitment.version !== GOVERNED_SEND_INTEGRITY_VERSION ||
    commitment.receiptRef !== `governed-send-receipt:${receipt.operationKey}` ||
    commitment.operationKey !== receipt.operationKey ||
    commitment.threadId !== receipt.threadId ||
    commitment.digest !== receipt.digest ||
    commitment.createdAt !== receipt.createdAt
  ) return false

  const verificationSecret = keyring.verificationSecrets[commitment.keyId]
  if (verificationSecret === undefined) return false
  const expected = governedSendIntegritySignature(receipt, commitment, verificationSecret)
  return constantTimeStringEqual(commitment.signature, expected)
}

function governedSendIntegritySignature(
  receipt: GovernedSendReceiptRecord,
  commitment: Omit<GovernedSendIntegrityCommitmentRecord, 'signature'>,
  secret: string,
): `hmac-sha256:${string}` {
  const material = stableStringify({
    domain: GOVERNED_SEND_INTEGRITY_VERSION,
    receipt: {
      digest: receipt.digest,
      algorithm: receipt.algorithm,
      schemaVersion: receipt.schemaVersion,
      createdAt: receipt.createdAt,
      operationKey: String(receipt.operationKey),
      threadId: String(receipt.threadId),
      admissionProof: receipt.admissionProof,
      recipientRef: receipt.recipientRef,
    },
    commitment: {
      version: commitment.version,
      receiptRef: commitment.receiptRef,
      operationKey: String(commitment.operationKey),
      threadId: String(commitment.threadId),
      digest: commitment.digest,
      keyId: commitment.keyId,
      targetBinding: commitment.targetBinding,
      createdAt: commitment.createdAt,
    },
  })
  return `hmac-sha256:${bytesToHex(hmac(sha256, secret, material))}`
}

/** Immutable proof that one receipt data key was destroyed by an applied privacy operation. */
export type GovernedSendErasureLineageRecord = Readonly<{
  erasureEventId: string
  receiptOperationKey: OperationKey
  privacyOperationKey: OperationKey
  threadId: InquiryThreadId
  digest: `sha256:${string}`
  keyRef: string
  reasonCode: string
  destroyedAt: number
  priorReceiptCommitment: string
  lineageHash: string
}>

type ExistingAdmissionRefusalCode = Extract<
  SubmitInquiryErrorCode,
  'inquiry_target_not_admitted' | 'inquiry_target_admission_conflict'
>

export type GovernedSendRefusalCode =
  | 'inquiry_digest_mismatch'
  | ExistingAdmissionRefusalCode
