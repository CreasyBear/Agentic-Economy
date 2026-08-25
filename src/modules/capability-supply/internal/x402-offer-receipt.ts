import type { PaymentRequired, PaymentRequirements } from '@x402/core/types'
import {
  decodeSignedOffers,
  extractJWSHeader,
  extractOffersFromPaymentRequired,
  extractReceiptFromResponse,
  findAcceptsObjectFromSignedOffer,
  isEIP712SignedOffer,
  isEIP712SignedReceipt,
  isJWSSignedOffer,
  isJWSSignedReceipt,
  verifyOfferSignatureEIP712,
  verifyOfferSignatureJWS,
  verifyReceiptMatchesOffer,
  verifyReceiptSignatureEIP712,
  verifyReceiptSignatureJWS,
  type DecodedOffer,
} from '@x402/extensions/offer-receipt'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { SourceHash } from '@/modules/common/ids'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

const MAX_OFFERS = 20
const MAX_SERIALIZED_BYTES = 4_096

export type X402OfferReceiptRefusalCode =
  | 'offer_missing'
  | 'offer_malformed'
  | 'offer_duplicate'
  | 'offer_resource_mismatch'
  | 'offer_requirement_mismatch'
  | 'offer_expired'
  | 'offer_validity_invalid'
  | 'offer_signature_invalid'
  | 'offer_signer_mismatch'
  | 'offer_signer_binding_invalid'
  | 'receipt_missing'
  | 'receipt_malformed'
  | 'receipt_signature_invalid'
  | 'receipt_signer_mismatch'
  | 'receipt_payload_mismatch'
  | 'receipt_future'
  | 'receipt_stale'
  | 'receipt_oversized'

export type X402OfferSignerBinding = Readonly<
  | { format: 'eip712'; signer: string }
  | { format: 'jws'; kid: string; originHost: string }
>

export type X402VerifiedOffer = Readonly<{
  offer: DecodedOffer
  offerDigest: SourceHash
  signer: X402OfferSignerBinding
  resourceUrl: string
  maxTimeoutSeconds: number
}>

export type VerifyX402OfferResult =
  | Readonly<{ kind: 'verified'; context: X402VerifiedOffer }>
  | Readonly<{ kind: 'refused'; code: X402OfferReceiptRefusalCode }>

export type VerifyX402OfferInput = Readonly<{
  paymentRequired: PaymentRequired
  selectedRequirement: PaymentRequirements
  resourceUrl: string
  nowSeconds: number
}>

export type VerifyX402ReceiptInput = Readonly<{
  response: Response
  offer: X402VerifiedOffer
  payer: string
  nowSeconds: number
}>

export type VerifyX402ReceiptResult =
  | Readonly<{ kind: 'verified'; serializedReceipt: string; receiptDigest: SourceHash }>
  | Readonly<{ kind: 'refused'; code: X402OfferReceiptRefusalCode }>

function refused(code: X402OfferReceiptRefusalCode): VerifyX402OfferResult & VerifyX402ReceiptResult {
  return { kind: 'refused', code }
}

function boundedTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function sameRequirement(left: PaymentRequirements, right: PaymentRequirements): boolean {
  return left.scheme === right.scheme
    && left.network === right.network
    && left.asset === right.asset
    && left.payTo === right.payTo
    && left.amount === right.amount
    && left.maxTimeoutSeconds === right.maxTimeoutSeconds
    && stableStringify(left.extra as StableHashValue) === stableStringify(right.extra as StableHashValue)
}

function originHost(resourceUrl: string): string | undefined {
  try {
    const parsed = new URL(resourceUrl)
    return parsed.host.toLowerCase()
  } catch {
    return undefined
  }
}

function didWebHost(kid: string, resourceHost: string): boolean {
  if (!kid.startsWith('did:web:')) return false
  const identifier = kid.slice('did:web:'.length).split('#', 1)[0]
  if (identifier === undefined) return false
  const firstSegment = identifier.split(':', 1)[0]
  if (firstSegment === undefined || firstSegment.length === 0) return false
  try {
    return decodeURIComponent(firstSegment).toLowerCase() === resourceHost
  } catch {
    return false
  }
}

function canonicalMaterial(value: unknown): { serialized: string; digest: SourceHash } | undefined {
  try {
    const stableValue = value as StableHashValue
    const serialized = stableStringify(stableValue)
    if (new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_BYTES) return undefined
    return { serialized, digest: canonicalDigest(stableValue) }
  } catch {
    return undefined
  }
}

function matchingOffer(offer: DecodedOffer, input: VerifyX402OfferInput): boolean {
  return offer.resourceUrl === input.resourceUrl
    && offer.scheme === input.selectedRequirement.scheme
    && offer.network === input.selectedRequirement.network
    && offer.asset === input.selectedRequirement.asset
    && offer.payTo === input.selectedRequirement.payTo
    && offer.amount === input.selectedRequirement.amount
}

