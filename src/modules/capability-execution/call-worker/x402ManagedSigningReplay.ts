import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import {
  cdpX402RequestFingerprint,
  isPaymentSigningIdempotencyKey,
  replayCdpX402PaymentSigningIntent,
  type CdpX402PaymentSigningIntent,
  type CdpX402PaymentSignerDependencies,
} from '@/modules/capability-supply/server'
import type { X402PaymentSignatureRequest } from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedTool } from '@/modules/capability-supply/public'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  currentManagedCustodyConfiguration,
  parseAttemptChallenge,
  x402MethodFromOperation,
  type ManagedX402SigningRecoveryResult,
  type X402AttemptMaterial,
} from './x402AuthorizationMaterial'

/**
 * Replays only the exact persisted CDP signing request. This is the recovery
 * operation documented by CDP for a lost signing response: same typed-data
 * body and same UUID idempotency key. It never creates a nonce or begins
 * provider transport, and it deliberately exposes only bounded evidence.
 */
export async function replayManagedX402SigningForRecovery(
  material: X402AttemptMaterial,
  operation: PublishedTool,
  toolRef: string,
  aeEnvironment: 'sandbox' | 'production',
  dependencies: Pick<CdpX402PaymentSignerDependencies, 'environment' | 'createClient' | 'admitSigning'> = {},
): Promise<ManagedX402SigningRecoveryResult> {
  const method = x402MethodFromOperation(operation)
  const custodyConfiguration = currentManagedCustodyConfiguration(material, aeEnvironment)
  if (
    method === undefined
    || custodyConfiguration === undefined
    || material.paymentUnsignedMaterialJson === undefined
    || material.paymentUnsignedMaterialDigest === undefined
    || material.paymentSigningIdempotencyKey === undefined
    || material.paymentPayer === undefined
    || material.paymentNonce === undefined
    || material.paymentAuthorizationValidBefore === undefined
    || material.paymentAuthorizationExpiresAt === undefined
    || material.requestFingerprint === undefined
    || !isPaymentSigningIdempotencyKey(material.paymentSigningIdempotencyKey)
  ) return { kind: 'unresolved' }

  const parsedChallenge = parseAttemptChallenge(material)
  if (!parsedChallenge.ok) {
    return parsedChallenge.cause === undefined
      ? { kind: 'unresolved' }
      : degradeBackend(parsedChallenge.cause, { kind: 'unresolved' } as const, {
          site: 'replayManagedX402SigningForRecovery',
          reason: 'invalid_response',
        })
  }
  const { challenge, selectedRequirement } = parsedChallenge
  const request: X402PaymentSignatureRequest = {
    challenge,
    credential: material.credentialRef,
    paymentIdentifier: material.paymentIdentifier,
    selectedRequirement,
  }
  const requestFingerprintContext = {
    method,
    toolRef,
    aeEnvironment,
  } as const
  if (
    cdpX402RequestFingerprint(request, requestFingerprintContext)
      !== material.requestFingerprint
  ) return { kind: 'unresolved' }
  const persistedIntent: CdpX402PaymentSigningIntent = {
    paymentUnsignedMaterialJson: material.paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: material.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: material.paymentSigningIdempotencyKey,
    paymentPayer: material.paymentPayer,
    paymentNonce: material.paymentNonce,
    paymentAuthorizationValidBefore: material.paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt: material.paymentAuthorizationExpiresAt,
    requestFingerprint: material.requestFingerprint,
  }
  try {
    const paymentSignature = await replayCdpX402PaymentSigningIntent(
      persistedIntent,
      { ...dependencies, aeEnvironment },
    )
    if (paymentSignature === undefined) return { kind: 'unresolved' }
    const paymentSignatureDigest = canonicalDigest(paymentSignature)
    return {
      kind: 'signed',
      paymentSignatureDigest,
      evidenceDigest: canonicalDigest({
        format: 'ae.x402-managed-signing-replay:v1',
        outcome: 'signature_recovered',
        paymentSignatureDigest,
        paymentUnsignedMaterialDigest: material.paymentUnsignedMaterialDigest,
        requestFingerprint: material.requestFingerprint,
      }),
    }
  } catch (error) {
    const definitiveRejection = isRecord(error) && (
      (error.statusCode === 400 && error.errorType === 'invalid_request')
      || (error.statusCode === 403 && error.errorType === 'policy_violation')
    )
    if (definitiveRejection) {
      const statusCode = error.statusCode as 400 | 403
      const errorType = error.errorType as 'invalid_request' | 'policy_violation'
      return {
        kind: 'definitive_rejection',
        statusCode,
        errorType,
        evidenceDigest: canonicalDigest({
          format: 'ae.x402-managed-signing-replay:v1',
          outcome: 'definitive_rejection',
          statusCode,
          errorType,
          paymentUnsignedMaterialDigest: material.paymentUnsignedMaterialDigest,
          requestFingerprint: material.requestFingerprint,
        }),
      }
    }
    const statusCode = isRecord(error)
      && typeof error.statusCode === 'number'
      && Number.isSafeInteger(error.statusCode)
      && error.statusCode >= 0
      && error.statusCode <= 599
      ? error.statusCode
      : undefined
    const errorType = isRecord(error)
      && typeof error.errorType === 'string'
      && /^[a-z0-9_]{1,64}$/.test(error.errorType)
      ? error.errorType
      : undefined
    return {
      kind: 'unresolved',
      ...(statusCode === undefined ? {} : { statusCode }),
      ...(errorType === undefined ? {} : { errorType }),
    }
  }
}
