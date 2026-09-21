import {
  decodePaymentSignatureHeader,
  isEIP3009Payload,
  type ExactEvmPayloadV2,
} from './cdp-x402-payment-signer'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'

import {
  isX402PaymentRequirementForProfile,
  normalizeX402PaymentRequirement,
  x402PaymentProfileForEnvironment,
} from './x402-payment-profile'
import type { X402PaymentSignatureRequest } from './x402-challenge'
import {
  PAYMENT_SIGNING_IDEMPOTENCY_KEY_PATTERN,
  type CdpX402PaymentAuthorization,
  type CdpX402RequestFingerprintContext,
} from './cdp-x402-payment-contracts'
import {
  decimalAtomicAmount,
  isEip3009Nonce,
  isEvmAddress,
  isSignature,
  normalizeIdentityString,
} from './cdp-x402-payment-validation'

/** Binds one CDP authorization to the exact x402 request it is allowed to pay. */
export function cdpX402RequestFingerprint(
  request: X402PaymentSignatureRequest,
  context: CdpX402RequestFingerprintContext,
): string {
  const profile = x402PaymentProfileForEnvironment(
    context.aeEnvironment ?? 'production',
  )
  const selectedRequirement = normalizeX402PaymentRequirement(
    request.selectedRequirement,
  )
  return canonicalDigest({
    version: 2,
    aeEnvironment: profile?.aeEnvironment ?? 'unsupported',
    profile: profile?.profile ?? 'unsupported',
    network: selectedRequirement.network,
    asset: normalizeIdentityString(selectedRequirement.asset),
    amount: selectedRequirement.amount,
    payTo: normalizeIdentityString(selectedRequirement.payTo),
    route: request.challenge.resource.url,
    method: context.method,
    toolRef: context.toolRef,
    paymentIdentifier: request.paymentIdentifier,
    challengeDigest: canonicalDigest({
      ...request.challenge,
      accepts: request.challenge.accepts.map((requirement) =>
        normalizeX402PaymentRequirement(requirement)),
    }),
  })
}

export function isPaymentSigningIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && PAYMENT_SIGNING_IDEMPOTENCY_KEY_PATTERN.test(value)
}

/**
 * Reads only the transient header emitted by the official x402 encoder. The
 * returned identity deliberately excludes the header itself.
 */
export function readCdpX402PaymentAuthorization(
  paymentSignature: string,
  request: X402PaymentSignatureRequest,
  context: CdpX402RequestFingerprintContext,
  expectedRequestFingerprint?: string,
): CdpX402PaymentAuthorization | undefined {
  if (
    typeof paymentSignature !== 'string'
    || paymentSignature.length === 0
    || paymentSignature.length > 1_048_576
  ) return undefined

  try {
    const profile = x402PaymentProfileForEnvironment(
      context.aeEnvironment ?? 'production',
    )
    if (profile === undefined) return undefined
    const requestFingerprint = cdpX402RequestFingerprint(request, context)
    if (
      expectedRequestFingerprint !== undefined
      && expectedRequestFingerprint !== requestFingerprint
    ) return undefined
    const selectedRequirement = normalizeX402PaymentRequirement(
      request.selectedRequirement,
    )
    if (
      request.challenge.x402Version !== 2
      || !isX402PaymentRequirementForProfile(selectedRequirement, profile)
      || !request.challenge.accepts.some(
        (candidate) => canonicalDigest(normalizeX402PaymentRequirement(candidate))
          === canonicalDigest(selectedRequirement),
      )
    ) return undefined

    const decoded = decodePaymentSignatureHeader(paymentSignature)
    if (!isRecord(decoded.accepted.extra)) return undefined
    const returnedRequirement = normalizeX402PaymentRequirement(decoded.accepted)
    if (
      decoded.x402Version !== 2
      || !isX402PaymentRequirementForProfile(returnedRequirement, profile)
      || canonicalDigest(returnedRequirement) !== canonicalDigest(selectedRequirement)
      || !isRecord(decoded.payload)
      || !isEIP3009Payload(decoded.payload as ExactEvmPayloadV2)
    ) return undefined

    const authorization = decoded.payload.authorization
    if (
      !isRecord(authorization)
      || !isEvmAddress(authorization.from)
      || !isEvmAddress(authorization.to)
      || !decimalAtomicAmount(authorization.value)
      || authorization.to.toLowerCase() !== selectedRequirement.payTo.toLowerCase()
      || authorization.value !== selectedRequirement.amount
      || !decimalAtomicAmount(authorization.validAfter)
      || !decimalAtomicAmount(authorization.validBefore)
      || !isEip3009Nonce(authorization.nonce)
      || !isSignature(decoded.payload.signature)
    ) return undefined

    return {
      paymentSignatureDigest: canonicalDigest(paymentSignature),
      paymentPayer: authorization.from.toLowerCase(),
      paymentNonce: authorization.nonce.toLowerCase(),
      requestFingerprint,
    }
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'readCdpX402PaymentAuthorization', reason: 'invalid_response' })
  }
}
