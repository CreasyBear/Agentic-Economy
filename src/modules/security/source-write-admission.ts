import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

export const SourceWriteAdmissionScopeValues = [
  'owner_claim',
  'catalog_publish',
  'removal_dispute',
  'public_inquiry',
  'owner_inquiry',
  'protected_action',
  'admin_operator',
  'discovery_repair',
  'notification_repair',
] as const

export type SourceWriteAdmissionScope = (typeof SourceWriteAdmissionScopeValues)[number]

export type SourceWriteAdmissionRequest = {
  method: string
  origin: string
  pathname: string
}

export type SourceWriteAdmission = SourceWriteAdmissionRequest & {
  version: 'source-write:v1'
  scope: SourceWriteAdmissionScope
  operationKey: string
  correlationId: string
  issuedAt: number
  nonce: string
  signature: string
}

export type SourceWriteAdmissionFailureReason =
  | 'missing_source_write_admission'
  | 'missing_source_write_secret'
  | 'source_write_crypto_unavailable'
  | 'source_write_scope_mismatch'
  | 'source_write_operation_mismatch'
  | 'source_write_correlation_mismatch'
  | 'stale_source_write_admission'
  | 'invalid_source_write_signature'

export type SourceWriteAdmissionVerification =
  | { kind: 'accepted'; admission: SourceWriteAdmission }
  | { kind: 'rejected'; reason: SourceWriteAdmissionFailureReason }

export class SourceWriteAdmissionError extends Error {
  readonly code: SourceWriteAdmissionFailureReason | 'client_exposed_source_write_secret' | 'missing_source_write_request'

  constructor(code: SourceWriteAdmissionError['code'], message: string) {
    super(message)
    this.name = 'SourceWriteAdmissionError'
    this.code = code
  }
}

export async function createSourceWriteAdmission(input: {
  secret: string
  request: SourceWriteAdmissionRequest
  scope: SourceWriteAdmissionScope
  operationKey: string
  correlationId: string
  now?: number
  nonce?: string
}): Promise<SourceWriteAdmission> {
  const admission: Omit<SourceWriteAdmission, 'signature'> = {
    version: 'source-write:v1',
    scope: input.scope,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    issuedAt: input.now ?? Date.now(),
    nonce: input.nonce ?? randomNonce(),
    method: input.request.method,
    origin: input.request.origin,
    pathname: input.request.pathname,
  }

  return {
    ...admission,
    signature: await sourceWriteSignature(input.secret, admission),
  }
}

export async function verifySourceWriteAdmission(input: {
  admission?: SourceWriteAdmission
  secret?: string
  expected: {
    scope: SourceWriteAdmissionScope
    operationKey: string
    correlationId: string
  }
  now?: number
  maxAgeMs?: number
}): Promise<SourceWriteAdmissionVerification> {
  if (input.admission === undefined) {
    return { kind: 'rejected', reason: 'missing_source_write_admission' }
  }

  if (input.secret === undefined || input.secret.trim().length === 0) {
    return { kind: 'rejected', reason: 'missing_source_write_secret' }
  }

  if (input.admission.scope !== input.expected.scope) {
    return { kind: 'rejected', reason: 'source_write_scope_mismatch' }
  }

  if (input.admission.operationKey !== input.expected.operationKey) {
    return { kind: 'rejected', reason: 'source_write_operation_mismatch' }
  }

  if (input.admission.correlationId !== input.expected.correlationId) {
    return { kind: 'rejected', reason: 'source_write_correlation_mismatch' }
  }

  const maxAgeMs = input.maxAgeMs ?? 5 * 60_000
  const now = input.now ?? Date.now()
  if (Math.abs(now - input.admission.issuedAt) > maxAgeMs) {
    return { kind: 'rejected', reason: 'stale_source_write_admission' }
  }

  const expectedSignature = await sourceWriteSignature(input.secret, input.admission)
  if (!safeEqualHex(input.admission.signature, expectedSignature)) {
    return { kind: 'rejected', reason: 'invalid_source_write_signature' }
  }

  return { kind: 'accepted', admission: input.admission }
}

export function sourceWriteSigningPayload(admission: Omit<SourceWriteAdmission, 'signature'>): StableHashValue {
  return {
    version: admission.version,
    scope: admission.scope,
    operationKey: admission.operationKey,
    correlationId: admission.correlationId,
    issuedAt: admission.issuedAt,
    nonce: admission.nonce,
    method: admission.method,
    origin: admission.origin,
    pathname: admission.pathname,
  }
}

async function sourceWriteSignature(secret: string, admission: Omit<SourceWriteAdmission, 'signature'>): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) {
    throw new SourceWriteAdmissionError('source_write_crypto_unavailable', 'Web Crypto is required for source write admission.')
  }

  const encoder = new TextEncoder()
  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await subtle.sign('HMAC', key, encoder.encode(stableStringify(sourceWriteSigningPayload(admission))))
  return bytesToHex(new Uint8Array(signature))
}

function randomNonce(): string {
  const crypto = globalThis.crypto
  if (crypto?.randomUUID !== undefined) {
    return crypto.randomUUID()
  }

  if (crypto?.getRandomValues === undefined) {
    throw new SourceWriteAdmissionError('source_write_crypto_unavailable', 'Web Crypto is required for source write admission.')
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
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
