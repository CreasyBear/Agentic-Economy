import { CdpClient } from '@coinbase/cdp-sdk'
import {
  applySpendControls,
  type SpendControls,
} from '@coinbase/cdp-sdk/x402'
import { x402Client } from '@x402/core/client'
import {
  decodePaymentSignatureHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http'
import type { PaymentPayload, PaymentRequired } from '@x402/core/types'
import {
  isEIP3009Payload,
  type ClientEvmSigner,
  type ExactEvmPayloadV2,
} from '@x402/evm'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import {
  appendPaymentIdentifierToExtensions,
  extractPaymentIdentifier,
  isPaymentIdentifierExtension,
} from '@x402/extensions/payment-identifier'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'

import {
  cdpX402CustodyConfigurationFromEnvironment,
  type CdpX402CustodyConfiguration,
} from './server-credential'
import type { X402PaymentSignatureRequest } from '../route-transport-runtime'

export const BASE_NETWORK = 'eip155:8453' as const
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
export const PAYMENT_SIGNING_IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type CdpClientLike = Readonly<{
  policies: Readonly<{
    getPolicyById: (options: Readonly<{ id: string }>) => Promise<Readonly<{
      id: string
      scope: 'account' | 'project'
    }>>
  }>
  evm: Readonly<{
    getAccount: (options: Readonly<{ name: string }>) => Promise<Readonly<{
      address: string
      policies?: readonly string[]
    }>>
    signTypedData: (options: Readonly<{
      address: string
      domain: Record<string, unknown>
      types: Record<string, unknown>
      primaryType: string
      message: Record<string, unknown>
      idempotencyKey: string
    }>) => Promise<Readonly<{ signature: string }>>
  }>
}>

type CdpX402Resource = Readonly<{
  url: string
  description?: string
  mimeType?: string
}>

type CdpX402AcceptedRequirement = Readonly<{
  scheme: string
  network: `${string}:${string}`
  amount: string
  asset: string
  payTo: string
  maxTimeoutSeconds: number
  extra: Readonly<Record<string, unknown>>
}>

type CdpX402Authorization = Readonly<{
  from: string
  to: string
  value: string
  validAfter: string
  validBefore: string
  nonce: string
}>

type CdpX402TypedData = Readonly<{
  domain: Record<string, unknown>
  types: Record<string, unknown>
  primaryType: string
  message: Record<string, unknown>
}>

export type CdpX402PaymentUnsignedMaterial = Readonly<{
  x402Version: number
  resource: CdpX402Resource
  accepted: CdpX402AcceptedRequirement
  extensions?: Readonly<Record<string, unknown>>
  authorization: CdpX402Authorization
  typedData: CdpX402TypedData
}>

export type CdpX402PaymentSigningIntent = Readonly<{
  paymentUnsignedMaterialJson: string
  paymentUnsignedMaterialDigest: string
  paymentSigningIdempotencyKey: string
  paymentPayer: string
  paymentNonce: string
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
  requestFingerprint: string
}>

export type CdpX402PaymentSignerDependencies = Readonly<{
  environment?: StringEnvironment
  createClient?: (configuration: CdpX402CustodyConfiguration) => CdpClientLike
  persistedIntent?: CdpX402PaymentSigningIntent
  onUnsignedMaterial?: (intent: CdpX402PaymentSigningIntent) => Promise<void> | void
  requestFingerprintContext?: CdpX402RequestFingerprintContext
}>

export type CdpX402PaymentAuthorization = Readonly<{
  paymentSignatureDigest: string
  paymentPayer: string
  paymentNonce: string
  requestFingerprint: string
}>

export type CdpX402RequestFingerprintContext = Readonly<{
  method: 'GET' | 'POST'
  operationRef: string
}>

/** Binds one CDP authorization to the exact x402 request it is allowed to pay. */
export function cdpX402RequestFingerprint(
  request: X402PaymentSignatureRequest,
  context: CdpX402RequestFingerprintContext,
): string {
  return canonicalDigest({
    version: 1,
    network: request.selectedRequirement.network,
    asset: normalizeIdentityString(request.selectedRequirement.asset),
    amount: request.selectedRequirement.amount,
    payTo: normalizeIdentityString(request.selectedRequirement.payTo),
    route: request.challenge.resource.url,
    method: context.method,
    operationRef: context.operationRef,
    paymentIdentifier: request.paymentIdentifier,
    challengeDigest: canonicalDigest(request.challenge),
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
    const requestFingerprint = cdpX402RequestFingerprint(request, context)
    if (
      expectedRequestFingerprint !== undefined
      && expectedRequestFingerprint !== requestFingerprint
    ) return undefined
    const selectedRequirement = request.selectedRequirement
    const selectedTransferMethod = selectedRequirement.extra.assetTransferMethod
    if (
      request.challenge.x402Version !== 2
      || selectedRequirement.scheme !== 'exact'
      || selectedRequirement.network !== BASE_NETWORK
      || selectedRequirement.asset.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()
      || !decimalAtomicAmount(selectedRequirement.amount)
      || !isEip3009TransferMethod(selectedTransferMethod)
      || !request.challenge.accepts.some(
        (candidate) => canonicalDigest(candidate) === canonicalDigest(selectedRequirement),
      )
    ) return undefined

    const decoded = decodePaymentSignatureHeader(paymentSignature)
    const returnedTransferMethod = isRecord(decoded.accepted.extra)
      ? decoded.accepted.extra.assetTransferMethod
      : undefined
    if (
      decoded.x402Version !== 2
      || decoded.accepted.scheme !== selectedRequirement.scheme
      || decoded.accepted.network !== selectedRequirement.network
      || decoded.accepted.asset.toLowerCase() !== selectedRequirement.asset.toLowerCase()
      || decoded.accepted.amount !== selectedRequirement.amount
      || decoded.accepted.payTo.toLowerCase() !== selectedRequirement.payTo.toLowerCase()
      || !isEip3009TransferMethod(returnedTransferMethod)
      || canonicalDigest(decoded.accepted) !== canonicalDigest(selectedRequirement)
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
  } catch {
    return undefined
  }
}

/**
 * Creates a payment header using a captured, unsigned x402 intent. New
 * intents invoke the official scheme once, persist through onUnsignedMaterial,
 * and only then call CDP's direct typed-data signing endpoint. A persisted
 * intent never invokes the scheme again.
 */
export async function createCdpEvmX402PaymentSignature(
  request: X402PaymentSignatureRequest,
  dependencies: CdpX402PaymentSignerDependencies = {},
): Promise<string | undefined> {
  const configuration = cdpX402CustodyConfigurationFromEnvironment(
    dependencies.environment,
  )
  if (configuration === undefined) return undefined

  const identifier = paymentIdentifier(request.paymentIdentifier)
  const fingerprintContext = dependencies.requestFingerprintContext ?? {
    method: 'GET' as const,
    operationRef: `cdp-x402:${identifier}`,
  }
  const requestFingerprint = cdpX402RequestFingerprint(request, fingerprintContext)

  let cdp: CdpClientLike
  let account: Awaited<ReturnType<CdpClientLike['evm']['getAccount']>>
  let required: PaymentRequired
  let offeredRequirement: X402PaymentSignatureRequest['selectedRequirement']
  try {
    const selectedDigest = canonicalDigest(request.selectedRequirement)
    const offered = request.challenge.accepts.find(
      (candidate) => canonicalDigest(candidate) === selectedDigest,
    )
    if (
      offered === undefined
      || !supportedRequirement(request, offered, configuration.maxAtomic)
    ) return undefined
    offeredRequirement = offered

    const extensions = request.challenge.extensions === undefined
      ? undefined
      : structuredClone(request.challenge.extensions)
    const paymentIdentifierExtension = extensions?.['payment-identifier']
    if (!isPaymentIdentifierExtension(paymentIdentifierExtension)) return undefined
    if (extensions === undefined) return undefined
    appendPaymentIdentifierToExtensions(extensions, identifier)

    cdp = dependencies.createClient?.(configuration)
      ?? (new CdpClient({
        apiKeyId: configuration.apiKeyId,
        apiKeySecret: configuration.apiKeySecret,
        walletSecret: configuration.walletSecret,
      }) as unknown as CdpClientLike)
    const [accountPolicy, projectPolicy] = await Promise.all([
      cdp.policies.getPolicyById({ id: configuration.accountPolicyId }),
      cdp.policies.getPolicyById({ id: configuration.projectPolicyId }),
    ])
    if (
      accountPolicy.id.toLowerCase() !== configuration.accountPolicyId
      || accountPolicy.scope !== 'account'
      || projectPolicy.id.toLowerCase() !== configuration.projectPolicyId
      || projectPolicy.scope !== 'project'
    ) return undefined
    account = await cdp.evm.getAccount({ name: configuration.accountName })
    if (
      !hasPolicy(account.policies, configuration.accountPolicyId)
      || !hasPolicy(account.policies, configuration.projectPolicyId)
      || !sameEvmAddress(account.address, configuration.expectedEvmAddress)
    ) return undefined

    required = {
      x402Version: request.challenge.x402Version,
      resource: { ...request.challenge.resource },
      accepts: [{ ...offeredRequirement, extra: { ...offeredRequirement.extra } }] as PaymentRequired['accepts'],
      extensions,
    }
  } catch {
    return undefined
  }

  let intent = dependencies.persistedIntent
  let material: CdpX402PaymentUnsignedMaterial | undefined
  if (intent !== undefined) {
    material = readPersistedUnsignedMaterial(
      intent,
      request,
      required,
      offeredRequirement,
      account.address,
      requestFingerprint,
    )
    if (material === undefined) throw new Error('x402_payment_unsigned_identity_conflict')
  } else {
    material = await captureUnsignedMaterial(required, account.address, configuration, identifier)
    if (material === undefined) return undefined
    const paymentSigningIdempotencyKey = crypto.randomUUID()
    if (!isPaymentSigningIdempotencyKey(paymentSigningIdempotencyKey)) {
      throw new Error('x402_payment_signing_idempotency_key_invalid')
    }
    intent = intentFromMaterial(
      material,
      paymentSigningIdempotencyKey,
      requestFingerprint,
    )
    await dependencies.onUnsignedMaterial?.(intent)
  }

  if (intent === undefined || material === undefined) {
    throw new Error('x402_payment_unsigned_identity_missing')
  }
  const signatureResult = await cdp!.evm.signTypedData({
    address: account!.address,
    domain: material.typedData.domain,
    types: material.typedData.types,
    primaryType: material.typedData.primaryType,
    message: material.typedData.message,
    idempotencyKey: intent.paymentSigningIdempotencyKey,
  })
  const signature = signatureResult.signature
  if (!isSignature(signature)) throw new Error('x402_payment_signature_invalid')

  const header = encodePaymentSignatureHeader(paymentPayloadFromMaterial(material, signature))
  const identity = readCdpX402PaymentAuthorization(
    header,
    request,
    fingerprintContext,
    requestFingerprint,
  )
  if (
    identity === undefined
    || identity.paymentPayer !== intent.paymentPayer
    || identity.paymentNonce !== intent.paymentNonce
  ) throw new Error('x402_payment_unsigned_identity_conflict')
  return header
}

async function captureUnsignedMaterial(
  required: PaymentRequired,
  address: string,
  configuration: CdpX402CustodyConfiguration,
  identifier: string,
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
    core.register(BASE_NETWORK, new ExactEvmScheme(captureSigner))
    applySpendControls(core, cdpX402SpendControls(configuration))
    const payload = await core.createPaymentPayload(required)
    if (
      payload.x402Version !== 2
      || payload.accepted === undefined
      || extractPaymentIdentifier(payload) !== identifier
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
        validBefore: authorization.validBefore,
        nonce: authorization.nonce,
      },
      typedData: capturedTypedData,
    }
    if (containsForbiddenSignatureKey(material)) return undefined
    canonicalDigest(material as StableHashValue)
    return JSON.parse(stableStringify(material as StableHashValue)) as CdpX402PaymentUnsignedMaterial
  } catch {
    return undefined
  }
}

function readPersistedUnsignedMaterial(
  intent: CdpX402PaymentSigningIntent,
  request: X402PaymentSignatureRequest,
  required: PaymentRequired,
  offeredRequirement: X402PaymentSignatureRequest['selectedRequirement'],
  accountAddress: string,
  requestFingerprint: string,
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
  } catch {
    return undefined
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
    || intent.paymentPayer !== parsed.authorization.from.toLowerCase()
    || intent.paymentNonce !== parsed.authorization.nonce.toLowerCase()
  ) return undefined
  return parsed
}

