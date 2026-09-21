import { CdpClient } from '@coinbase/cdp-sdk'
import {
  appendPaymentIdentifierToExtensions,
  encodePaymentSignatureHeader,
  isPaymentIdentifierExtension,
  type PaymentRequired,
} from './cdp-x402-payment-signer'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { containsForbiddenSignatureKey } from '@/modules/common/forbidden-signature-key'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import { cdpX402CustodyConfigurationFromEnvironment } from './server-credential'
import {
  normalizeX402PaymentRequirement,
  x402PaymentProfileForEnvironment,
} from './x402-payment-profile'
import type { X402PaymentSignatureRequest } from './x402-challenge'
import {
  cdpX402RequestFingerprint,
  isPaymentSigningIdempotencyKey,
  readCdpX402PaymentAuthorization,
} from './cdp-x402-payment-authorization'
import type {
  CdpClientLike,
  CdpX402PaymentSignerDependencies,
  CdpX402PaymentSigningIntent,
  CdpX402PaymentUnsignedMaterial,
} from './cdp-x402-payment-contracts'
import {
  captureUnsignedMaterial,
  intentFromMaterial,
  paymentPayloadFromMaterial,
  readPersistedUnsignedMaterial,
} from './cdp-x402-payment-material'
import { cdpX402PolicyRulesDigest, cdpX402SellerCanaryPolicyIsExact } from './cdp-x402-payment-policy'
import {
  hasPolicy,
  isRecoverableUnsignedMaterial,
  isSignature,
  paymentAuthorizationExpiryFromValidBefore,
  paymentIdentifier,
  sameEvmAddress,
  supportedRequirement,
} from './cdp-x402-payment-validation'

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
      toolRef: `cdp-x402:${identifier}`,
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
      !cdpX402SellerCanaryPolicyIsExact(
        accountPolicy,
        projectPolicy,
        account.address,
        configuration.maxAtomic.toString(),
        profile.aeEnvironment,
      )
    ) return undefined

    required = {
      x402Version: request.challenge.x402Version,
      resource: { ...request.challenge.resource },
      accepts: [{ ...offeredRequirement, extra: { ...offeredRequirement.extra } }] as PaymentRequired['accepts'],
      ...(extensions === undefined ? {} : { extensions }),
    }
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'createCdpEvmX402PaymentSignature', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'replayCdpX402PaymentSigningIntent', reason: 'invalid_response' })
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
