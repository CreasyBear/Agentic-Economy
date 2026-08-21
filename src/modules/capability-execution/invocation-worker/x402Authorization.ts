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
  readX402PaymentPayerAndNonce,
  verifyExactEvmX402Settlement,
  x402PaymentCredentialRefFromEnvironment,
  type CdpX402RequestFingerprintContext,
  type CdpX402PaymentSigningIntent,
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
  type ExactAmount,
  type ExternalSpendIdentity,
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
import { BROKERED_X402_MANAGED_CUSTODY_REF } from './x402Route'

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

type X402AttemptMaterial = X402AttemptSnapshotForMoney & Readonly<{
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
}>

type ManagedCustodyConfiguration = NonNullable<
  ReturnType<typeof cdpX402CustodyConfigurationFromEnvironment>
>

function managedCustodyConfigurationMatches(
  material: X402AttemptMaterial,
  configuration: ManagedCustodyConfiguration,
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
    && material.custodyBudgetRef === cdpX402CustodyBudgetRef(configuration)
    && material.custodyDailyMaximumUnits === configuration.dailyMaxAtomic.toString()
  )
}

function currentManagedCustodyConfiguration(
  material: X402AttemptMaterial,
): ManagedCustodyConfiguration | undefined {
  const configuration = cdpX402CustodyConfigurationFromEnvironment()
  return configuration !== undefined && managedCustodyConfigurationMatches(material, configuration)
    ? configuration
    : undefined
}

function x402MethodFromOperation(operation: PublishedOperation): 'GET' | 'POST' | undefined {
  try {
    const parsed: unknown = JSON.parse(operation.transport.configJson)
    if (!isRecord(parsed) || (parsed.method !== 'GET' && parsed.method !== 'POST')) return undefined
    return parsed.method
  } catch {
    return undefined
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
    if (custodyConfiguration === undefined || !managedCustodyConfigurationMatches(material, custodyConfiguration)) {
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
    ...prepared,
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
): Promise<string | undefined> {
  const custodyConfiguration = currentManagedCustodyConfiguration(material)
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
      || material.paymentSigningClaimedAt !== undefined)
  ) throw new Error('x402_payment_reconciliation_required')

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
  const postSignConfiguration = currentManagedCustodyConfiguration(material)
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
  const custodyConfiguration = currentManagedCustodyConfiguration(material)
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
  const signedHeader = await signAndCommitManagedAuthorization(
    ctx,
    material,
    requestFingerprint,
    requestFingerprintContext,
  )
  if (signedHeader === undefined) return undefined
  const reread = await readX402AuthorizationMaterial(
    ctx,
    prepared,
    byDigest,
    requestFingerprint,
    custodyConfiguration.credentialGeneration,
  )
  const first = storedAuthorizationFromMaterial(reread)
  if (first === undefined) throw new Error('x402_payment_reconciliation_required')
  return currentManagedCustodyConfiguration(reread!) === undefined
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
    useCustodySigner?: boolean
    onPaymentPossiblySubmitted?: () => void
  }>,
): X402PaymentCallbacks {
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
            : { method, operationRef: input.dispatch.operationRef }
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
      ? BROKERED_X402_MANAGED_CUSTODY_REF
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
    if (
      credentialRef === undefined
      || material === null
      || material.state !== 'prepared'
      || material.credentialRef !== credentialRef
      || material.dispatchRef !== input.dispatch.invocationRef
      || material.attemptRef !== input.durableAttemptRef
      || material.effectGeneration !== input.effectGeneration
      || material.paymentIdentifier !== input.operationKeyDigest
      || expected === undefined
    ) {
      if (expected !== undefined && cleanupState === 'prepared') {
        const cleanupOutcome = await bestEffortReleaseX402ExternalSpend(
          ctx,
          expected,
          [input.operationKeyDigest],
        )
        if (cleanupOutcome === 'failed') return undefined
      }
      return undefined
    }
    const validation = await input.validateProviderAuthority({
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
    if (validation.kind !== 'valid') {
      const cleanupOutcome = await bestEffortReleaseX402ExternalSpend(
        ctx,
        expected,
        [input.operationKeyDigest],
      )
      if (cleanupOutcome === 'failed') return undefined
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
        response,
        requirement,
        payer: authorization.payer,
        paymentNonce: authorization.nonce,
        receipt: await readX402EvmReceipt(
          requirement.network,
          response.transaction,
          input.dispatcher,
          input.dispatch.environment,
          authorization.payer,
          authorization.nonce,
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
        ? BROKERED_X402_MANAGED_CUSTODY_REF
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
            budgetRef: cdpX402CustodyBudgetRef(custodyConfiguration),
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