function intentFromMaterial(
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

function paymentAuthorizationExpiryFromValidBefore(
  value: unknown,
): Readonly<{
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
}> | undefined {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) return undefined
  let seconds: bigint
  try {
    seconds = BigInt(value)
  } catch {
    return undefined
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
  } catch {
    return undefined
  }
}

function paymentPayloadFromMaterial(
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

function cdpX402SpendControls(
  configuration: CdpX402CustodyConfiguration,
): SpendControls {
  return {
    maxAmountPerPayment: {
      atomic: configuration.maxAtomic,
      asset: BASE_USDC_ADDRESS,
    },
    maxCumulativeSpend: {
      atomic: configuration.dailyMaxAtomic,
      asset: BASE_USDC_ADDRESS,
    },
    maxCumulativeSpendWindow: '24h',
    allowedNetworks: [BASE_NETWORK],
    allowedAssets: [BASE_USDC_ADDRESS],
  }
}

function normalizeTypedDataRecord(value: Record<string, unknown>): Record<string, unknown> {
  return normalizeTypedDataValue(value) as Record<string, unknown>
}

function normalizeTypedDataValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString(10)
  if (typeof value === 'number' && Number.isInteger(value)) return value.toString(10)
  if (Array.isArray(value)) return value.map((entry) => normalizeTypedDataValue(entry))
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeTypedDataValue(entry)]),
    )
  }
  return value
}

