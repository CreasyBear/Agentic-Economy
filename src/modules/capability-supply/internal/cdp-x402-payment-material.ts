import { x402Client } from '@x402/core/client'
import type { PaymentPayload, PaymentRequired } from '@x402/core/types'
import { isEIP3009Payload, type ClientEvmSigner, type ExactEvmPayloadV2 } from '@x402/evm'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { extractPaymentIdentifier } from '@x402/extensions/payment-identifier'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { containsForbiddenSignatureKey } from '@/modules/common/forbidden-signature-key'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import type { X402PaymentProfile } from './x402-payment-profile'
import {
  X402_MIN_AUTHORIZATION_VALIDITY_SECONDS,
  type X402PaymentSignatureRequest,
} from './x402-challenge'
import { isPaymentSigningIdempotencyKey } from './cdp-x402-payment-authorization'
import type {
  CdpX402PaymentSigningIntent,
  CdpX402PaymentUnsignedMaterial,
  CdpX402TypedData,
} from './cdp-x402-payment-contracts'
import {
  chainIdFromNetwork,
  decimalAtomicAmount,
  isEip3009Nonce,
  isEvmAddress,
  isSignature,
  isUnsignedMaterial,
  normalizeTypedDataRecord,
  paymentAuthorizationExpiryFromValidBefore,
} from './cdp-x402-payment-validation'

export async function captureUnsignedMaterial(
  required: PaymentRequired,
  address: string,
  identifier: string,
  profile: X402PaymentProfile,
  authorityExpiresAt: number,
): Promise<CdpX402PaymentUnsignedMaterial | undefined> {
  let capturedTypedData: CdpX402TypedData | undefined
  const captureSigner: ClientEvmSigner = {
    address: address as `0x${string}`,
    signTypedData: async (typedData) => {
      capturedTypedData = {
        domain: normalizeTypedDataRecord(typedData.domain),
        types: normalizeTypedDataRecord(typedData.types),
        primaryType: typedData.primaryType,
        message: normalizeTypedDataRecord(typedData.message),
      }
      return `0x${'00'.repeat(65)}`
    },
  }

  try {
    const core = new x402Client()
    core.register(profile.network, new ExactEvmScheme(captureSigner))
    const payload = await core.createPaymentPayload(required)
    const encodedPaymentIdentifier = extractPaymentIdentifier(payload)
    const paymentIdentifierDeclared
      = required.extensions?.['payment-identifier'] !== undefined
    if (
      payload.x402Version !== 2
      || payload.accepted === undefined
      || (paymentIdentifierDeclared
        ? encodedPaymentIdentifier !== identifier
        : encodedPaymentIdentifier !== null)
      || !isRecord(payload.payload)
      || !isEIP3009Payload(payload.payload as ExactEvmPayloadV2)
      || !isSignature(payload.payload.signature)
      || payload.payload.signature !== `0x${'00'.repeat(65)}`
      || capturedTypedData === undefined
    ) return undefined
    const authorization = payload.payload.authorization
    if (
      !isRecord(authorization)
      || !isEvmAddress(authorization.from)
      || !isEvmAddress(authorization.to)
      || !decimalAtomicAmount(authorization.value)
      || !decimalAtomicAmount(authorization.validAfter)
      || !decimalAtomicAmount(authorization.validBefore)
      || !isEip3009Nonce(authorization.nonce)
    ) return undefined
    const expiry = paymentAuthorizationExpiryFromValidBefore(
      capturedTypedData.message.validBefore,
    )
    if (
      expiry === undefined
      || authorization.validBefore !== expiry.paymentAuthorizationValidBefore
    ) return undefined
    const authorityValidBefore = Math.floor(authorityExpiresAt / 1_000)
    const sdkValidBefore = Number(authorization.validBefore)
    const nowSeconds = Math.floor(Date.now() / 1_000)
    if (
      !Number.isSafeInteger(authorityValidBefore)
      || !Number.isSafeInteger(sdkValidBefore)
      || authorityValidBefore <= nowSeconds + X402_MIN_AUTHORIZATION_VALIDITY_SECONDS
    ) return undefined
    const validBefore = String(Math.min(authorityValidBefore, sdkValidBefore))
    const material: CdpX402PaymentUnsignedMaterial = {
      x402Version: payload.x402Version,
      resource: required.resource,
      accepted: payload.accepted,
      ...(payload.extensions === undefined ? {} : { extensions: payload.extensions }),
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value,
        validAfter: authorization.validAfter,
        validBefore,
        nonce: authorization.nonce,
      },
      typedData: {
        ...capturedTypedData,
        message: { ...capturedTypedData.message, validBefore },
      },
    }
    if (containsForbiddenSignatureKey(material)) return undefined
    canonicalDigest(material as StableHashValue)
    return JSON.parse(stableStringify(material as StableHashValue)) as CdpX402PaymentUnsignedMaterial
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'captureUnsignedMaterial', reason: 'source_unavailable' })
  }
}

