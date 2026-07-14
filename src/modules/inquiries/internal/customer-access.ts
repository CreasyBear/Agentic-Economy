import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { constantTimeStringEqual } from '@/lib/server/constant-time'
import { stableHash, stableStringify } from '@/modules/common/stable-hash'
import type { InquiryCustomerAccessGrant, InquiryThreadId } from './schema'

export const InquiryCustomerAccessScope = 'customer_record' as const
export const InquiryCustomerAccessVersion = 'inquiry-customer-access:v1' as const
export const DefaultInquiryCustomerAccessTtlMs = 90 * 24 * 60 * 60 * 1_000


export type InquiryCustomerAccessKeyring = Readonly<{
  keyId: string
  secret: string
}>

export type IssuedInquiryCustomerAccess = Readonly<{
  grant: InquiryCustomerAccessGrant
  accessKey: string
}>

export function issueInquiryCustomerAccess(input: Readonly<{
  threadId: InquiryThreadId
  now: number
  keyring: InquiryCustomerAccessKeyring
  ttlMs?: number
}>): IssuedInquiryCustomerAccess {
  assertAccessKeyring(input.keyring)
  const ttlMs = input.ttlMs ?? DefaultInquiryCustomerAccessTtlMs
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error('Inquiry customer access TTL must be a positive integer.')
  }

  const accessId = hmacHex(input.keyring.secret, stableStringify({
    version: InquiryCustomerAccessVersion,
    scope: InquiryCustomerAccessScope,
    threadId: String(input.threadId),
  }))
  const grantWithoutVerifier = {
    accessId,
    threadId: input.threadId,
    scope: InquiryCustomerAccessScope,
    version: InquiryCustomerAccessVersion,
    keyId: input.keyring.keyId,
    status: 'active' as const,
    createdAt: input.now,
    expiresAt: input.now + ttlMs,
  }
  const accessKey = mintInquiryCustomerAccessKey(grantWithoutVerifier, input.keyring)
  return {
    grant: {
      ...grantWithoutVerifier,
      verifier: accessVerifier(accessKey, input.keyring.secret),
    },
    accessKey,
  }
}

export function mintInquiryCustomerAccessKey(
  grant: Omit<InquiryCustomerAccessGrant, 'verifier'> | InquiryCustomerAccessGrant,
  keyring: InquiryCustomerAccessKeyring,
): string {
  assertAccessKeyring(keyring)
  if (grant.keyId !== keyring.keyId) {
    throw new Error('Inquiry customer access key id is not active.')
  }

  const signature = hmacHex(keyring.secret, stableStringify(accessClaims(grant)))
  return `iak1.${grant.accessId}.${signature}`
}

export function verifyInquiryCustomerAccess(input: Readonly<{
  grant: InquiryCustomerAccessGrant | undefined
  accessKey: string
  requestedThreadId: InquiryThreadId
  now: number
  keyring: InquiryCustomerAccessKeyring
}>): boolean {
  const grant = input.grant
  if (
    grant === undefined ||
    grant.status !== 'active' ||
    grant.revokedAt !== undefined ||
    grant.expiresAt <= input.now ||
    grant.threadId !== input.requestedThreadId ||
    grant.scope !== InquiryCustomerAccessScope ||
    grant.version !== InquiryCustomerAccessVersion ||
    grant.keyId !== input.keyring.keyId
  ) {
    return false
  }

  const parsedAccessId = accessIdFromInquiryCustomerAccessKey(input.accessKey)
  if (parsedAccessId === undefined || !constantTimeStringEqual(parsedAccessId, grant.accessId)) {
    return false
  }

  let expectedAccessKey: string
  try {
    expectedAccessKey = mintInquiryCustomerAccessKey(grant, input.keyring)
  } catch {
    return false
  }

  return (
    constantTimeStringEqual(input.accessKey.trim(), expectedAccessKey) &&
    constantTimeStringEqual(grant.verifier, accessVerifier(input.accessKey.trim(), input.keyring.secret))
  )
}

export function accessIdFromInquiryCustomerAccessKey(accessKey: string): string | undefined {
  const match = /^iak1\.([a-f0-9]{64})\.[a-f0-9]{64}$/.exec(accessKey.trim())
  return match?.[1]
}

export function resolveInquiryCustomerAccessKeyring(
  environment: Readonly<Record<string, string | undefined>>,
): InquiryCustomerAccessKeyring {
  const secret = environment.AE_INQUIRY_ACCESS_SECRET?.trim()
  if (secret === undefined || secret.length < 32) {
    throw new Error('AE_INQUIRY_ACCESS_SECRET must contain at least 32 characters.')
  }

  const keyId = environment.AE_INQUIRY_ACCESS_KEY_ID?.trim() || 'inquiry-access-primary-v1'
  return { keyId, secret }
}

function accessClaims(grant: Omit<InquiryCustomerAccessGrant, 'verifier'> | InquiryCustomerAccessGrant) {
  return {
    version: grant.version,
    accessId: grant.accessId,
    threadId: String(grant.threadId),
    scope: grant.scope,
    keyId: grant.keyId,
    createdAt: grant.createdAt,
    expiresAt: grant.expiresAt,
  }
}

function accessVerifier(accessKey: string, secret: string): `hmac-sha256:${string}` {
  return `hmac-sha256:${hmacHex(secret, `inquiry-customer-access-verifier:v1\n${accessKey}`)}`
}

function hmacHex(secret: string, value: string): string {
  return bytesToHex(hmac(sha256, secret, value))
}

function assertAccessKeyring(keyring: InquiryCustomerAccessKeyring): void {
  if (keyring.secret.trim().length < 32 || keyring.keyId.trim().length === 0) {
    throw new Error('Inquiry customer access keyring is not configured.')
  }
}
