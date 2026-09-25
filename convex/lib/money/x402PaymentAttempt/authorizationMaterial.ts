import { type Infer } from 'convex/values'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { containsForbiddenSignatureKey } from '../../../../src/modules/common/forbidden-signature-key'
import { isRecord } from '../../../../src/modules/common/is-record'
import { stableStringify, type StableHashValue } from '../../../../src/modules/common/stable-hash'
import { paymentAuthorizationValidBeforePattern, paymentSigningIdempotencyKeyPattern, type AttemptRow, x402PaymentAuthorizationStored } from './contracts'

export function isPaymentSigningIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && paymentSigningIdempotencyKeyPattern.test(value)
}

export function paymentAuthorizationExpiryFromValidBefore(
  validBefore: unknown,
): Readonly<{
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
}> | undefined {
  if (typeof validBefore !== 'string' || !paymentAuthorizationValidBeforePattern.test(validBefore)) {
    return undefined
  }
  let seconds: bigint
  try {
    seconds = BigInt(validBefore)
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'paymentAuthorizationExpiryFromValidBefore',
      reason: 'invalid_response',
    })
  }
  if (seconds <= 0n) return undefined
  const milliseconds = seconds * 1000n
  const expiresAt = Number(milliseconds)
  if (
    !Number.isFinite(expiresAt)
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= 0
  ) return undefined
  try {
    return BigInt(expiresAt) === milliseconds
      ? { paymentAuthorizationValidBefore: validBefore, paymentAuthorizationExpiresAt: expiresAt }
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'paymentAuthorizationExpiryFromValidBefore',
      reason: 'invalid_response',
    })
  }
}

export function paymentAuthorizationExpiryValid(
  validBefore: unknown,
  expiresAt: unknown,
): boolean {
  const expected = paymentAuthorizationExpiryFromValidBefore(validBefore)
  return expected !== undefined && expected.paymentAuthorizationExpiresAt === expiresAt
}

export function paymentAuthorizationExpiryFromMaterial(
  value: unknown,
): Readonly<{
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
}> | undefined {
  if (!isRecord(value) || !isRecord(value.authorization) || !isRecord(value.typedData)) {
    return undefined
  }
  const message = value.typedData.message
  if (!isRecord(message)) return undefined
  const expiry = paymentAuthorizationExpiryFromValidBefore(message.validBefore)
  return expiry !== undefined && value.authorization.validBefore === expiry.paymentAuthorizationValidBefore
    ? expiry
    : undefined
}

export function canonicalUnsignedMaterialJson(value: unknown): string | undefined {
  if (containsForbiddenSignatureKey(value)) return undefined
  try {
    const json = stableStringify(value as StableHashValue)
    return canonicalDigest(value) === canonicalDigest(JSON.parse(json)) ? json : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'canonicalUnsignedMaterialJson',
      reason: 'invalid_response',
    })
  }
}

export function storedAuthorization(
  row: AttemptRow,
): Infer<typeof x402PaymentAuthorizationStored> | undefined {
  if (
    row.paymentUnsignedMaterialJson === undefined
    || row.paymentUnsignedMaterialDigest === undefined
    || row.paymentSigningIdempotencyKey === undefined
    || row.paymentSignatureDigest === undefined
    || row.paymentPayer === undefined
    || row.paymentNonce === undefined
    || row.paymentAuthorizationValidBefore === undefined
    || row.paymentAuthorizationExpiresAt === undefined
    || row.requestFingerprint === undefined
    || !isPaymentSigningIdempotencyKey(row.paymentSigningIdempotencyKey)
    || !paymentAuthorizationExpiryValid(
      row.paymentAuthorizationValidBefore,
      row.paymentAuthorizationExpiresAt,
    )
  ) return undefined
  return {
    paymentUnsignedMaterialJson: row.paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey,
    paymentSignatureDigest: row.paymentSignatureDigest,
    paymentPayer: row.paymentPayer,
    paymentNonce: row.paymentNonce,
    paymentAuthorizationValidBefore: row.paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt: row.paymentAuthorizationExpiresAt,
    requestFingerprint: row.requestFingerprint,
  }
}