/** Verify one signed offer against the already-selected x402 requirement. */
export async function verifyX402SignedOffer(
  input: VerifyX402OfferInput,
): Promise<VerifyX402OfferResult> {
  try {
    if (
      !boundedTime(input.nowSeconds)
      || input.resourceUrl !== input.paymentRequired.resource.url
      || !input.paymentRequired.accepts.some((candidate) =>
        sameRequirement(candidate, input.selectedRequirement),
      )
      || !Number.isSafeInteger(input.selectedRequirement.maxTimeoutSeconds)
      || input.selectedRequirement.maxTimeoutSeconds <= 0
    ) return refused('offer_requirement_mismatch')

    const signedOffers = extractOffersFromPaymentRequired(input.paymentRequired)
    if (signedOffers.length === 0) return refused('offer_missing')
    if (signedOffers.length > MAX_OFFERS) return refused('offer_malformed')

    const decodedOffers = decodeSignedOffers(signedOffers)
    const matches = decodedOffers.filter((offer) =>
      offer.resourceUrl === input.resourceUrl
      && (() => {
        const matchedRequirement = findAcceptsObjectFromSignedOffer(offer, input.paymentRequired.accepts)
        return matchedRequirement !== undefined && sameRequirement(matchedRequirement, input.selectedRequirement)
      })(),
    )
    if (matches.length === 0) return refused('offer_missing')
    if (matches.length > 1) return refused('offer_duplicate')
    const decoded = matches[0]
    if (decoded === undefined) return refused('offer_missing')
    const material = canonicalMaterial(decoded.signedOffer)
    if (material === undefined) return refused('offer_malformed')
    if (
      decoded.version !== 1
      || !boundedTime(decoded.validUntil)
      || decoded.validUntil <= input.nowSeconds
      || decoded.validUntil > input.nowSeconds + input.selectedRequirement.maxTimeoutSeconds
    ) return refused(decoded.validUntil <= input.nowSeconds ? 'offer_expired' : 'offer_validity_invalid')

    let verifiedPayload = decoded
    let signer: X402OfferSignerBinding
    if (isEIP712SignedOffer(decoded.signedOffer)) {
      const verified = await verifyOfferSignatureEIP712(decoded.signedOffer)
      verifiedPayload = { ...decoded, ...verified.payload }
      if (!matchingOffer(verifiedPayload, input)) return refused('offer_requirement_mismatch')
      if (verified.payload.validUntil !== decoded.validUntil || verified.payload.resourceUrl !== decoded.resourceUrl)
        return refused('offer_signature_invalid')
      if (verified.signer.toLowerCase() !== input.selectedRequirement.payTo.toLowerCase())
        return refused('offer_signer_mismatch')
      signer = { format: 'eip712', signer: verified.signer.toLowerCase() }
    } else if (isJWSSignedOffer(decoded.signedOffer)) {
      const host = originHost(input.resourceUrl)
      if (host === undefined) return refused('offer_resource_mismatch')
      const header = extractJWSHeader(decoded.signedOffer.signature)
      if (typeof header.kid !== 'string' || !didWebHost(header.kid, host))
        return refused('offer_signer_binding_invalid')
      const payload = await verifyOfferSignatureJWS(decoded.signedOffer)
      verifiedPayload = { ...decoded, ...payload }
      if (!matchingOffer(verifiedPayload, input)) return refused('offer_requirement_mismatch')
      signer = { format: 'jws', kid: header.kid, originHost: host }
    } else {
      return refused('offer_malformed')
    }

    return {
      kind: 'verified',
      context: {
        offer: verifiedPayload,
        offerDigest: material.digest,
        signer,
        resourceUrl: input.resourceUrl,
        maxTimeoutSeconds: input.selectedRequirement.maxTimeoutSeconds,
      },
    }
  } catch {
    return refused('offer_signature_invalid')
  }
}

/** Verify the provider receipt in a successful response against a verified offer. */
export async function verifyX402SignedReceipt(
  input: VerifyX402ReceiptInput,
): Promise<VerifyX402ReceiptResult> {
  try {
    if (!boundedTime(input.nowSeconds) || input.payer.trim().length === 0) return refused('receipt_payload_mismatch')
    const receipt = extractReceiptFromResponse(input.response)
    if (receipt === undefined) return refused('receipt_missing')
    const material = canonicalMaterial(receipt)
    if (material === undefined) return refused('receipt_oversized')

    let payload: { resourceUrl: string; network: string; payer: string; issuedAt: number }
    if (isEIP712SignedReceipt(receipt)) {
      const verified = await verifyReceiptSignatureEIP712(receipt)
      if (input.offer.signer.format !== 'eip712' || verified.signer.toLowerCase() !== input.offer.signer.signer)
        return refused('receipt_signer_mismatch')
      payload = verified.payload
    } else if (isJWSSignedReceipt(receipt)) {
      if (input.offer.signer.format !== 'jws') return refused('receipt_signer_mismatch')
      const header = extractJWSHeader(receipt.signature)
      if (header.kid !== input.offer.signer.kid || !didWebHost(header.kid, input.offer.signer.originHost))
        return refused('receipt_signer_mismatch')
      const jwsPayload = await verifyReceiptSignatureJWS(receipt)
      payload = jwsPayload
    } else {
      return refused('receipt_malformed')
    }

    const receiptPayload = payload
    if (!boundedTime(receiptPayload.issuedAt)) return refused('receipt_payload_mismatch')
    if (receiptPayload.issuedAt > input.nowSeconds) return refused('receipt_future')
    if (input.nowSeconds - receiptPayload.issuedAt >= input.offer.maxTimeoutSeconds) return refused('receipt_stale')
    if (
      receiptPayload.resourceUrl !== input.offer.resourceUrl
      || receiptPayload.network !== input.offer.offer.network
      || receiptPayload.payer.toLowerCase() !== input.payer.toLowerCase()
      || receiptPayload.issuedAt > input.offer.offer.validUntil
      || !verifyReceiptMatchesOffer(receipt, input.offer.offer, [input.payer], input.offer.maxTimeoutSeconds)
    ) return refused('receipt_payload_mismatch')

    return { kind: 'verified', serializedReceipt: material.serialized, receiptDigest: material.digest }
  } catch {
    return refused('receipt_signature_invalid')
  }
}