function isUnsignedMaterial(value: unknown): value is CdpX402PaymentUnsignedMaterial {
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
  ) return false
  return true
}

function containsForbiddenSignatureKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenSignatureKey)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => (
    key === 'signature'
    || key === 'paymentSignature'
    || key === 'PAYMENT-SIGNATURE'
    || key === 'Payment-Signature'
    || containsForbiddenSignatureKey(child)
  ))
}

function hasPolicy(policies: readonly string[] | undefined, expectedPolicyId: string): boolean {
  return policies?.some((policyId) => policyId.toLowerCase() === expectedPolicyId) ?? false
}

function sameEvmAddress(left: string, right: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(left)
    && left.toLowerCase() === right
}

function supportedRequirement(
  request: X402PaymentSignatureRequest,
  requirement: X402PaymentSignatureRequest['selectedRequirement'],
  maxAtomic: bigint,
): boolean {
  try {
    if (
      request.challenge.x402Version !== 2
      || requirement.scheme !== 'exact'
      || requirement.network !== BASE_NETWORK
      || requirement.asset.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()
      || !decimalAtomicAmount(requirement.amount)
      || !isEip3009TransferMethod(requirement.extra.assetTransferMethod)
    ) return false
    const amount = BigInt(requirement.amount)
    return amount <= maxAtomic
  } catch {
    return false
  }
}

function isEip3009TransferMethod(value: unknown): boolean {
  return value === 'eip3009'
}

function paymentIdentifier(externalSpendIdentity: string): string {
  const normalized = `ae_${externalSpendIdentity.replace(/[^A-Za-z0-9_-]/g, '_')}`
  return normalized.slice(0, 128).padEnd(16, '_')
}

function normalizeIdentityString(value: string): string {
  return value.toLowerCase()
}

function isEvmAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
}

function decimalAtomicAmount(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,77})$/.test(value)
}

function isEip3009Nonce(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)
}

function isSignature(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{130}$/.test(value)
}
