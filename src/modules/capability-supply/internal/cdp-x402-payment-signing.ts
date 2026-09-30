import { CdpClient } from '@coinbase/cdp-sdk'
import { encodePaymentSignatureHeader } from '@x402/core/http'
import type { PaymentRequired } from '@x402/core/types'
import { appendPaymentIdentifierToExtensions, isPaymentIdentifierExtension } from '@x402/extensions/payment-identifier'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { containsForbiddenSignatureKey } from '@/modules/common/forbidden-signature-key'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import { cdpX402CustodyConfigurationFromEnvironment } from './server-credential'
import {
  normalizeX402PaymentRequirement,
  x402PaymentProfileForEnvironment,
} from './x402-payment-profile'
import {
  X402_MIN_AUTHORIZATION_VALIDITY_SECONDS,
  type X402PaymentSignatureRequest,
} from './x402-challenge'
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
import { cdpX402PolicyRulesDigest, cdpX402ManagedPolicyIsExact } from './cdp-x402-payment-policy'
import {
  hasPolicy,
  isExactUnsignedMaterial,
  isUnsignedMaterial,
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
 * Requires: exact supported USDC material and fresh committed admission.
 * Ensures: admission precedes CDP, then authority and lifetime are checked again.
 * Invariant: the frozen intent UUID and canonical material describe the CDP request.
 * On violation: refuse without signing; actual CDP signing errors propagate.
 */
export async function createCdpEvmX402PaymentSignature(
  request: X402PaymentSignatureRequest,
  dependencies: CdpX402PaymentSignerDependencies = {},
): Promise<string | undefined> {
  const admitSigning = dependencies.admitSigning
  if (typeof admitSigning !== 'function') return undefined
  const persistedIntent = dependencies.persistedIntent === undefined
    ? undefined
    : Object.freeze({ ...dependencies.persistedIntent })
  const authorityExpiresAt = dependencies.authorityExpiresAt
  if (
    typeof authorityExpiresAt !== 'number'
    || !Number.isSafeInteger(authorityExpiresAt)
    || authorityExpiresAt <= 0
  ) return undefined
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
      !cdpX402ManagedPolicyIsExact(
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

  let intent = persistedIntent
  let material: CdpX402PaymentUnsignedMaterial | undefined
  if (intent !== undefined) {
    material = readPersistedUnsignedMaterial(
      intent,
      request,
      required,
      offeredRequirement,
      account.address,
      requestFingerprint,
      authorityExpiresAt,
    )
    if (material === undefined) throw new Error('x402_payment_unsigned_identity_conflict')
  } else {
    material = await captureUnsignedMaterial(
      required,
      account.address,
      identifier,
      profile,
      authorityExpiresAt,
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
  if (
    !isExactUnsignedMaterial(material, profile, configuration.maxAtomic)
    || material.authorization.from.toLowerCase() !== account.address.toLowerCase()
  ) return undefined
  const signingIntent = boundSigningIntent(material, intent)
  if (signingIntent === undefined) return undefined
  if (!await admitExactSigning(signingIntent, admitSigning)) return undefined
  if (
    material.authorization.validBefore !== material.typedData.message.validBefore
    || signingIntent.paymentAuthorizationExpiresAt > authorityExpiresAt
    || authorityExpiresAt <= Date.now()
    || Number(material.authorization.validBefore)
      <= Math.floor(Date.now() / 1_000) + X402_MIN_AUTHORIZATION_VALIDITY_SECONDS
  ) return undefined
  const signatureResult = await cdp!.evm.signTypedData({
    address: account!.address,
    domain: material.typedData.domain,
    types: material.typedData.types,
    primaryType: material.typedData.primaryType,
    message: material.typedData.message,
    idempotencyKey: signingIntent.paymentSigningIdempotencyKey,
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
    || identity.paymentPayer !== signingIntent.paymentPayer
    || identity.paymentNonce !== signingIntent.paymentNonce
  ) throw new Error('x402_payment_unsigned_identity_conflict')
  return header
}

/**
 * Forensic replay for an already-persisted signing intent. Unlike normal
 * signing, this permits expired, valid material under the same idempotency
 * key after fresh admission. Malformed historical material is refused. It never
 * builds a payment header or starts provider transport.
 */
export async function replayCdpX402PaymentSigningIntent(
  intent: CdpX402PaymentSigningIntent,
  dependencies: Pick<CdpX402PaymentSignerDependencies,
    'environment' | 'aeEnvironment' | 'createClient' | 'admitSigning'> = {},
): Promise<string | undefined> {
  const admitSigning = dependencies.admitSigning
  if (typeof admitSigning !== 'function') return undefined
  intent = Object.freeze({ ...intent })
  if (!isPaymentSigningIdempotencyKey(intent.paymentSigningIdempotencyKey)) return undefined
  let material: CdpX402PaymentUnsignedMaterial
  try {
    const parsed: unknown = JSON.parse(intent.paymentUnsignedMaterialJson)
    if (
      !isUnsignedMaterial(parsed)
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
  const profile = x402PaymentProfileForEnvironment(
    dependencies.aeEnvironment ?? 'production',
  )
  if (
    profile === undefined
    || !isExactUnsignedMaterial(material, profile, configuration.maxAtomic)
  ) return undefined
  const signingIntent = boundSigningIntent(material, intent)
  if (signingIntent === undefined) return undefined
  let cdp: CdpClientLike
  let account: Awaited<ReturnType<CdpClientLike['evm']['getAccount']>>
  try {
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
      || cdpX402PolicyRulesDigest(accountPolicy, projectPolicy) !== configuration.policyRulesDigest
    ) return undefined
    account = await cdp.evm.getAccount({ name: configuration.accountName })
    if (
      !hasPolicy(account.policies, configuration.accountPolicyId)
      || !hasPolicy(account.policies, configuration.projectPolicyId)
      || !sameEvmAddress(account.address, configuration.expectedEvmAddress)
      || account.address.toLowerCase() !== signingIntent.paymentPayer
      || !cdpX402ManagedPolicyIsExact(
        accountPolicy,
        projectPolicy,
        account.address,
        configuration.maxAtomic.toString(),
        profile.aeEnvironment,
      )
    ) return undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'replayCdpX402PaymentSigningIntent', reason: 'source_unavailable' })
  }
  if (!await admitExactSigning(signingIntent, admitSigning)) return undefined
  const result = await cdp.evm.signTypedData({
    address: account.address,
    domain: material.typedData.domain,
    types: material.typedData.types,
    primaryType: material.typedData.primaryType,
    message: material.typedData.message,
    idempotencyKey: signingIntent.paymentSigningIdempotencyKey,
  })
  return isSignature(result.signature) ? result.signature : undefined
}

/** Snapshot the exact intent: admission cannot mutate its UUID or canonical material. */
function boundSigningIntent(
  material: CdpX402PaymentUnsignedMaterial,
  intent: CdpX402PaymentSigningIntent,
): CdpX402PaymentSigningIntent | undefined {
  const bound = intentFromMaterial(
    material,
    intent.paymentSigningIdempotencyKey,
    intent.requestFingerprint,
  )
  return stableStringify(bound as StableHashValue) === stableStringify(intent as StableHashValue)
    ? bound
    : undefined
}

/** Callback refusal/failure has no CDP side effect and cannot be a CDP rejection. */
async function admitExactSigning(
  intent: CdpX402PaymentSigningIntent,
  admitSigning: NonNullable<CdpX402PaymentSignerDependencies['admitSigning']>,
): Promise<boolean> {
  try {
    return await admitSigning(Object.freeze({ ...intent })) === true
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'admitCdpX402PaymentSigning', reason: 'source_unavailable' })
  }
}
