import { CdpClient } from '@coinbase/cdp-sdk'
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
import { isBoundedJsonValue, type JsonValue } from '@/modules/common/bounded-json'
import { containsForbiddenSignatureKey } from '@/modules/common/forbidden-signature-key'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'

import {
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
  type CdpX402CustodyConfiguration,
} from './server-credential'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_USDC_ADDRESS,
  isX402PaymentRequirementForProfile,
  normalizeX402PaymentRequirement,
  x402PaymentProfileForEnvironment,
  type X402AeEnvironment,
  type X402PaymentProfile,
} from './x402-payment-profile'
import type { X402PaymentSignatureRequest } from '../route-transport-runtime'

/** @deprecated Use the explicit payment profile constants for new code. */
export const BASE_NETWORK = BASE_MAINNET_NETWORK
/** @deprecated Use the explicit payment profile constants for new code. */
export const BASE_USDC_ADDRESS = BASE_MAINNET_USDC_ADDRESS
export const PAYMENT_SIGNING_IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const MAX_CDP_POLICY_RULES = 10
const MAX_CDP_POLICY_RULES_BYTES = 64 * 1024
const utf8Encoder = new TextEncoder()

export type CdpX402PolicyIdentity = Readonly<{
  id: string
  scope: 'account' | 'project'
  rules: readonly unknown[]
}>

type CdpClientLike = Readonly<{
  policies: Readonly<{
    getPolicyById: (
      options: Readonly<{ id: string }>,
    ) => Promise<CdpX402PolicyIdentity>
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
    listTokenBalances?: (options: Readonly<{
      address: `0x${string}`
      network: 'base' | 'base-sepolia'
      pageSize: number
      pageToken?: string
    }>) => Promise<Readonly<{
      balances: readonly Readonly<{
        token: Readonly<{ contractAddress: string; network: string }>
        amount: Readonly<{ amount: bigint; decimals: number }>
      }>[]
      nextPageToken?: string
    }>>
  }>
}>

export type CdpX402TreasuryObservation = Readonly<{
  environment: X402AeEnvironment
  custodyRef: string
  custodyGeneration: number
  network: string
  asset: 'USDC'
  exponent: 6
  totalUnits: string
  evidenceRef: string
  evidenceDigest: string
  observedAt: number
}>

export type CdpX402TreasuryObserverDependencies = Readonly<{
  environment?: StringEnvironment
  createClient?: (configuration: CdpX402CustodyConfiguration) => CdpClientLike
  now?: () => number
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
  aeEnvironment?: X402AeEnvironment
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
  aeEnvironment?: X402AeEnvironment
}>

/**
 * Reads only the configured x402 wallet's USDC balance through the maintained
 * CDP client. The returned evidence contains no API key, wallet secret,
 * signature, raw provider payload, or unrestricted token list.
 */
export async function observeCdpX402Treasury(
  aeEnvironment: X402AeEnvironment,
  dependencies: CdpX402TreasuryObserverDependencies = {},
): Promise<CdpX402TreasuryObservation | undefined> {
  const configuration = cdpX402CustodyConfigurationFromEnvironment(
    dependencies.environment,
  )
  const profile = x402PaymentProfileForEnvironment(aeEnvironment)
  if (configuration === undefined || profile === undefined) return undefined
  const client = dependencies.createClient?.(configuration)
    ?? (new CdpClient({
      apiKeyId: configuration.apiKeyId,
      apiKeySecret: configuration.apiKeySecret,
      walletSecret: configuration.walletSecret,
    }) as CdpClientLike)
  if (client.evm.listTokenBalances === undefined) return undefined
  try {
    const account = await client.evm.getAccount({ name: configuration.accountName })
    if (!sameEvmAddress(account.address, configuration.expectedEvmAddress)) return undefined
    const sdkNetwork = aeEnvironment === 'sandbox' ? 'base-sepolia' : 'base'
    let pageToken: string | undefined
    let pages = 0
    let total = 0n
    do {
      const page = await client.evm.listTokenBalances({
        address: account.address as `0x${string}`,
        network: sdkNetwork,
        pageSize: 100,
        ...(pageToken === undefined ? {} : { pageToken }),
      })
      for (const balance of page.balances) {
        if (
          balance.token.contractAddress.toLowerCase() === profile.asset.toLowerCase()
          && balance.amount.decimals === 6
        ) total += balance.amount.amount
      }
      pageToken = page.nextPageToken
      pages += 1
    } while (pageToken !== undefined && pages < 4)
    if (pageToken !== undefined || total < 0n) return undefined
    const observedAt = (dependencies.now ?? Date.now)()
    if (!Number.isSafeInteger(observedAt) || observedAt < 0) return undefined
    const material = {
      format: 'ae.x402-treasury-observation:v1',
      environment: aeEnvironment,
      custodyRef: cdpX402CustodyBudgetRef(configuration, aeEnvironment),
      custodyGeneration: configuration.credentialGeneration,
      network: profile.network,
      asset: 'USDC' as const,
      exponent: 6 as const,
      totalUnits: total.toString(),
      observedAt,
    }
    const evidenceDigest = canonicalDigest(material)
    return {
      environment: material.environment,
      custodyRef: material.custodyRef,
      custodyGeneration: material.custodyGeneration,
      network: material.network,
      asset: material.asset,
      exponent: material.exponent,
      totalUnits: material.totalUnits,
      evidenceRef: `cdp-balance:${evidenceDigest.slice('sha256:'.length)}`,
      evidenceDigest,
      observedAt: material.observedAt,
    }
  } catch {
    return undefined
  }
}

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
    operationRef: context.operationRef,
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
 * Seals the exact non-secret policy documents that are allowed to govern CDP
 * signing. Descriptions and timestamps are deliberately excluded; policy IDs,
 * scopes, rule order, criteria, conditions, contracts, payees, and caps remain
 * inside the canonical digest.
 */
