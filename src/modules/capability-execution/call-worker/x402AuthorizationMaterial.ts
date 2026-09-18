import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
  isPaymentSigningIdempotencyKey,
} from '@/modules/capability-supply/server'
import type {
  X402PaymentSignatureRequest,
  X402PreparedAuthorization,
  X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedTool } from '@/modules/capability-supply/public'
import { degradeBackend } from '@/lib/observability/degrade-backend'

export type PreparedX402AuthorizationWithFingerprint = X402PreparedAuthorization & Readonly<{
  requestFingerprint?: string
}>

export type StoredX402Authorization = Readonly<{
  paymentUnsignedMaterialJson: string
  paymentUnsignedMaterialDigest: string
  paymentSigningIdempotencyKey: string
  paymentSignatureDigest: string
  paymentPayer: string
  paymentNonce: string
  paymentAuthorizationValidBefore: string
  paymentAuthorizationExpiresAt: number
  requestFingerprint: string
}>

export type X402PaymentAuthorizationFailureCode =
  | 'custody_configuration_invalid'
  | 'request_fingerprint_context_invalid'
  | 'material_unavailable'
  | 'material_identity_invalid'
  | 'external_spend_identity_invalid'
  | 'provider_authority_invalid'
  | 'grant_invalid'
  | 'managed_authorization_unavailable'

export type X402PaymentAuthorizationFailureDetail =
  | 'not_found'
  | 'inactive'
  | 'stale_generation'
  | 'expired'
  | 'digest_mismatch'
  | 'credential_unavailable'
  | 'lease_not_found'
  | 'lease_inactive'
  | 'lease_expired'
  | 'lease_generation_stale'
  | 'lease_digest_stale'
  | 'lease_scope_mismatch'
  | 'lease_resource_mismatch'
  | 'lease_identity_mismatch'
  | 'connection_not_found'
  | 'connection_inactive'
  | 'connection_expired'
  | 'readiness_expired'
  | 'readiness_mismatch'
  | 'authority_read_failed'

export type X402AuthorizationMaterialRefusal = Readonly<{
  code: X402PaymentAuthorizationFailureCode
  detail?: X402PaymentAuthorizationFailureDetail
}>

export type X402AttemptMaterial = Readonly<{
  state: string
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  credentialRef: string
  custodyRef: string
  authorizationDigest: string
  toolRef?: string
  requestFingerprint?: string
  challengeJson: string
  selectedRequirementJson: string
  network: string
  asset: string
  paymentIdentifier: string
  challengeDigest: string
  amountUnits: string
  currency: string
  exponent: number
  reservationRef?: string
  custodyBudgetRef?: string
  custodyGeneration?: number
  custodyDailyMaximumUnits?: string
  paymentUnsignedMaterialJson?: string
  paymentUnsignedMaterialDigest?: string
  paymentSigningIdempotencyKey?: string
  paymentSignatureDigest?: string
  paymentPayer?: string
  paymentNonce?: string
  paymentAuthorizationValidBefore?: string
  paymentAuthorizationExpiresAt?: number
  paymentSigningClaimedAt?: number
  authorizationFailureCode?: X402PaymentAuthorizationFailureCode
  authorizationFailureDetail?: X402PaymentAuthorizationFailureDetail
  authorizationFailureObservedAt?: number
}>

export type ManagedX402SigningRecoveryResult =
  | Readonly<{ kind: 'signed'; paymentSignatureDigest: string; evidenceDigest: string }>
  | Readonly<{
      kind: 'definitive_rejection'
      statusCode: 400 | 403
      errorType: 'invalid_request' | 'policy_violation'
      evidenceDigest: string
    }>
  | Readonly<{ kind: 'unresolved'; statusCode?: number; errorType?: string }>

export type X402PaymentCallbacks = Pick<
  X402RouteTransportRuntime,
  | 'prepareX402PaymentAuthorization'
  | 'readX402PaymentAuthorization'
  | 'readX402PaymentAuthorizationByDigest'
  | 'markX402PaymentPossiblySubmitted'
  | 'observeX402PaymentAttempt'
  | 'verifyX402Settlement'
>

type ManagedCustodyConfiguration = NonNullable<
  ReturnType<typeof cdpX402CustodyConfigurationFromEnvironment>
