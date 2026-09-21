import { degradeBackend } from '@/lib/observability/degrade-backend'
import { isRecord } from '@/modules/common/is-record'

import { isX402PaymentRequirementForProfile, type X402PaymentProfile } from './x402-payment-profile'
import type { X402PaymentSignatureRequest } from './x402-challenge'
import type { CdpX402PaymentUnsignedMaterial } from './cdp-x402-payment-contracts'

export function paymentAuthorizationExpiryFromValidBefore(
  value: unknown,
): Readonly<{
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
}> | undefined {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) return undefined
  let seconds: bigint
  try {
    seconds = BigInt(value)
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'paymentAuthorizationExpiryFromValidBefore', reason: 'invalid_response' })
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
      ? { paymentAuthorizationValidBefore: value, paymentAuthorizationExpiresAt: expiresAt }
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'paymentAuthorizationExpiryFromValidBefore', reason: 'invalid_response' })
  }
}


export function normalizeTypedDataRecord(value: Record<string, unknown>): Record<string, unknown> {
  return normalizeTypedDataValue(value) as Record<string, unknown>
}

function normalizeTypedDataValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString(10)
  if (Array.isArray(value)) return value.map((entry) => normalizeTypedDataValue(entry))
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeTypedDataValue(entry)]),
    )
  }
  return value
}

export function isUnsignedMaterial(value: unknown): value is CdpX402PaymentUnsignedMaterial {
  return isUnsignedMaterialShape(value, true)
}

export function isRecoverableUnsignedMaterial(value: unknown): value is CdpX402PaymentUnsignedMaterial {
  return isUnsignedMaterialShape(value, false)
}

function isUnsignedMaterialShape(
  value: unknown,
  requireSchemaValidDomain: boolean,
): value is CdpX402PaymentUnsignedMaterial {
  if (!isRecord(value) || value.x402Version !== 2) return false
  if (!isRecord(value.resource) || typeof value.resource.url !== 'string') return false
  if (!isRecord(value.accepted) || !isRecord(value.accepted.extra)) return false
  if (
    typeof value.accepted.scheme !== 'string'
    || typeof value.accepted.network !== 'string'
    || typeof value.accepted.amount !== 'string'
    || typeof value.accepted.asset !== 'string'
    || typeof value.accepted.payTo !== 'string'
    || typeof value.accepted.maxTimeoutSeconds !== 'number'
  ) return false
  if (!isRecord(value.authorization)) return false
  if (
    typeof value.authorization.from !== 'string'
    || typeof value.authorization.to !== 'string'
    || typeof value.authorization.value !== 'string'
    || typeof value.authorization.validAfter !== 'string'
    || typeof value.authorization.validBefore !== 'string'
    || typeof value.authorization.nonce !== 'string'
  ) return false
  if (!isRecord(value.typedData)) return false
  if (
    !isRecord(value.typedData.domain)
    || !isRecord(value.typedData.types)
    || typeof value.typedData.primaryType !== 'string'
    || !isRecord(value.typedData.message)
    || (requireSchemaValidDomain && (
      typeof value.typedData.domain.chainId !== 'number'
      || !Number.isSafeInteger(value.typedData.domain.chainId)
      || value.typedData.domain.chainId <= 0
    ))
  ) return false
  return true
}

export function chainIdFromNetwork(network: string): number | undefined {
  const match = /^eip155:([1-9][0-9]*)$/.exec(network)
  if (match?.[1] === undefined) return undefined
  const chainId = Number(match[1])
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : undefined
}

export function hasPolicy(policies: readonly string[] | undefined, expectedPolicyId: string): boolean {
  return policies?.some((policyId) => policyId.toLowerCase() === expectedPolicyId) ?? false
}

export function sameEvmAddress(left: string, right: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(left)
    && left.toLowerCase() === right
}

export function supportedRequirement(
  request: X402PaymentSignatureRequest,
  requirement: X402PaymentSignatureRequest['selectedRequirement'],
  profile: X402PaymentProfile,
  maxAtomic: bigint,
): boolean {
  return request.challenge.x402Version === 2
    && isX402PaymentRequirementForProfile(requirement, profile, maxAtomic)
}

export function paymentIdentifier(externalSpendIdentity: string): string {
  const normalized = `ae_${externalSpendIdentity.replace(/[^A-Za-z0-9_-]/g, '_')}`
  return normalized.slice(0, 128).padEnd(16, '_')
}

export function normalizeIdentityString(value: string): string {
  return value.toLowerCase()
}

export function isEvmAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
}

export function decimalAtomicAmount(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,77})$/.test(value)
}

export function isEip3009Nonce(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)
}

export function isSignature(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{130}$/.test(value)
}