export function cdpX402PolicyRulesDigest(
  accountPolicy: CdpX402PolicyIdentity,
  projectPolicy: CdpX402PolicyIdentity,
): string | undefined {
  const accountRules = boundedCdpPolicyRules(accountPolicy.rules)
  const projectRules = boundedCdpPolicyRules(projectPolicy.rules)
  if (accountRules === undefined || projectRules === undefined) return undefined
  const material = {
    kind: 'ae.x402.cdp-policy-rules:v1',
    accountPolicy: {
      id: accountPolicy.id.toLowerCase(),
      scope: accountPolicy.scope,
      rules: accountRules,
    },
    projectPolicy: {
      id: projectPolicy.id.toLowerCase(),
      scope: projectPolicy.scope,
      rules: projectRules,
    },
  } as const
  const encoded = stableStringify(material)
  if (utf8Encoder.encode(encoded).byteLength > MAX_CDP_POLICY_RULES_BYTES) {
    return undefined
  }
  return canonicalDigest(material)
}

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  primaryType: 'TransferWithAuthorization',
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  },
} as const

/**
 * CDP's policy engine is fail-secure: a request is rejected when no accept
 * rule matches. The seller canary therefore uses a payee-agnostic wallet rule
 * and keeps the dynamic seller address inside AE's canonical Operation,
 * request fingerprint, reservation, and per-call/daily budget fences.
 */
export function cdpX402SellerCanaryPolicyRules(
  payerAddress: string,
  maximumAtomic: string,
): Readonly<{ accountRules: readonly unknown[]; projectRules: readonly unknown[] }> {
  return {
    accountRules: [{
      action: 'accept',
      operation: 'signEvmTypedData',
      criteria: [{
        type: 'evmTypedDataVerifyingContract',
        addresses: [BASE_SEPOLIA_USDC_ADDRESS],
        operator: 'in',
      }, {
        type: 'evmTypedDataField',
        conditions: [{
          path: 'from',
          operator: 'in',
          addresses: [payerAddress],
        }, {
          path: 'value',
          operator: '<=',
          value: maximumAtomic,
        }],
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      }],
    }],
    projectRules: [{
      action: 'reject',
      operation: 'signEvmTypedData',
      criteria: [{
        type: 'evmTypedDataVerifyingContract',
        addresses: [BASE_SEPOLIA_USDC_ADDRESS],
        operator: 'not in',
      }],
    }, {
      action: 'reject',
      operation: 'signEvmTypedData',
      criteria: [{
        type: 'evmTypedDataField',
        conditions: [{
          path: 'value',
          operator: '>',
          value: maximumAtomic,
        }],
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      }],
    }],
  }
}

