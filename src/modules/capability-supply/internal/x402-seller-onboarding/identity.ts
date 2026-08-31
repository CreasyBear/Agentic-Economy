import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'

import type { X402SellerIdentity } from './types'
import { isNonzeroEvmAddress } from '../x402-evm-protocol'

const MAX_IDENTITY_VALUE_LENGTH = 2_048

function boundedNonEmpty(value: string): boolean {
  return value.length > 0
    && value.length <= MAX_IDENTITY_VALUE_LENGTH
    && value.trim() === value
}

export function validX402SellerIdentity(identity: X402SellerIdentity): boolean {
  let resource: URL
  try {
    resource = new URL(identity.resourceUrl)
  } catch {
    return false
  }
  return [
    identity.accountRef,
    identity.businessId,
    identity.offeringRef,
    identity.resourceUrl,
    identity.method,
    identity.network,
    identity.asset,
    identity.payTo,
    identity.providerAmount,
    identity.scheme,
  ].every(boundedNonEmpty)
    && isNonzeroEvmAddress(identity.payTo)
    && Number.isSafeInteger(identity.offeringRevision)
    && identity.offeringRevision > 0
    && resource.protocol === 'https:'
    && resource.username === ''
    && resource.password === ''
    && resource.hash === ''
    && /^[A-Z]+$/.test(identity.method)
    && /^\d+$/.test(identity.providerAmount)
    && BigInt(identity.providerAmount) > 0n
    && Number.isSafeInteger(identity.maxTimeoutSeconds)
    && identity.maxTimeoutSeconds > 0
    && identity.maxTimeoutSeconds <= 86_400
    && (identity.transferMethod === undefined || boundedNonEmpty(identity.transferMethod))
    && (identity.paymentFlow === undefined || boundedNonEmpty(identity.paymentFlow))
    && isCanonicalDigest(identity.offeringSourceHash)
    && isCanonicalDigest(identity.sourceDigest)
    && isCanonicalDigest(identity.contractDigest)
    && isCanonicalDigest(identity.pricingDigest)
}

export function x402SellerIdentityDigest(identity: X402SellerIdentity): string {
  if (!validX402SellerIdentity(identity)) throw new Error('x402_seller_identity_invalid')
  return canonicalDigest({
    format: 'ae-x402-seller-identity:v1',
    accountRef: identity.accountRef,
    businessId: identity.businessId,
    offeringRef: identity.offeringRef,
    offeringRevision: identity.offeringRevision,
    offeringSourceHash: identity.offeringSourceHash,
    resourceUrl: identity.resourceUrl,
    method: identity.method,
    network: identity.network,
    asset: identity.asset,
    payTo: identity.payTo,
    providerAmount: identity.providerAmount,
    scheme: identity.scheme,
    maxTimeoutSeconds: identity.maxTimeoutSeconds,
    ...(identity.transferMethod === undefined ? {} : { transferMethod: identity.transferMethod }),
    ...(identity.paymentFlow === undefined ? {} : { paymentFlow: identity.paymentFlow }),
    sourceDigest: identity.sourceDigest,
    contractDigest: identity.contractDigest,
    pricingDigest: identity.pricingDigest,
  })
}

export function copyX402SellerIdentity(identity: X402SellerIdentity): X402SellerIdentity {
  return {
    accountRef: identity.accountRef,
    businessId: identity.businessId,
    offeringRef: identity.offeringRef,
    offeringRevision: identity.offeringRevision,
    offeringSourceHash: identity.offeringSourceHash,
    resourceUrl: identity.resourceUrl,
    method: identity.method,
    network: identity.network,
    asset: identity.asset,
    payTo: identity.payTo,
    providerAmount: identity.providerAmount,
    scheme: identity.scheme,
    maxTimeoutSeconds: identity.maxTimeoutSeconds,
    ...(identity.transferMethod === undefined ? {} : { transferMethod: identity.transferMethod }),
    ...(identity.paymentFlow === undefined ? {} : { paymentFlow: identity.paymentFlow }),
    sourceDigest: identity.sourceDigest,
    contractDigest: identity.contractDigest,
    pricingDigest: identity.pricingDigest,
  }
}