>

export type ParseAttemptChallengeResult =
  | Readonly<{
      ok: true
      challenge: X402PaymentSignatureRequest['challenge']
      selectedRequirement: X402PaymentSignatureRequest['selectedRequirement']
    }>
  | Readonly<{ ok: false; cause?: unknown }>

export function parseAttemptChallenge(material: X402AttemptMaterial): ParseAttemptChallengeResult {
  let challenge: X402PaymentSignatureRequest['challenge']
  let selectedRequirement: X402PaymentSignatureRequest['selectedRequirement']
  try {
    challenge = JSON.parse(material.challengeJson) as X402PaymentSignatureRequest['challenge']
    selectedRequirement = JSON.parse(
      material.selectedRequirementJson,
    ) as X402PaymentSignatureRequest['selectedRequirement']
  } catch (cause) {
    return { ok: false, cause }
  }
  if (canonicalDigest(challenge as StableHashValue) !== material.challengeDigest) {
    return { ok: false }
  }
  return { ok: true, challenge, selectedRequirement }
}

export function managedCustodyConfigurationMatches(
  material: X402AttemptMaterial,
  configuration: ManagedCustodyConfiguration,
  aeEnvironment: 'sandbox' | 'production',
): boolean {
  return (
    typeof material.custodyBudgetRef === 'string'
    && material.custodyBudgetRef.trim().length > 0
    && typeof material.custodyGeneration === 'number'
    && Number.isSafeInteger(material.custodyGeneration)
    && material.custodyGeneration > 0
    && typeof material.custodyDailyMaximumUnits === 'string'
    && material.custodyDailyMaximumUnits.trim().length > 0
    && material.custodyGeneration === configuration.credentialGeneration
    && material.custodyBudgetRef === cdpX402CustodyBudgetRef(configuration, aeEnvironment)
    && material.custodyDailyMaximumUnits === configuration.dailyMaxAtomic.toString()
  )
}

export function currentManagedCustodyConfiguration(
  material: X402AttemptMaterial,
  aeEnvironment: 'sandbox' | 'production',
): ManagedCustodyConfiguration | undefined {
  const configuration = cdpX402CustodyConfigurationFromEnvironment()
  return configuration !== undefined && managedCustodyConfigurationMatches(material, configuration, aeEnvironment)
    ? configuration
    : undefined
}

export function x402MethodFromOperation(operation: PublishedTool): 'GET' | 'POST' | undefined {
  try {
    const parsed: unknown = JSON.parse(operation.transport.configJson)
    if (!isRecord(parsed) || (parsed.method !== 'GET' && parsed.method !== 'POST')) return undefined
    return parsed.method
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'x402MethodFromOperation',
      reason: 'invalid_response',
    })
  }
}

export function requestFingerprintFromPrepared(
  prepared: X402PreparedAuthorization,
): string | undefined {
  const candidate = prepared as PreparedX402AuthorizationWithFingerprint
  return typeof candidate.requestFingerprint === 'string'
    ? candidate.requestFingerprint
    : undefined
}

export function storedAuthorizationFromMaterial(
  material: X402AttemptMaterial | null,
): StoredX402Authorization | undefined {
  if (
    material === null
    || material.paymentUnsignedMaterialJson === undefined
    || material.paymentUnsignedMaterialDigest === undefined
    || material.paymentSigningIdempotencyKey === undefined
    || material.paymentSignatureDigest === undefined
    || material.paymentPayer === undefined
    || material.paymentNonce === undefined
    || material.paymentAuthorizationValidBefore === undefined
    || material.paymentAuthorizationExpiresAt === undefined
    || material.requestFingerprint === undefined
    || !isPaymentSigningIdempotencyKey(material.paymentSigningIdempotencyKey)
  ) return undefined
  return {
    paymentUnsignedMaterialJson: material.paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: material.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: material.paymentSigningIdempotencyKey,
    paymentSignatureDigest: material.paymentSignatureDigest,
    paymentPayer: material.paymentPayer,
    paymentNonce: material.paymentNonce,
    paymentAuthorizationValidBefore: material.paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt: material.paymentAuthorizationExpiresAt,
    requestFingerprint: material.requestFingerprint,
  }
}
