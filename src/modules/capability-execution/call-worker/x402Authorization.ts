import { canonicalDigest } from '@/modules/common/canonical-digest'
import { Agent } from 'undici'
import {
  claimX402SigningSlot,
} from '@/modules/capability-supply/public'
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
  type CdpX402PaymentSigningIntent,
  type CdpX402RequestFingerprintContext,
} from '@/modules/capability-supply/server'
import type {
  ProviderConnectionAuthorityValidator,
  X402PaymentSignatureRequest,
  X402PreparedAuthorization,
} from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedTool } from '@/modules/capability-supply/public'
import { type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { OpenDispatch } from '../../../../convex/capabilityCallProjection'
import type { ConnectionAuthority, ProviderLeaseAuthority } from './lease'
import {
  readX402EvmReceipt,
} from './x402Settlement'
import { X402_MANAGED_CUSTODY_REF } from './x402ManagedCustodyRef'
import { captureBackendException, degradeBackend } from '@/lib/observability/degrade-backend'
import {
  currentManagedCustodyConfiguration,
  managedCustodyConfigurationMatches,
  parseAttemptChallenge,
  requestFingerprintFromPrepared,
  storedAuthorizationFromMaterial,
  x402MethodFromOperation,
  type PreparedX402AuthorizationWithFingerprint,
  type X402AttemptMaterial,
  type X402PaymentAuthorizationFailureCode,
  type X402PaymentAuthorizationFailureDetail,
  type X402PaymentCallbacks,
} from './x402AuthorizationMaterial'

export * from './x402AuthorizationMaterial'
export * from './x402ManagedSigningReplay'

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
  const parsedChallenge = parseAttemptChallenge(material)
  if (!parsedChallenge.ok) {
    return parsedChallenge.cause === undefined
      ? undefined
      : degradeBackend(parsedChallenge.cause, undefined, {
          site: 'signAndRecordSandboxAuthorization',
          reason: 'source_unavailable',
        })
  }
  const { challenge, selectedRequirement } = parsedChallenge
  try {
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
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'signAndRecordSandboxAuthorization',
      reason: 'source_unavailable',
    })
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
  const parsedChallenge = parseAttemptChallenge(material)
  if (!parsedChallenge.ok) {
    return parsedChallenge.cause === undefined
      ? undefined
      : degradeBackend(parsedChallenge.cause, undefined, {
          site: 'signAndCommitManagedAuthorization',
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

  const readMaterial = async () => await readX402AuthorizationMaterial(
    ctx,
    prepared,
    byDigest,
    requestFingerprint,
    custodyConfiguration.credentialGeneration,
  )

  const signedHeader = await claimX402SigningSlot({
    claim: async () => await ctx.runMutation(internal.moneyX402PaymentAttempts.claimX402PaymentAuthorization, {
      custodyRef: prepared.custodyRef,
      authorizationDigest: prepared.authorizationDigest,
      requestFingerprint,
      custodyGeneration: custodyConfiguration.credentialGeneration,
    }),
    readMaterial,
    hasStoredSignature: (row) => storedAuthorizationFromMaterial(row) !== undefined,
    signAndCommit: async (row, isClaimWinner) => {
      if (row.state !== 'prepared') {
        throw new Error('x402_payment_reconciliation_required')
      }
      return await signAndCommitManagedAuthorization(
        ctx,
        row,
        requestFingerprint,
        requestFingerprintContext,
        isClaimWinner,
      )
    },
  })
  if (signedHeader === undefined) return undefined

  const reread = await readMaterial()
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
    operation: PublishedTool
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
  const managedBuyer = input.useCustodySigner === true
    && input.dispatch.sellerOnboardingCanary === undefined
  const managedCanary = input.useCustodySigner === true
    && (input.dispatch.environment === 'sandbox' || input.dispatch.environment === 'production')
    && input.dispatch.sellerOnboardingCanary?.executionPurpose === 'seller_onboarding_canary'

  const settleManagedPreparationFailure = async (
    attempt: X402AttemptMaterial | null | undefined,
    reason: 'authorization_unavailable' | 'preparation_failed',
  ): Promise<void> => {
    if (!managedBuyer) return
    const observedAt = Date.now()
    if (attempt === null || attempt?.state === 'prepared') {
      await ctx.runAction(internal.moneyManagedCallLifecycle.releaseBeforeSubmission, {
        callRef: input.dispatch.callRef,
        now: observedAt,
      }).catch(() => undefined)
      return
    }
    await ctx.runMutation(internal.moneyManagedCallLifecycle.markOutcomeUnknown, {
      callRef: input.dispatch.callRef,
      evidenceDigest: canonicalDigest({
        format: 'ae.managed-x402-preparation-failure:v1',
        invocationRef: input.dispatch.callRef,
        attemptRef: input.durableAttemptRef,
        effectGeneration: input.effectGeneration,
        reason,
        attemptState: attempt?.state ?? 'read_unavailable',
      }),
      now: observedAt,
    }).catch(() => undefined)
  }

  const recordAuthorizationFailure = async (
    code: X402PaymentAuthorizationFailureCode,
    detail?: X402PaymentAuthorizationFailureDetail,
  ): Promise<void> => {
    if (input.useCustodySigner !== true) return
    await ctx.runMutation(
      internal.moneyX402PaymentAttempts.recordX402PaymentAuthorizationFailure,
      {
        dispatchRef: input.dispatch.callRef,
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
    if (!managedBuyer && !managedCanary) return undefined
    const requestFingerprint = requestFingerprintFromPrepared(prepared)
    const requestFingerprintContext = input.useCustodySigner === true
      ? (() => {
          const method = x402MethodFromOperation(input.operation)
          return method === undefined
            ? undefined
            : {
                method,
                toolRef: input.dispatch.toolRef,
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
            dispatchRef: input.dispatch.callRef,
            attemptRef: input.durableAttemptRef,
            effectGeneration: input.effectGeneration,
          },
        ).catch(() => undefined)
      : null
    const credentialRef = X402_MANAGED_CUSTODY_REF
    const releasePreparedReservation = async (): Promise<void> => {
      await settleManagedPreparationFailure(
        material ?? cleanupAttempt,
        'authorization_unavailable',
      )
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
      || material.dispatchRef !== input.dispatch.callRef
      || material.attemptRef !== input.durableAttemptRef
      || material.effectGeneration !== input.effectGeneration
      || material.paymentIdentifier !== input.operationKeyDigest
    ) {
      await recordAuthorizationFailure('material_identity_invalid')
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
              callRef: input.dispatch.callRef,
              toolRef: input.dispatch.toolRef,
              grantedScopes: input.leaseAuthority.grantedScopes,
              grantedResources: input.leaseAuthority.grantedResources,
              readinessValidUntil: input.operation.readiness.validUntil,
              readinessDigest: input.operation.readiness.qualificationDigest,
            }),
      })
    } catch (cause) {
      captureBackendException(cause, { site: 'validateProviderAuthorityForX402Payment' }, 'warning')
      await recordAuthorizationFailure('provider_authority_invalid', 'authority_read_failed')
      await releasePreparedReservation()
      return undefined
    }
    if (validation.kind !== 'valid') {
      await recordAuthorizationFailure('provider_authority_invalid', validation.reason)
      await releasePreparedReservation()
      return undefined
    }
    let grantStillValid = false
    try {
      grantStillValid = await input.isGrantStillValid()
    } catch (cause) {
      captureBackendException(cause, { site: 'isGrantStillValidForX402Payment' }, 'warning')
      grantStillValid = false
    }
    if (!grantStillValid) {
      await recordAuthorizationFailure('grant_invalid')
      await releasePreparedReservation()
      return undefined
    }
    const signature = await readX402Authorization(ctx, prepared, byDigest, {
      credentialRef,
      dispatchRef: input.dispatch.callRef,
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
      await releasePreparedReservation()
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
      if (!managedBuyer && !managedCanary) return undefined
      if (
        request.attemptRef !== input.durableAttemptRef
        || request.effectGeneration !== input.effectGeneration
        || request.paymentIdentifier !== input.operationKeyDigest
      ) return undefined
      const paymentCredentialRef = X402_MANAGED_CUSTODY_REF
      if (paymentCredentialRef === undefined || request.credential !== paymentCredentialRef) return undefined
      const method = input.useCustodySigner === true
        ? x402MethodFromOperation(input.operation)
        : undefined
      if (input.useCustodySigner === true && method === undefined) return undefined
      const requestFingerprint = input.useCustodySigner === true
        ? cdpX402RequestFingerprint(request, {
            method: method as 'GET' | 'POST',
            toolRef: input.dispatch.toolRef,
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
      const managedBuyerReservation = managedBuyer ? await ctx.runQuery(
        internal.moneyManagedCallLifecycle.readReservation,
        { callRef: input.dispatch.callRef },
      ) : null
      if (managedBuyer && (managedBuyerReservation === null || managedBuyerReservation.state !== 'reserved')) return undefined
      const reservationRef = managedBuyerReservation?.treasuryReservationRef
        ?? managedBuyerReservation?.reservationRef
      try {
        const prepareBase = {
          aeEnvironment: input.dispatch.environment,
          dispatchRef: input.dispatch.callRef,
          toolRef: input.dispatch.toolRef,
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
          ...(reservationRef === undefined ? {} : { reservationRef }),
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
          managedCanary
            ? internal.moneyX402PaymentAttempts.prepareSellerOnboardingCanaryPaymentAuthorization
            : internal.moneyX402PaymentAttempts.prepareX402PaymentAuthorization,
          prepareArgs,
        )
        return requestFingerprint === undefined
          ? prepared
          : { ...prepared, requestFingerprint } as PreparedX402AuthorizationWithFingerprint
      } catch (error) {
        const attempt = await ctx.runQuery(
          internal.moneyX402PaymentAttempts.readX402PaymentAttempt,
          {
            dispatchRef: input.dispatch.callRef,
            attemptRef: request.attemptRef,
            effectGeneration: request.effectGeneration,
          },
        ).catch(() => undefined)
        await settleManagedPreparationFailure(attempt, 'preparation_failed')
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
        dispatchRef: input.dispatch.callRef,
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
        dispatchRef: input.dispatch.callRef,
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