export function cdpX402SellerCanaryPolicyIsExact(
  accountPolicy: CdpX402PolicyIdentity,
  projectPolicy: CdpX402PolicyIdentity,
  payerAddress: string,
  maximumAtomic: string,
): boolean {
  const expected = cdpX402SellerCanaryPolicyRules(payerAddress, maximumAtomic)
  return canonicalDigest(accountPolicy.rules as StableHashValue)
      === canonicalDigest(expected.accountRules as StableHashValue)
    && canonicalDigest(projectPolicy.rules as StableHashValue)
      === canonicalDigest(expected.projectRules as StableHashValue)
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
  const requestedAeEnvironment = dependencies.aeEnvironment
    ?? dependencies.requestFingerprintContext?.aeEnvironment
    ?? 'production'
  if (
    dependencies.aeEnvironment !== undefined
    && dependencies.requestFingerprintContext?.aeEnvironment !== undefined
    && dependencies.aeEnvironment !== dependencies.requestFingerprintContext.aeEnvironment
  ) return undefined
  const profile = x402PaymentProfileForEnvironment(requestedAeEnvironment)
  if (profile === undefined) return undefined
  const configuration = cdpX402CustodyConfigurationFromEnvironment(
    dependencies.environment,
  )
  if (configuration === undefined) return undefined

  const identifier = paymentIdentifier(request.paymentIdentifier)
  const fingerprintContext = {
    ...(dependencies.requestFingerprintContext ?? {
      method: 'GET' as const,
      operationRef: `cdp-x402:${identifier}`,
    }),
    aeEnvironment: profile.aeEnvironment,
  }
  const requestFingerprint = cdpX402RequestFingerprint(request, fingerprintContext)

  let cdp: CdpClientLike
  let account: Awaited<ReturnType<CdpClientLike['evm']['getAccount']>>
  let required: PaymentRequired
  let offeredRequirement: X402PaymentSignatureRequest['selectedRequirement']
  try {
    const selectedDigest = canonicalDigest(
      normalizeX402PaymentRequirement(request.selectedRequirement),
    )
    const offered = request.challenge.accepts.find(
      (candidate) => canonicalDigest(normalizeX402PaymentRequirement(candidate))
        === selectedDigest,
    )
    if (
      offered === undefined
      || !supportedRequirement(request, offered, profile, configuration.maxAtomic)
    ) return undefined
    offeredRequirement = normalizeX402PaymentRequirement(offered)

    const extensions = request.challenge.extensions === undefined
      ? undefined
      : structuredClone(request.challenge.extensions)
    const paymentIdentifierExtension = extensions?.['payment-identifier']
    if (extensions !== undefined && paymentIdentifierExtension !== undefined) {
      if (!isPaymentIdentifierExtension(paymentIdentifierExtension)) return undefined
      appendPaymentIdentifierToExtensions(extensions, identifier)
    }

    cdp = dependencies.createClient?.(configuration)
      ?? (new CdpClient({
        apiKeyId: configuration.apiKeyId,
        apiKeySecret: configuration.apiKeySecret,
        walletSecret: configuration.walletSecret,
      }) as CdpClientLike)
    const [accountPolicy, projectPolicy] = await Promise.all([
      cdp.policies.getPolicyById({ id: configuration.accountPolicyId }),
      cdp.policies.getPolicyById({ id: configuration.projectPolicyId }),
    ])
    if (
      accountPolicy.id.toLowerCase() !== configuration.accountPolicyId
      || accountPolicy.scope !== 'account'
      || projectPolicy.id.toLowerCase() !== configuration.projectPolicyId
      || projectPolicy.scope !== 'project'
      || cdpX402PolicyRulesDigest(accountPolicy, projectPolicy)
        !== configuration.policyRulesDigest
    ) return undefined
    account = await cdp.evm.getAccount({ name: configuration.accountName })
    if (
      !hasPolicy(account.policies, configuration.accountPolicyId)
      || !hasPolicy(account.policies, configuration.projectPolicyId)
      || !sameEvmAddress(account.address, configuration.expectedEvmAddress)
    ) return undefined
    if (
      profile.aeEnvironment === 'sandbox'
      && !cdpX402SellerCanaryPolicyIsExact(
        accountPolicy,
        projectPolicy,
        account.address,
        configuration.maxAtomic.toString(),
      )
    ) return undefined

    required = {
      x402Version: request.challenge.x402Version,
      resource: { ...request.challenge.resource },
      accepts: [{ ...offeredRequirement, extra: { ...offeredRequirement.extra } }] as PaymentRequired['accepts'],
      ...(extensions === undefined ? {} : { extensions }),
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
    material = await captureUnsignedMaterial(
      required,
      account.address,
      identifier,
      profile,
    )
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

/**
 * Forensic replay for an already-persisted signing intent. Unlike normal
 * signing, this permits an historically malformed EIP-712 domain so CDP can
 * replay the exact old request under the same idempotency key. It never builds
 * a payment header or starts provider transport.
 */
export async function replayCdpX402PaymentSigningIntent(
  intent: CdpX402PaymentSigningIntent,
  dependencies: Pick<CdpX402PaymentSignerDependencies, 'environment' | 'createClient'> = {},
): Promise<string | undefined> {
  if (!isPaymentSigningIdempotencyKey(intent.paymentSigningIdempotencyKey)) return undefined
  let material: CdpX402PaymentUnsignedMaterial
  try {
    const parsed: unknown = JSON.parse(intent.paymentUnsignedMaterialJson)
    if (
      !isRecoverableUnsignedMaterial(parsed)
      || containsForbiddenSignatureKey(parsed)
      || stableStringify(parsed as StableHashValue) !== intent.paymentUnsignedMaterialJson
      || canonicalDigest(parsed) !== intent.paymentUnsignedMaterialDigest
      || parsed.authorization.from.toLowerCase() !== intent.paymentPayer
      || parsed.authorization.nonce.toLowerCase() !== intent.paymentNonce
      || parsed.authorization.validBefore !== intent.paymentAuthorizationValidBefore
      || paymentAuthorizationExpiryFromValidBefore(parsed.typedData.message.validBefore)
        ?.paymentAuthorizationExpiresAt !== intent.paymentAuthorizationExpiresAt
    ) return undefined
    material = parsed
  } catch {
    return undefined
  }
  const configuration = cdpX402CustodyConfigurationFromEnvironment(dependencies.environment)
  if (configuration === undefined) return undefined
  const cdp = dependencies.createClient?.(configuration)
    ?? (new CdpClient({
      apiKeyId: configuration.apiKeyId,
      apiKeySecret: configuration.apiKeySecret,
      walletSecret: configuration.walletSecret,
    }) as CdpClientLike)
  const [accountPolicy, projectPolicy] = await Promise.all([
    cdp.policies.getPolicyById({ id: configuration.accountPolicyId }),
    cdp.policies.getPolicyById({ id: configuration.projectPolicyId }),
  ])
  if (
    accountPolicy.id.toLowerCase() !== configuration.accountPolicyId
    || accountPolicy.scope !== 'account'
    || projectPolicy.id.toLowerCase() !== configuration.projectPolicyId
    || projectPolicy.scope !== 'project'
    || cdpX402PolicyRulesDigest(accountPolicy, projectPolicy) !== configuration.policyRulesDigest
  ) return undefined
  const account = await cdp.evm.getAccount({ name: configuration.accountName })
  if (
    !hasPolicy(account.policies, configuration.accountPolicyId)
    || !hasPolicy(account.policies, configuration.projectPolicyId)
    || !sameEvmAddress(account.address, configuration.expectedEvmAddress)
    || account.address.toLowerCase() !== intent.paymentPayer
  ) return undefined
  const result = await cdp.evm.signTypedData({
    address: account.address,
    domain: material.typedData.domain,
    types: material.typedData.types,
    primaryType: material.typedData.primaryType,
    message: material.typedData.message,
    idempotencyKey: intent.paymentSigningIdempotencyKey,
  })
  return isSignature(result.signature) ? result.signature : undefined
}

async function captureUnsignedMaterial(
  required: PaymentRequired,
  address: string,
  identifier: string,
  profile: X402PaymentProfile,
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
    || parsed.typedData.domain.chainId !== chainIdFromNetwork(offeredRequirement.network)
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

function normalizeTypedDataRecord(value: Record<string, unknown>): Record<string, unknown> {
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

function isUnsignedMaterial(value: unknown): value is CdpX402PaymentUnsignedMaterial {
  return isUnsignedMaterialShape(value, true)
}

function isRecoverableUnsignedMaterial(value: unknown): value is CdpX402PaymentUnsignedMaterial {
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

function chainIdFromNetwork(network: string): number | undefined {
  const match = /^eip155:([1-9][0-9]*)$/.exec(network)
  if (match?.[1] === undefined) return undefined
  const chainId = Number(match[1])
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : undefined
}

function hasPolicy(policies: readonly string[] | undefined, expectedPolicyId: string): boolean {
  return policies?.some((policyId) => policyId.toLowerCase() === expectedPolicyId) ?? false
}

function boundedCdpPolicyRules(value: unknown): readonly JsonValue[] | undefined {
  if (
    !Array.isArray(value)
    || value.length < 1
    || value.length > MAX_CDP_POLICY_RULES
    || !isBoundedJsonValue(value)
    || value.some((rule) => !isRecord(rule))
  ) return undefined
  return value
}

function sameEvmAddress(left: string, right: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(left)
    && left.toLowerCase() === right
}

function supportedRequirement(
  request: X402PaymentSignatureRequest,
  requirement: X402PaymentSignatureRequest['selectedRequirement'],
  profile: X402PaymentProfile,
  maxAtomic: bigint,
): boolean {
  return request.challenge.x402Version === 2
    && isX402PaymentRequirementForProfile(requirement, profile, maxAtomic)
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