export function readPersistedUnsignedMaterial(
  intent: CdpX402PaymentSigningIntent,
  request: X402PaymentSignatureRequest,
  required: PaymentRequired,
  offeredRequirement: X402PaymentSignatureRequest['selectedRequirement'],
  accountAddress: string,
  requestFingerprint: string,
  authorityExpiresAt: number,
): CdpX402PaymentUnsignedMaterial | undefined {
  if (
    !isPaymentSigningIdempotencyKey(intent.paymentSigningIdempotencyKey)
    || intent.requestFingerprint !== requestFingerprint
    || typeof intent.paymentUnsignedMaterialJson !== 'string'
    || typeof intent.paymentUnsignedMaterialDigest !== 'string'
    || typeof intent.paymentAuthorizationValidBefore !== 'string'
    || typeof intent.paymentAuthorizationExpiresAt !== 'number'
  ) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(intent.paymentUnsignedMaterialJson)
    if (!isRecord(parsed) || containsForbiddenSignatureKey(parsed)) return undefined
    if (stableStringify(parsed as StableHashValue) !== intent.paymentUnsignedMaterialJson) return undefined
    if (canonicalDigest(parsed) !== intent.paymentUnsignedMaterialDigest) return undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'readPersistedUnsignedMaterial', reason: 'invalid_response' })
  }
  if (!isUnsignedMaterial(parsed)) return undefined
  const expiry = paymentAuthorizationExpiryFromValidBefore(
    parsed.typedData.message.validBefore,
  )
  if (
    expiry === undefined
    || parsed.authorization.validBefore !== expiry.paymentAuthorizationValidBefore
    || intent.paymentAuthorizationValidBefore !== expiry.paymentAuthorizationValidBefore
    || intent.paymentAuthorizationExpiresAt !== expiry.paymentAuthorizationExpiresAt
    || expiry.paymentAuthorizationExpiresAt > authorityExpiresAt
  ) return undefined
  if (
    parsed.x402Version !== required.x402Version
    || canonicalDigest(parsed.resource) !== canonicalDigest(required.resource)
    || canonicalDigest(parsed.accepted) !== canonicalDigest(offeredRequirement)
    || canonicalDigest(parsed.accepted) !== canonicalDigest(required.accepts[0])
    || canonicalDigest(parsed.extensions ?? null) !== canonicalDigest(required.extensions ?? null)
    || parsed.authorization.from.toLowerCase() !== accountAddress.toLowerCase()
    || parsed.authorization.to.toLowerCase() !== offeredRequirement.payTo.toLowerCase()
    || parsed.authorization.value !== offeredRequirement.amount
    || parsed.typedData.domain.chainId !== chainIdFromNetwork(offeredRequirement.network)
    || intent.paymentPayer !== parsed.authorization.from.toLowerCase()
    || intent.paymentNonce !== parsed.authorization.nonce.toLowerCase()
  ) return undefined
  return parsed
}

export function intentFromMaterial(
  material: CdpX402PaymentUnsignedMaterial,
  paymentSigningIdempotencyKey: string,
  requestFingerprint: string,
): CdpX402PaymentSigningIntent {
  const expiry = paymentAuthorizationExpiryFromValidBefore(
    material.typedData.message.validBefore,
  )
  if (
    expiry === undefined
    || material.authorization.validBefore !== expiry.paymentAuthorizationValidBefore
  ) throw new Error('x402_payment_authorization_expiry_invalid')
  const paymentUnsignedMaterialJson = stableStringify(material as StableHashValue)
  return {
    paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: canonicalDigest(material as StableHashValue),
    paymentSigningIdempotencyKey,
    paymentPayer: material.authorization.from.toLowerCase(),
    paymentNonce: material.authorization.nonce.toLowerCase(),
    ...expiry,
    requestFingerprint,
  }
}

export function paymentPayloadFromMaterial(
  material: CdpX402PaymentUnsignedMaterial,
  signature: string,
): PaymentPayload {
  return {
    x402Version: material.x402Version,
    resource: material.resource,
    accepted: material.accepted,
    ...(material.extensions === undefined ? {} : { extensions: material.extensions }),
    payload: {
      authorization: material.authorization,
      signature,
    },
  }
}
