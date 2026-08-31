import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { Agent } from 'undici'
import {
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
  cdpX402RequestFingerprint,
  createCdpEvmX402PaymentSignature,
  createSandboxEvmX402PaymentSignature,
  credentialFromEnvironment,
  isPaymentSigningIdempotencyKey,
  readCdpX402PaymentAuthorization,
  replayCdpX402PaymentSigningIntent,
  readX402PaymentPayerAndNonce,
  verifyExactEvmX402Settlement,
  x402PaymentCredentialRefFromEnvironment,
  type CdpX402RequestFingerprintContext,
  type CdpX402PaymentSigningIntent,
  type CdpX402PaymentSignerDependencies,
} from '@/modules/capability-supply/server'
import type {
  ProviderConnectionAuthorityValidator,
  X402PaymentSignatureRequest,
  X402PreparedAuthorization,
  X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedOperation } from '@/modules/capability-supply/public'
import {
  externalSpendIdentityFromReservation,
} from '@/modules/money/public'
import { type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { OpenDispatch } from '../../../../convex/capabilityOperationInvocationProjection'
import type { ConnectionAuthority, ProviderLeaseAuthority } from './lease'
import {
  bestEffortReleaseX402ExternalSpend,
  externalSpendIdentityFromAttempt,
  externalSpendPaymentFactsFromDispatch,
  readX402EvmReceipt,
} from './x402Settlement'
import type { X402AttemptSnapshotForMoney } from './x402Settlement'
import { X402_MANAGED_CUSTODY_REF } from './x402Route'

type PreparedX402AuthorizationWithFingerprint = X402PreparedAuthorization & Readonly<{
  requestFingerprint?: string
}>

type StoredX402Authorization = Readonly<{
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

export type X402AttemptMaterial = X402AttemptSnapshotForMoney & Readonly<{
  state: string
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  credentialRef: string
  custodyRef: string
  authorizationDigest: string
  operationRef?: string
  requestFingerprint?: string
  challengeJson: string
  selectedRequirementJson: string
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

type X402PaymentAuthorizationFailureCode =
  | 'custody_configuration_invalid'
  | 'request_fingerprint_context_invalid'
  | 'material_unavailable'
  | 'material_identity_invalid'
  | 'external_spend_identity_invalid'
  | 'provider_authority_invalid'
  | 'grant_invalid'
  | 'managed_authorization_unavailable'

type X402PaymentAuthorizationFailureDetail =
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

type ManagedCustodyConfiguration = NonNullable<
  ReturnType<typeof cdpX402CustodyConfigurationFromEnvironment>
>

function managedCustodyConfigurationMatches(
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

function currentManagedCustodyConfiguration(
  material: X402AttemptMaterial,
  aeEnvironment: 'sandbox' | 'production',
): ManagedCustodyConfiguration | undefined {
  const configuration = cdpX402CustodyConfigurationFromEnvironment()
  return configuration !== undefined && managedCustodyConfigurationMatches(material, configuration, aeEnvironment)
    ? configuration
    : undefined
}

export function x402MethodFromOperation(operation: PublishedOperation): 'GET' | 'POST' | undefined {
  try {
    const parsed: unknown = JSON.parse(operation.transport.configJson)
    if (!isRecord(parsed) || (parsed.method !== 'GET' && parsed.method !== 'POST')) return undefined
    return parsed.method
  } catch {
    return undefined
  }
}

export type ManagedX402SigningRecoveryResult =
  | Readonly<{ kind: 'signed'; paymentSignatureDigest: string; evidenceDigest: string }>
  | Readonly<{
      kind: 'definitive_rejection'
      statusCode: 400 | 403
      errorType: 'invalid_request' | 'policy_violation'
      evidenceDigest: string
    }>
  | Readonly<{ kind: 'unresolved'; statusCode?: number; errorType?: string }>

/**
 * Replays only the exact persisted CDP signing request. This is the recovery
 * operation documented by CDP for a lost signing response: same typed-data
 * body and same UUID idempotency key. It never creates a nonce or begins
 * provider transport, and it deliberately exposes only bounded evidence.
 */
export async function replayManagedX402SigningForRecovery(
  material: X402AttemptMaterial,
  operation: PublishedOperation,
  operationRef: string,
  aeEnvironment: 'sandbox' | 'production',
  dependencies: Pick<CdpX402PaymentSignerDependencies, 'environment' | 'createClient'> = {},
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

  let challenge: X402PaymentSignatureRequest['challenge']
  let selectedRequirement: X402PaymentSignatureRequest['selectedRequirement']
  try {
    challenge = JSON.parse(material.challengeJson) as X402PaymentSignatureRequest['challenge']
    selectedRequirement = JSON.parse(
      material.selectedRequirementJson,
    ) as X402PaymentSignatureRequest['selectedRequirement']
  } catch {
    return { kind: 'unresolved' }
  }
  if (canonicalDigest(challenge as StableHashValue) !== material.challengeDigest) {
    return { kind: 'unresolved' }
  }
  const request: X402PaymentSignatureRequest = {
    challenge,
    credential: material.credentialRef,
    paymentIdentifier: material.paymentIdentifier,
    selectedRequirement,
  }
  const requestFingerprintContext = {
    method,
    operationRef,
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
      dependencies,
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

function requestFingerprintFromPrepared(
  prepared: X402PreparedAuthorization,
): string | undefined {
  const candidate = prepared as PreparedX402AuthorizationWithFingerprint
  return typeof candidate.requestFingerprint === 'string'
    ? candidate.requestFingerprint
    : undefined
}

function storedAuthorizationFromMaterial(
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

export type X402PaymentCallbacks = Pick<
  X402RouteTransportRuntime,
  | 'prepareX402PaymentAuthorization'
  | 'readX402PaymentAuthorization'
  | 'readX402PaymentAuthorizationByDigest'
  | 'markX402PaymentPossiblySubmitted'
  | 'observeX402PaymentAttempt'
  | 'verifyX402Settlement'
>

export async function readX402Authorization(
  ctx: ActionCtx,
  prepared: X402PreparedAuthorization,
  byDigest: boolean,
  expected: Readonly<{
    credentialRef: string
    dispatchRef: string
    attemptRef: string
    effectGeneration: number
    paymentIdentifier: string
    useCustodySigner?: boolean
    requestFingerprint?: string
    requestFingerprintContext?: CdpX402RequestFingerprintContext
  }>,
): Promise<string | undefined> {
  const custodyConfiguration = expected.useCustodySigner === true
    ? cdpX402CustodyConfigurationFromEnvironment()
    : undefined
  if (expected.useCustodySigner === true && custodyConfiguration === undefined) return undefined
  const material = await readX402AuthorizationMaterial(
    ctx,
    prepared,
    byDigest,
    expected.requestFingerprint,
    custodyConfiguration?.credentialGeneration,
  )
  if (
    material === null
    || material.state !== 'prepared'
    || material.credentialRef !== expected.credentialRef
    || material.dispatchRef !== expected.dispatchRef
    || material.attemptRef !== expected.attemptRef
    || material.effectGeneration !== expected.effectGeneration
    || material.paymentIdentifier !== expected.paymentIdentifier
  ) return undefined
  if (expected.useCustodySigner === true) {
    const aeEnvironment = expected.requestFingerprintContext?.aeEnvironment
    if (
      custodyConfiguration === undefined
      || aeEnvironment === undefined
      || !managedCustodyConfigurationMatches(material, custodyConfiguration, aeEnvironment)
    ) {
      return undefined
    }
    const requestFingerprint = expected.requestFingerprint ?? material.requestFingerprint
    const requestFingerprintContext = expected.requestFingerprintContext
    if (
      requestFingerprint === undefined
      || material.requestFingerprint !== requestFingerprint
      || requestFingerprintContext === undefined
    ) return undefined
    return await readOrClaimManagedAuthorization(
      ctx,
      prepared,
      byDigest,
      material,
      requestFingerprint,
      requestFingerprintContext,
    )
  }
  return await signAndRecordSandboxAuthorization(ctx, material)
}

async function readX402AuthorizationMaterial(
  ctx: ActionCtx,
  prepared: X402PreparedAuthorization,
  byDigest: boolean,
  requestFingerprint?: string,
  custodyGeneration?: number,
): Promise<X402AttemptMaterial | null> {
  const args = {
    custodyRef: prepared.custodyRef,
    authorizationDigest: prepared.authorizationDigest,
    ...(requestFingerprint === undefined ? {} : { requestFingerprint }),
    ...(custodyGeneration === undefined ? {} : { custodyGeneration }),
  }
  return await (byDigest
    ? ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAuthorizationByDigest, args)
    : ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAuthorization, args)) as X402AttemptMaterial | null
}

async function signAndRecordSandboxAuthorization(
  ctx: ActionCtx,
  material: X402AttemptMaterial,
): Promise<string | undefined> {
  const credential = credentialFromEnvironment(material.credentialRef)
  if (credential === undefined || credential.trim().length === 0) return undefined
  try {
    const challenge = JSON.parse(material.challengeJson) as X402PaymentSignatureRequest['challenge']
    const selectedRequirement = JSON.parse(
      material.selectedRequirementJson,
    ) as X402PaymentSignatureRequest['selectedRequirement']
    if (canonicalDigest(challenge as StableHashValue) !== material.challengeDigest) return undefined
    const paymentSignature = await createSandboxEvmX402PaymentSignature({
      challenge,
      credential,
      paymentIdentifier: material.paymentIdentifier,
      selectedRequirement,
    })
    if (paymentSignature === undefined || paymentSignature.length === 0) return undefined
    await ctx.runMutation(internal.moneyX402PaymentAttempts.recordX402PaymentSignatureDigest, {
      custodyRef: material.custodyRef,
      authorizationDigest: material.authorizationDigest,
      paymentSignatureDigest: canonicalDigest(paymentSignature),
    })
    return paymentSignature
  } catch {
    return undefined
  }
}

async function signAndCommitManagedAuthorization(
  ctx: ActionCtx,
  material: X402AttemptMaterial,
  requestFingerprint: string,
  requestFingerprintContext: CdpX402RequestFingerprintContext,
  ownsSigningClaim = false,
): Promise<string | undefined> {
  const custodyConfiguration = currentManagedCustodyConfiguration(
    material,
    requestFingerprintContext.aeEnvironment ?? 'production',
  )
  if (custodyConfiguration === undefined) return undefined
  let challenge: X402PaymentSignatureRequest['challenge']
  let selectedRequirement: X402PaymentSignatureRequest['selectedRequirement']
  try {
    challenge = JSON.parse(material.challengeJson) as X402PaymentSignatureRequest['challenge']
    selectedRequirement = JSON.parse(
      material.selectedRequirementJson,
    ) as X402PaymentSignatureRequest['selectedRequirement']
  } catch {
    return undefined
  }
  if (canonicalDigest(challenge as StableHashValue) !== material.challengeDigest) return undefined
  const request: X402PaymentSignatureRequest = {
    challenge,
    credential: material.credentialRef,
    paymentIdentifier: material.paymentIdentifier,
    selectedRequirement,
  }

  const intentFields = [
    material.paymentUnsignedMaterialJson,
    material.paymentUnsignedMaterialDigest,
    material.paymentSigningIdempotencyKey,
    material.paymentPayer,
    material.paymentNonce,
    material.paymentAuthorizationValidBefore,
    material.paymentAuthorizationExpiresAt,
  ]
  const hasPartialIntent = intentFields.some((value) => value !== undefined)
  const persistedIntent: CdpX402PaymentSigningIntent | undefined = (
    material.paymentUnsignedMaterialJson !== undefined
    && material.paymentUnsignedMaterialDigest !== undefined
    && material.paymentSigningIdempotencyKey !== undefined
    && material.paymentPayer !== undefined
    && material.paymentNonce !== undefined
    && material.paymentAuthorizationValidBefore !== undefined
    && material.paymentAuthorizationExpiresAt !== undefined
    && material.requestFingerprint !== undefined
    && isPaymentSigningIdempotencyKey(material.paymentSigningIdempotencyKey)
  ) ? {
    paymentUnsignedMaterialJson: material.paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: material.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: material.paymentSigningIdempotencyKey,
    paymentPayer: material.paymentPayer,
    paymentNonce: material.paymentNonce,
    paymentAuthorizationValidBefore: material.paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt: material.paymentAuthorizationExpiresAt,
    requestFingerprint: material.requestFingerprint,
  } : undefined
  if (
    persistedIntent === undefined
    && (hasPartialIntent
      || material.paymentSignatureDigest !== undefined
      || (material.paymentSigningClaimedAt !== undefined && !ownsSigningClaim))
  ) throw new Error('x402_payment_reconciliation_required')
  if (ownsSigningClaim && material.paymentSigningClaimedAt === undefined) {
    throw new Error('x402_payment_reconciliation_required')
  }

  let committedIntent = persistedIntent
  const paymentSignature = await createCdpEvmX402PaymentSignature(request, {
    requestFingerprintContext,
    ...(persistedIntent === undefined
      ? {
          onUnsignedMaterial: async (intent) => {
            committedIntent = intent
            await ctx.runMutation(
              internal.moneyX402PaymentAttempts.recordX402PaymentSigningIntent,
              {
                custodyRef: material.custodyRef,
                authorizationDigest: material.authorizationDigest,
                ...intent,
                custodyGeneration: custodyConfiguration.credentialGeneration,
              },
            )
          },
        }
      : { persistedIntent }),
  })
  if (paymentSignature === undefined || paymentSignature.length === 0) return undefined
  const postSignConfiguration = currentManagedCustodyConfiguration(
    material,
    requestFingerprintContext.aeEnvironment ?? 'production',
  )
  if (postSignConfiguration === undefined) {
    throw new Error('x402_payment_custody_generation_conflict')
  }
  const identity = readCdpX402PaymentAuthorization(
    paymentSignature,
    request,
    requestFingerprintContext,
    requestFingerprint,
  )
  if (
    identity === undefined
    || committedIntent === undefined
    || identity.paymentPayer !== committedIntent.paymentPayer
    || identity.paymentNonce !== committedIntent.paymentNonce
  ) throw new Error('x402_payment_authorization_invalid')
  await ctx.runMutation(internal.moneyX402PaymentAttempts.recordX402PaymentSignatureDigest, {
    custodyRef: material.custodyRef,
    authorizationDigest: material.authorizationDigest,
    paymentSignatureDigest: identity.paymentSignatureDigest,
    paymentPayer: identity.paymentPayer,
    paymentNonce: identity.paymentNonce,
    requestFingerprint: identity.requestFingerprint,
    custodyGeneration: postSignConfiguration.credentialGeneration,
  })
  return paymentSignature
}

async function readOrClaimManagedAuthorization(
  ctx: ActionCtx,
  prepared: X402PreparedAuthorization,
  byDigest: boolean,
  material: X402AttemptMaterial,
  requestFingerprint: string,
  requestFingerprintContext: CdpX402RequestFingerprintContext,
): Promise<string | undefined> {
  const custodyConfiguration = currentManagedCustodyConfiguration(
    material,
    requestFingerprintContext.aeEnvironment ?? 'production',
  )
  if (custodyConfiguration === undefined) return undefined
  if (storedAuthorizationFromMaterial(material) !== undefined) {
    return await signAndCommitManagedAuthorization(
      ctx,
      material,
      requestFingerprint,
      requestFingerprintContext,
    )
  }
  const claim = await ctx.runMutation(internal.moneyX402PaymentAttempts.claimX402PaymentAuthorization, {
    custodyRef: prepared.custodyRef,
    authorizationDigest: prepared.authorizationDigest,
    requestFingerprint,
    custodyGeneration: custodyConfiguration.credentialGeneration,
  })
  if (claim.kind === 'stored') {
    const converged = await readX402AuthorizationMaterial(
      ctx,
      prepared,
      byDigest,
      requestFingerprint,
      custodyConfiguration.credentialGeneration,
    )
    if (converged === null) throw new Error('x402_payment_reconciliation_required')
    return await signAndCommitManagedAuthorization(
      ctx,
      converged,
      requestFingerprint,
      requestFingerprintContext,
    )
  }
  if (claim.kind === 'pending') {
    const deadline = Date.now() + 1_000
    while (Date.now() < deadline) {
      const converged = await readX402AuthorizationMaterial(
        ctx,
        prepared,
        byDigest,
        requestFingerprint,
        custodyConfiguration.credentialGeneration,
      )
      if (storedAuthorizationFromMaterial(converged) !== undefined) {
        return await signAndCommitManagedAuthorization(
          ctx,
          converged as X402AttemptMaterial,
          requestFingerprint,
          requestFingerprintContext,
        )
      }
      if (converged === null || converged.state !== 'prepared') {
        throw new Error('x402_payment_reconciliation_required')
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
    throw new Error('x402_payment_reconciliation_required')
  }
  const claimedMaterial = await readX402AuthorizationMaterial(
    ctx,
    prepared,
    byDigest,
    requestFingerprint,
    custodyConfiguration.credentialGeneration,
  )
  if (claimedMaterial === null) throw new Error('x402_payment_reconciliation_required')
  const signedHeader = await signAndCommitManagedAuthorization(
    ctx,
    claimedMaterial,
    requestFingerprint,
    requestFingerprintContext,
    true,
  )
  if (signedHeader === undefined) return undefined
  const reread = await readX402AuthorizationMaterial(
    ctx,
    prepared,
    byDigest,
    requestFingerprint,
    custodyConfiguration.credentialGeneration,
  )
  if (reread === null) throw new Error('x402_payment_reconciliation_required')
  const first = storedAuthorizationFromMaterial(reread)
  if (first === undefined) throw new Error('x402_payment_reconciliation_required')
  return currentManagedCustodyConfiguration(
    reread,
    requestFingerprintContext.aeEnvironment ?? 'production',
  ) === undefined
    ? undefined
    : signedHeader
}

export function createX402PaymentCallbacks(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    operation: PublishedOperation
    connectionAuthority: ConnectionAuthority
    durableAttemptRef: string
    effectGeneration: number
    operationKeyDigest: string
    leaseRef?: string
    leaseAuthority?: ProviderLeaseAuthority
    validateProviderAuthority: ProviderConnectionAuthorityValidator
    dispatcher: Agent
    isGrantStillValid: () => Promise<boolean>
    useCustodySigner?: boolean
    onPaymentPossiblySubmitted?: () => void
  }>,
): X402PaymentCallbacks {
  const recordAuthorizationFailure = async (
    code: X402PaymentAuthorizationFailureCode,
    detail?: X402PaymentAuthorizationFailureDetail,
  ): Promise<void> => {
    if (input.useCustodySigner !== true) return
    await ctx.runMutation(
      internal.moneyX402PaymentAttempts.recordX402PaymentAuthorizationFailure,
      {
        dispatchRef: input.dispatch.invocationRef,
        attemptRef: input.durableAttemptRef,
        effectGeneration: input.effectGeneration,
        code,
        ...(detail === undefined ? {} : { detail }),
      },
    )
  }

  const readPaymentAuthorization = async (
    prepared: X402PreparedAuthorization,
    byDigest: boolean,
  ): Promise<string | undefined> => {
    const requestFingerprint = requestFingerprintFromPrepared(prepared)
    const requestFingerprintContext = input.useCustodySigner === true
      ? (() => {
          const method = x402MethodFromOperation(input.operation)
          return method === undefined
            ? undefined
            : {
                method,
                operationRef: input.dispatch.operationRef,
                aeEnvironment: input.dispatch.environment,
              }
        })()
      : undefined
    const custodyConfiguration = input.useCustodySigner === true
      ? cdpX402CustodyConfigurationFromEnvironment()
      : undefined
    const material = await readX402AuthorizationMaterial(
      ctx,
      prepared,
      byDigest,
      requestFingerprint,
      custodyConfiguration?.credentialGeneration,
    )
    const cleanupAttempt = material === null && input.useCustodySigner === true
      ? await ctx.runQuery(
          internal.moneyX402PaymentAttempts.readX402PaymentAttempt,
          {
            dispatchRef: input.dispatch.invocationRef,
            attemptRef: input.durableAttemptRef,
            effectGeneration: input.effectGeneration,
          },
        ).catch(() => null)
      : null
    const expectedMaterial = material ?? cleanupAttempt
    const credentialRef = input.useCustodySigner === true
      ? X402_MANAGED_CUSTODY_REF
      : x402PaymentCredentialRefFromEnvironment()
    const expected = expectedMaterial === null
      ? undefined
      : externalSpendIdentityFromAttempt(
          input.dispatch,
          input.operation,
          expectedMaterial as X402AttemptSnapshotForMoney,
          input.durableAttemptRef,
          input.effectGeneration,
        )
    const cleanupState = material?.state ?? (
      cleanupAttempt !== null && typeof cleanupAttempt === 'object' && 'state' in cleanupAttempt
        ? cleanupAttempt.state
        : undefined
    )
    const releasePreparedReservation = async (): Promise<void> => {
      if (expected !== undefined && cleanupState === 'prepared') {
        const cleanupOutcome = await bestEffortReleaseX402ExternalSpend(
          ctx,
          expected,
          [input.operationKeyDigest],
        )
        if (cleanupOutcome === 'failed') return
      }
    }
    if (
      input.useCustodySigner === true
      && custodyConfiguration === undefined
    ) {
      await recordAuthorizationFailure('custody_configuration_invalid')
      await releasePreparedReservation()
      return undefined
    }
    if (input.useCustodySigner === true && requestFingerprintContext === undefined) {
      await recordAuthorizationFailure('request_fingerprint_context_invalid')
      await releasePreparedReservation()
      return undefined
    }
    if (material === null) {
      await recordAuthorizationFailure('material_unavailable')
      await releasePreparedReservation()
      return undefined
    }
    if (material.state !== 'prepared') {
      return undefined
    }
    if (
      credentialRef === undefined
      || material.credentialRef !== credentialRef
      || material.dispatchRef !== input.dispatch.invocationRef
      || material.attemptRef !== input.durableAttemptRef
      || material.effectGeneration !== input.effectGeneration
      || material.paymentIdentifier !== input.operationKeyDigest
    ) {
      await recordAuthorizationFailure('material_identity_invalid')
      await releasePreparedReservation()
      return undefined
    }
    if (expected === undefined) {
      await recordAuthorizationFailure('external_spend_identity_invalid')
      await releasePreparedReservation()
      return undefined
    }
    let validation: Awaited<ReturnType<ProviderConnectionAuthorityValidator>>
    try {
      validation = await input.validateProviderAuthority({
        connectionRef: input.connectionAuthority.connectionRef,
        providerRef: input.connectionAuthority.providerRef,
        adapterId: input.connectionAuthority.adapterId,
        authorityGeneration: input.connectionAuthority.authorityGeneration,
        authorityDigest: input.connectionAuthority.authorityDigest,
        ...(input.leaseRef === undefined || input.leaseAuthority === undefined
          ? {}
          : {
              leaseRef: input.leaseRef,
              invocationRef: input.dispatch.invocationRef,
              operationRef: input.dispatch.operationRef,
              grantedScopes: input.leaseAuthority.grantedScopes,
              grantedResources: input.leaseAuthority.grantedResources,
              readinessValidUntil: input.operation.readiness.validUntil,
              readinessDigest: input.operation.readiness.qualificationDigest,
            }),
      })
    } catch {
      await recordAuthorizationFailure('provider_authority_invalid', 'authority_read_failed')
      await releasePreparedReservation()
      return undefined
    }
    if (validation.kind !== 'valid') {
      await recordAuthorizationFailure('provider_authority_invalid', validation.reason)
      const cleanupOutcome = await bestEffortReleaseX402ExternalSpend(
        ctx,
        expected,
        [input.operationKeyDigest],
      )
      if (cleanupOutcome === 'failed') return undefined
      return undefined
    }
    let grantStillValid = false
    try {
      grantStillValid = await input.isGrantStillValid()
    } catch {
      grantStillValid = false
    }
    if (!grantStillValid) {
      await recordAuthorizationFailure('grant_invalid')
      await bestEffortReleaseX402ExternalSpend(
        ctx,
        expected,
        [input.operationKeyDigest],
      )
      return undefined
    }
    const signature = await readX402Authorization(ctx, prepared, byDigest, {
      credentialRef,
      dispatchRef: input.dispatch.invocationRef,
      attemptRef: input.durableAttemptRef,
      effectGeneration: input.effectGeneration,
      paymentIdentifier: input.operationKeyDigest,
      ...(input.useCustodySigner === true ? {
        useCustodySigner: true,
        ...(requestFingerprint === undefined && material.requestFingerprint === undefined
          ? {}
          : { requestFingerprint: requestFingerprint ?? material.requestFingerprint }),
        ...(requestFingerprintContext === undefined ? {} : { requestFingerprintContext }),
      } : {}),
    })
    if (signature === undefined || signature.length === 0) {
      if (input.useCustodySigner === true) {
        await recordAuthorizationFailure('managed_authorization_unavailable')
      }
      const cleanupOutcome = await bestEffortReleaseX402ExternalSpend(
        ctx,
        expected,
        [input.operationKeyDigest],
      )
      if (cleanupOutcome === 'failed') return undefined
      return undefined
    }
    return signature
  }

  return {
    verifyX402Settlement: async ({
      response,
      requirement,
      paymentSignature,
    }) => {
      if (
        response.errorReason === 'settlement_pending'
        && /^0x[0-9a-fA-F]{64}$/.test(response.transaction)
      ) return false
      const authorization = readX402PaymentPayerAndNonce(paymentSignature)
      if (authorization === undefined) return false
      return verifyExactEvmX402Settlement({
        aeEnvironment: input.dispatch.environment,
        response,
        requirement,
        payer: authorization.payer,
        paymentNonce: authorization.nonce,
        receipt: await readX402EvmReceipt(
          requirement.network,
          requirement.asset,
          response.transaction,
          input.dispatcher,
          input.dispatch.environment,
          authorization.payer,
          authorization.nonce,
          { minimumConfirmations: 12, timeoutMs: 60_000 },
        ),
      })
    },
    prepareX402PaymentAuthorization: async (request) => {
      if (
        request.attemptRef !== input.durableAttemptRef
        || request.effectGeneration !== input.effectGeneration
        || request.paymentIdentifier !== input.operationKeyDigest
      ) return undefined
      const paymentCredentialRef = input.useCustodySigner === true
        ? X402_MANAGED_CUSTODY_REF
        : x402PaymentCredentialRefFromEnvironment()
      if (paymentCredentialRef === undefined || request.credential !== paymentCredentialRef) return undefined
      const method = input.useCustodySigner === true
        ? x402MethodFromOperation(input.operation)
        : undefined
      if (input.useCustodySigner === true && method === undefined) return undefined
      const requestFingerprint = input.useCustodySigner === true
        ? cdpX402RequestFingerprint(request, {
            method: method as 'GET' | 'POST',
            operationRef: input.dispatch.operationRef,
            aeEnvironment: input.dispatch.environment,
          })
        : undefined
      const selectedRequirementJson = JSON.stringify(request.selectedRequirement)
      const custodyConfiguration = input.useCustodySigner === true
        ? cdpX402CustodyConfigurationFromEnvironment()
        : undefined
      if (input.useCustodySigner === true && custodyConfiguration === undefined) return undefined
      const custody = custodyConfiguration === undefined
        ? undefined
        : {
            budgetRef: cdpX402CustodyBudgetRef(custodyConfiguration, input.dispatch.environment),
            generation: custodyConfiguration.credentialGeneration,
            dailyMaximum: {
              currency: request.paymentAmount.currency,
              units: custodyConfiguration.dailyMaxAtomic.toString(),
              exponent: request.paymentAmount.exponent,
            },
          }
      const paymentFacts = {
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
        providerRef: input.connectionAuthority.providerRef,
        paymentIdentifier: request.paymentIdentifier,
        challengeDigest: request.challengeDigest,
        amount: request.paymentAmount,
      }
      const reservationFacts = custody === undefined
        ? paymentFacts
        : {
            ...paymentFacts,
            custodyRef: custody.budgetRef,
            custodyGeneration: custody.generation,
            custodyDailyMaximum: custody.dailyMaximum,
          }
      const reserved = await ctx.runMutation(internal.moneyLedger.reserveExternalInvocationSpend, {
        ...externalSpendPaymentFactsFromDispatch(input.dispatch, reservationFacts),
        observedAt: Date.now(),
      })
      if (reserved.kind !== 'accepted') return undefined
      const externalIdentity = externalSpendIdentityFromReservation(reserved.reservation)
      try {
        const prepareBase = {
          dispatchRef: input.dispatch.invocationRef,
          operationRef: input.dispatch.operationRef,
          inputDigest: input.dispatch.inputDigest,
          challengeDigest: request.challengeDigest,
          attemptRef: request.attemptRef,
          effectGeneration: request.effectGeneration,
          paymentIdentifier: request.paymentIdentifier,
          operationKeyDigest: input.operationKeyDigest,
          challengeJson: JSON.stringify(request.challenge),
          selectedRequirementJson,
          providerEndpoint: request.challenge.resource.url,
          credentialRef: paymentCredentialRef,
          scheme: request.selectedRequirement.scheme,
          network: request.selectedRequirement.network,
          asset: request.selectedRequirement.asset,
          payTo: request.selectedRequirement.payTo,
          amountUnits: request.paymentAmount.units,
          currency: request.paymentAmount.currency,
          exponent: request.paymentAmount.exponent,
          reservationRef: externalIdentity.reservationRef,
        }
        const prepareArgs = custody === undefined
          ? {
              ...prepareBase,
              ...(requestFingerprint === undefined ? {} : { requestFingerprint }),
            }
          : {
              ...prepareBase,
              custodyBudgetRef: custody.budgetRef,
              custodyGeneration: custody.generation,
              custodyDailyMaximumUnits: custody.dailyMaximum.units,
              ...(requestFingerprint === undefined ? {} : { requestFingerprint }),
            }
        const prepared = await ctx.runMutation(
          internal.moneyX402PaymentAttempts.prepareX402PaymentAuthorization,
          prepareArgs,
        )
        return requestFingerprint === undefined
          ? prepared
          : { ...prepared, requestFingerprint } as PreparedX402AuthorizationWithFingerprint
      } catch (error) {
        const attempt = await ctx.runQuery(
          internal.moneyX402PaymentAttempts.readX402PaymentAttempt,
          {
            dispatchRef: input.dispatch.invocationRef,
            attemptRef: request.attemptRef,
            effectGeneration: request.effectGeneration,
          },
        ).catch(() => undefined)
        if (attempt === undefined && reserved.replayed === false) {
          await bestEffortReleaseX402ExternalSpend(
            ctx,
            externalIdentity,
            [input.operationKeyDigest],
          )
        } else if (attempt === null || attempt?.state === 'prepared') {
          await bestEffortReleaseX402ExternalSpend(
            ctx,
            externalIdentity,
            [input.operationKeyDigest],
          )
        }
        throw error
      }
    },
    readX402PaymentAuthorization: async (prepared) =>
      await readPaymentAuthorization(prepared, false),
    readX402PaymentAuthorizationByDigest: async (prepared) =>
      await readPaymentAuthorization(prepared, true),
    markX402PaymentPossiblySubmitted: async (event) => {
      const {
        amount,
        settlementEvidence: _settlementEvidence,
        ...paymentEvent
      } = event
      await ctx.runMutation(internal.moneyX402PaymentAttempts.markX402PaymentPossiblySubmitted, {
        dispatchRef: input.dispatch.invocationRef,
        effectGeneration: input.effectGeneration,
        ...paymentEvent,
        amountUnits: amount.units,
        currency: amount.currency,
        exponent: amount.exponent,
      })
      input.onPaymentPossiblySubmitted?.()
    },
    observeX402PaymentAttempt: async (event) => {
      const { amount, settlementEvidence, ...paymentEvent } = event
      await ctx.runMutation(internal.moneyX402PaymentAttempts.observeX402PaymentAttempt, {
        dispatchRef: input.dispatch.invocationRef,
        effectGeneration: input.effectGeneration,
        ...paymentEvent,
        settlementStatus:
          settlementEvidence?.kind === 'not_submitted'
            ? 'not_settled'
            : settlementEvidence?.kind ?? 'unknown',
        ...(settlementEvidence !== undefined
          && settlementEvidence.kind !== 'not_submitted'
          && settlementEvidence.digest !== undefined
          ? { settlementDigest: settlementEvidence.digest }
          : {}),
        state: event.state === 'reconciliation_required'
          || settlementEvidence?.kind === 'unknown'
          ? 'reconciliation_required'
          : 'observed',
        evidenceRefs: [...event.evidenceRefs],
        amountUnits: amount.units,
        currency: amount.currency,
        exponent: amount.exponent,
      })
    },
  }
}
