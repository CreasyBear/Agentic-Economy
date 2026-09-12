"use node";

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { Agent, fetch as guardedFetch } from 'undici'
import { persistCanonicalReleaseFence, type CanonicalClaimSnapshot } from '@/modules/action-execution/runtime'
import { invokePreparedRouteTransport, prepareRegisteredRouteTransportInvocation, type RouteTransportFetch, type RouteTransportObservation, type RouteTransportRuntime } from '@/modules/capability-supply/route-transport-runtime'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { currentToolQuotesMatch } from '../current-tool-quote'
import { chargeSettlementOutcome, credentialFromEnvironment, x402PaymentCredentialRefFromEnvironment } from '@/modules/capability-supply/server'
import { pricingConfigSourceAmount } from '@/modules/money/public'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import { internal } from '../../../../convex/_generated/api'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { type ChargeSettlementResult, parseContractOutput, projectOuterResult, projectSellerOnboardingCanaryResult, readCanonicalSnapshot } from '../../../../convex/capabilityCallProjection'
import { convergePreRelease, type WorkerResult } from './charge'
import { brokeredProviderAuthorityValidator, createBrokeredX402PaymentCallbacks, credentiallessX402ConnectionAuthorityValidator, routeInvocation, X402_MANAGED_CUSTODY_REF } from './x402Route'
import { issueProviderLease, providerCredentialReader, providerLeaseAuthorityValidator, settleProviderLease, type ProviderLeaseAuthority } from './lease'
import { runCommittedManagedX402Transport } from './brokeredX402'
import { exactSellerCanarySnapshotMatches, type CallPreparation, type SellerCanaryOperationSnapshot } from './runPreparation'
import {
  invokeProviderConsequenceViaVercel,
  providerConsequenceX402PaymentCustodyAvailable,
} from './providerConsequenceBridge'

type PreparedExecutionRun = Extract<CallPreparation, { kind: 'prepared' }>

type GrantValidityExpectation = Readonly<{
  grantRef: string
  ownerId: string
  credentialId: string
  principalId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  generation: number
  policyDigest: string
}>

function activeGrantMatches(
  candidate: unknown,
  expected: GrantValidityExpectation,
): boolean {
  if (candidate === null || typeof candidate !== 'object') return false
  const grant = candidate as Record<string, unknown>
  return grant.grantRef === expected.grantRef
    && grant.ownerId === expected.ownerId
    && grant.credentialId === expected.credentialId
    && grant.principalId === expected.principalId
    && grant.applicationRef === expected.applicationRef
    && grant.environment === expected.environment
    && grant.generation === expected.generation
    && grant.spendingPolicyDigest === expected.policyDigest
    && grant.lifecycle === 'active'
}

export async function releaseCallRun(
  ctx: ActionCtx,
  preparedContext: PreparedExecutionRun,
): Promise<WorkerResult> {
  const {
    dispatch,
    port,
    grant,
    operation,
    descriptor,
    input,
    isX402,
    economicRail,
    executionContext,
    pricingConfig,
    connectionAuthority,
    isCredentiallessX402Connection,
    authorityMaximumSpend,
    persistedAuthority,
    authorityBasis,
    authorityExpiresAt,
    claimed,
    durableAttemptRef,
    durableEffectGeneration,
    operationKeyDigest,
    baseBinding,
    callIdentity,
  } = preparedContext
  const isManagedCanary = economicRail === 'managed_testnet_canary'
  let leaseRef: string | undefined
  let leaseAuthority: ProviderLeaseAuthority | undefined
  const beforeLease = await readCanonicalSnapshot(port, dispatch.callRef, durableAttemptRef)
  if (beforeLease === undefined) return { kind: 'none' }
  if (beforeLease.control.control.control.state === 'cancelled') return { kind: 'none' }
  if (beforeLease.control.control.control.state === 'reconciliation_required') return { kind: 'none' }
  if (isManagedCanary || (isX402 && economicRail !== 'brokered_x402')) {
    return await convergePreRelease(
      ctx,
      dispatch,
      claimed,
      'operation_unsupported',
      false,
      'Inspect a managed x402 Operation before invoking it.',
    )
  }
  if (connectionAuthority !== undefined && economicRail !== 'brokered_x402' && !isManagedCanary) {
    const lease = await issueProviderLease(ctx, {
      dispatch,
      operation,
      connectionAuthority,
      durableAttemptRef,
      durableEffectGeneration,
      authorityExpiresAt,
    })
    if (lease.kind === 'refused') {
      return await convergePreRelease(ctx, dispatch, claimed, 'provider_refused', false, lease.nextAction)
    }
    leaseRef = lease.leaseRef
    leaseAuthority = lease.leaseAuthority
  }

  const invocation = routeInvocation(
    baseBinding,
    input,
    {
      attemptRef: durableAttemptRef,
      effectGeneration: durableEffectGeneration,
      operationKeyDigest,
      mandateDigest: canonicalDigest(authorityBasis as StableHashValue),
      grantDigest: grant.spendingPolicyDigest,
      capabilityContractDigest: operation.identity.contractDigest,
      maximumSpend: authorityMaximumSpend,
      expiresAt: Date.parse(authorityExpiresAt),
      callIdentity,
    },
    leaseRef,
    leaseAuthority,
    dispatch.callRef,
    dispatch.toolRef,
    operation.readiness.validUntil,
    operation.readiness.qualificationDigest,
    connectionAuthority,
    economicRail === 'brokered_x402'
      ? (dispatch.sourceUsdcUnits === undefined ? pricingConfigSourceAmount(pricingConfig) : { currency: 'USDC', exponent: 6, units: dispatch.sourceUsdcUnits })
      : isManagedCanary
        ? dispatch.sellerOnboardingCanary?.funding.requestedSpend
        : undefined,
    dispatch.committedPaymentRequiredJson,
  )
  const preparation = prepareRegisteredRouteTransportInvocation(
    invocation,
    isX402
      ? connectionAuthority !== undefined && economicRail !== 'brokered_x402' && !isManagedCanary
        ? providerConsequenceX402PaymentCustodyAvailable
        : economicRail === 'brokered_x402' || isManagedCanary
        ? () => true
        : () => x402PaymentCredentialRefFromEnvironment() !== undefined
      : undefined,
  )
  if (preparation.kind === 'refused') {
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, preparation.observation.failureCode)
  }
  const beforeCharge = await readCanonicalSnapshot(port, dispatch.callRef, durableAttemptRef)
  if (beforeCharge === undefined) return { kind: 'none' }
  if (
    beforeCharge.control.control.control.state === 'cancelled'
    || beforeCharge.control.control.control.state === 'reconciliation_required'
  ) {
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    return { kind: 'none' }
  }
  if (!await isPublicHttpTarget(preparation.prepared.endpoint, defaultDnsResolver)) {
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'endpoint_not_public')
  }
  let fenced: CanonicalClaimSnapshot | undefined
  const persistBrokeredReleaseFence = async (): Promise<boolean> => {
    try {
      if (dispatch.sellerOnboardingCanary !== undefined) {
        if (dispatch.sellerOnboardingCanary.expiresAt <= Date.now()) return false
        const exactSnapshot = await ctx.runQuery(
          internal.capabilitySupplyCurrentTool.readExactSellerCanaryOperationSnapshot,
          {
            publicationRef: dispatch.sellerOnboardingCanary.publicationRef,
            revision: dispatch.sellerOnboardingCanary.publicationRevision,
          },
        )
        const exactOperation = exactSnapshot === null
          ? undefined
          : parsePublishedToolSnapshot(exactSnapshot.toolJson)
        if (
          exactSnapshot === null
          || exactOperation === undefined
          || !exactSellerCanarySnapshotMatches({
            dispatch,
            snapshot: exactSnapshot as SellerCanaryOperationSnapshot,
            operation: exactOperation,
          })
        ) return false
      }
      if (fenced !== undefined) return true
      const fencedResult = await persistCanonicalReleaseFence(
        { snapshot: claimed, recordedAt: new Date().toISOString() },
        port,
      )
      if (fencedResult.kind === 'refused') return false
      if (economicRail === 'brokered_x402' && dispatch.sellerOnboardingCanary === undefined) {
        const submissionFence = await ctx.runMutation(
          internal.moneyManagedCallLifecycle.markPossiblySubmitted,
          {
            callRef: dispatch.callRef,
            evidenceDigest: canonicalDigest({
              format: 'ae.managed-x402-submission-fence:v1',
              callRef: dispatch.callRef,
              attemptRef: durableAttemptRef,
              effectGeneration: durableEffectGeneration,
              operationKeyDigest,
            }),
            now: Date.now(),
          },
        )
        if (submissionFence.kind !== 'accepted') return false
        brokeredPaymentPossiblySubmitted = true
      }
      const snapshot = await readCanonicalSnapshot(port, dispatch.callRef, durableAttemptRef)
      if (
        snapshot === undefined
        || snapshot.control.control.control.state === 'cancelled'
        || snapshot.control.control.control.state === 'reconciliation_required'
      ) return false
      fenced = snapshot
      return true
    } catch (cause) {
      return degradeBackend(cause, false, { site: 'persistBrokeredReleaseFence', reason: 'source_unavailable' })
    }
  }
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  const closeDispatcher = async (): Promise<void> => {
    await dispatcher.close().catch(() => undefined)
  }
  const send: RouteTransportFetch = async (target, init) => {
    if (Date.parse(authorityExpiresAt) <= Date.now()) throw new Error('operation_authority_expired')
    return await guardedFetch(target, { ...init, dispatcher })
  }
  const readProviderCredential = connectionAuthority === undefined || economicRail === 'brokered_x402' || isManagedCanary
    ? undefined
    : providerCredentialReader(ctx, connectionAuthority, dispatch)
  const validateProviderAuthority = connectionAuthority === undefined
    ? undefined
    : isCredentiallessX402Connection
      ? credentiallessX402ConnectionAuthorityValidator(
          ctx,
          connectionAuthority,
          operation.binding.endpointUrl,
        )
      : economicRail === 'brokered_x402' || isManagedCanary
      ? brokeredProviderAuthorityValidator(ctx, connectionAuthority)
      : providerLeaseAuthorityValidator(ctx, connectionAuthority, dispatch)
  const grantValidityExpectation: GrantValidityExpectation = {
    grantRef: persistedAuthority.grantRef,
    ownerId: dispatch.ownerId,
    credentialId: dispatch.credentialId,
    principalId: dispatch.principalId,
    applicationRef: dispatch.applicationRef,
    environment: dispatch.environment,
    generation: dispatch.grantGeneration,
    policyDigest: grant.spendingPolicyDigest,
  }
  const isGrantStillValid = async (): Promise<boolean> => {
    let currentGrant: unknown
    try {
      currentGrant = await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
        grantRef: grantValidityExpectation.grantRef,
        ownerId: grantValidityExpectation.ownerId,
        credentialId: grantValidityExpectation.credentialId,
        principalId: grantValidityExpectation.principalId,
        applicationRef: grantValidityExpectation.applicationRef,
        environment: grantValidityExpectation.environment,
        generation: grantValidityExpectation.generation,
        now: Date.now(),
      })
    } catch (cause) {
      return degradeBackend(cause, false, { site: 'isGrantStillValid', reason: 'source_unavailable' })
    }
    return activeGrantMatches(currentGrant, grantValidityExpectation)
  }
  let brokeredPaymentPossiblySubmitted = false
  const paymentCallbacks = connectionAuthority === undefined
    || economicRail === 'ae_internal'
    || validateProviderAuthority === undefined
    ? undefined
    : economicRail === 'brokered_x402'
      ? createBrokeredX402PaymentCallbacks(ctx, {
          dispatch,
          operation,
          connectionAuthority,
          durableAttemptRef,
          effectGeneration: claimed.attempt.effectGeneration,
          operationKeyDigest,
          dispatcher,
          isGrantStillValid,
          validateProviderAuthority,
          onPaymentPossiblySubmitted: () => {
            brokeredPaymentPossiblySubmitted = true
          },
        })
      : undefined
  const runtime: RouteTransportRuntime = {
    send,
    resolveCredential: economicRail === 'brokered_x402' || isManagedCanary
      ? () => undefined
      : credentialFromEnvironment,
    readX402PaymentCredentialRef: economicRail === 'brokered_x402' || isManagedCanary
      ? () => X402_MANAGED_CUSTODY_REF
      : x402PaymentCredentialRefFromEnvironment,
    ...(validateProviderAuthority === undefined ? {} : {
      validateProviderConnectionAuthority: validateProviderAuthority,
    }),
    ...(readProviderCredential === undefined ? {} : {
      readProviderConnectionCredentialRef: readProviderCredential,
    }),
    ...(paymentCallbacks ?? {}),
    ...(economicRail === 'brokered_x402' || isManagedCanary
      ? { beforeX402PaymentAuthorizationRead: persistBrokeredReleaseFence }
      : {}),
  }
  let finalGrant
  try {
    finalGrant = await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
      grantRef: persistedAuthority.grantRef,
      ownerId: dispatch.ownerId,
      credentialId: dispatch.credentialId,
      environment: dispatch.environment,
      principalId: dispatch.principalId,
      applicationRef: dispatch.applicationRef,
      generation: dispatch.grantGeneration,
      now: Date.now(),
    })
  } catch (cause) {
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    await closeDispatcher()
    return degradeBackend(
      cause,
      await convergePreRelease(
        ctx,
        dispatch,
        claimed,
        'pre_release_failed',
        true,
        'Grant authority could not be revalidated before release.',
      ),
      { site: 'releaseCallRun', reason: 'source_unavailable' },
    )
  }
  if (!activeGrantMatches(finalGrant, grantValidityExpectation)) {
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    await closeDispatcher()
    return await convergePreRelease(
      ctx,
      dispatch,
      claimed,
      'grant_generation_stale',
      false,
      'Refresh the agent grant and retry.',
    )
  }
  let currentOperation
  try {
    const currentSnapshot = dispatch.sellerOnboardingCanary === undefined
      ? await ctx.runQuery(
          internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
          { toolRef: dispatch.toolRef },
        )
      : await ctx.runQuery(
          internal.capabilitySupplyCurrentTool.readExactSellerCanaryOperationSnapshot,
          {
            publicationRef: dispatch.sellerOnboardingCanary.publicationRef,
            revision: dispatch.sellerOnboardingCanary.publicationRevision,
          },
        )
    currentOperation = currentSnapshot === null
      ? undefined
      : parsePublishedToolSnapshot(currentSnapshot.toolJson)
    if (
      currentOperation !== undefined
      && dispatch.sellerOnboardingCanary !== undefined
      && !exactSellerCanarySnapshotMatches({
        dispatch,
        snapshot: currentSnapshot as SellerCanaryOperationSnapshot,
        operation: currentOperation,
      })
    ) currentOperation = undefined
  } catch (cause) {
    currentOperation = degradeBackend(cause, undefined, { site: 'releaseCallRun', reason: 'source_unavailable' })
  }
  if (
    currentOperation === undefined
    || (
      dispatch.sellerOnboardingCanary === undefined
      && !currentToolQuotesMatch({
        toolRef: dispatch.toolRef,
        pinned: operation,
        current: currentOperation,
      })
    )
  ) {
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    await closeDispatcher()
    return await convergePreRelease(
      ctx,
      dispatch,
      claimed,
      'pre_release_failed',
      false,
      'The operation publication or price binding changed before release.',
    )
  }
  if (economicRail === 'ae_internal') {
    if (authorityMaximumSpend.units !== '0') {
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
      await closeDispatcher()
      return await convergePreRelease(
        ctx,
        dispatch,
        claimed,
        'operation_unsupported',
        false,
        'Inspect a managed x402 Operation before invoking it.',
      )
    }
  }
  const releaseBrokeredBuyerBeforeSubmission = async (): Promise<ChargeSettlementResult> => {
    try {
      const reservation = await ctx.runQuery(internal.moneyManagedCallLifecycle.readReservation, {
        callRef: dispatch.callRef,
      })
      if (reservation === null || reservation.state !== 'reserved') {
        return { kind: 'reconciliation_required' }
      }
      const released = await ctx.runAction(internal.moneyManagedCallLifecycle.releaseBeforeSubmission, {
        callRef: dispatch.callRef,
        now: Date.now(),
      })
      return released.kind === 'accepted'
        ? { kind: 'settled', outcome: 'not_released' }
        : { kind: 'reconciliation_required' }
    } catch (cause) {
      return degradeBackend(cause, { kind: 'reconciliation_required' as const }, { site: 'releaseBrokeredBuyerBeforeSubmission', reason: 'source_unavailable' })
    }
  }
  const reconcileBeforeRelease = async (): Promise<ChargeSettlementResult> => {
    if (economicRail === 'brokered_x402') {
      return await releaseBrokeredBuyerBeforeSubmission()
    }
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    return { kind: 'settled', outcome: 'not_released' }
  }

  const beforeRelease = await readCanonicalSnapshot(port, dispatch.callRef, durableAttemptRef)
  if (beforeRelease === undefined) {
    await closeDispatcher()
    return { kind: 'none' }
  }
  if (beforeRelease.control.control.control.state === 'cancelled') {
    const settlement = await reconcileBeforeRelease()
    if (settlement.kind === 'reconciliation_required') {
      await closeDispatcher()
      return await convergePreRelease(ctx, dispatch, claimed, 'invocation_cancelled', false, undefined, settlement)
    }
    await closeDispatcher()
    return { kind: 'none' }
  }
  if (Date.parse(authorityExpiresAt) <= Date.now()) {
    const settlement = await reconcileBeforeRelease()
    await closeDispatcher()
    return await convergePreRelease(
      ctx,
      dispatch,
      claimed,
      'authority_required',
      false,
      'The accepted authority expired before release.',
      settlement,
    )
  }
  if (economicRail !== 'brokered_x402') {
    try {
      const fencedResult = await persistCanonicalReleaseFence({ snapshot: claimed, recordedAt: new Date().toISOString() }, port)
      if (fencedResult.kind === 'refused') {
        const settlement = await reconcileBeforeRelease()
        await closeDispatcher()
        return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'release_fence_refused', settlement)
      }
      fenced = await readCanonicalSnapshot(port, dispatch.callRef, durableAttemptRef)
    } catch (cause) {
      const settlement = await reconcileBeforeRelease()
      await closeDispatcher()
      return degradeBackend(
        cause,
        await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'release_fence_failed', settlement),
        { site: 'releaseCallRun', reason: 'source_unavailable' },
      )
    }
    if (fenced === undefined) {
      const settlement = await reconcileBeforeRelease()
      await closeDispatcher()
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'release_fence_readback_missing', settlement)
    }
    if (
      fenced.control.control.control.state === 'cancelled'
      || fenced.control.control.control.state === 'reconciliation_required'
    ) {
      await closeDispatcher()
      return { kind: 'none' }
    }
  }

  const beforeSend = await readCanonicalSnapshot(port, dispatch.callRef, durableAttemptRef)
  if (beforeSend === undefined) {
    await closeDispatcher()
    return { kind: 'none' }
  }
  if (beforeSend.control.control.control.state === 'cancelled') {
    const cancellationSettlement = await reconcileBeforeRelease()
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    if (cancellationSettlement.kind === 'reconciliation_required') {
      await closeDispatcher()
      return await convergePreRelease(
        ctx,
        dispatch,
        claimed,
        'invocation_cancelled',
        false,
        undefined,
        cancellationSettlement,
      )
    }
    await closeDispatcher()
    return { kind: 'none' }
  }
  if (beforeSend.control.control.control.state === 'reconciliation_required') {
    await closeDispatcher()
    return { kind: 'none' }
  }
  let finalizationStarted = false
  try {
    if (economicRail === 'brokered_x402') {
      const observation = await runCommittedManagedX402Transport(ctx, {
        dispatch,
        operation,
        descriptor,
        prepared: preparation.prepared,
        runtime,
        durableAttemptRef,
        durableEffectGeneration,
        operationKeyDigest,
        fenced: fenced ?? claimed,
      })
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, observation.releaseStarted, durableAttemptRef, durableEffectGeneration)
      finalizationStarted = true
      return { kind: 'recorded' }
    }
    let observation: RouteTransportObservation
    try {
      observation = connectionAuthority !== undefined && !isManagedCanary
        ? await invokeProviderConsequenceViaVercel(ctx, {
            invocation,
            requestDigest: preparation.prepared.requestDigest,
          })
        : await invokePreparedRouteTransport(preparation.prepared, runtime)
    } catch (error) {
      observation = {
        transport: 'unknown',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: preparation.prepared.requestDigest,
        failureCode: `operation_transport_${errorName(error)}`,
      }
    }
    const outputValidation = parseContractOutput(observation, descriptor)
    const deliveryOutcome = chargeSettlementOutcome(observation, economicRail, outputValidation.valid)
    const settlement = deliveryOutcome === 'unknown'
        ? { kind: 'reconciliation_required' as const }
        : { kind: 'settled' as const, outcome: deliveryOutcome }
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, observation.releaseStarted, durableAttemptRef, durableEffectGeneration)
    const recordedAt = new Date().toISOString()
    finalizationStarted = true
    if (isManagedCanary) {
      if (executionContext?.kind !== 'seller_onboarding_canary' || fenced === undefined) {
        throw new Error('seller_canary_release_context_missing')
      }
      await projectSellerOnboardingCanaryResult(
        ctx,
        dispatch,
        operation,
        descriptor,
        observation,
        recordedAt,
        settlement,
        durableAttemptRef,
        durableEffectGeneration,
        outputValidation,
        fenced,
      )
    } else {
      await projectOuterResult(
        ctx,
        dispatch,
        operation,
        descriptor,
        observation,
        recordedAt,
        undefined,
        settlement,
        durableAttemptRef,
        durableEffectGeneration,
        outputValidation,
        fenced,
      )
    }
    return { kind: 'recorded' }
  } catch (error) {
    if (finalizationStarted) throw error
    if (economicRail === 'brokered_x402') {
      if (brokeredPaymentPossiblySubmitted) {
        await ctx.runMutation(internal.moneyManagedCallLifecycle.markOutcomeUnknown, {
          callRef: dispatch.callRef,
          evidenceDigest: canonicalDigest({
            format: 'ae.managed-x402-worker-unknown:v1',
            callRef: dispatch.callRef,
            attemptRef: durableAttemptRef,
            effectGeneration: durableEffectGeneration,
          }),
          now: Date.now(),
        }).catch(() => undefined)
      } else {
        await releaseBrokeredBuyerBeforeSubmission()
      }
    }
    await settleProviderLease(
      ctx,
      dispatch,
      operation,
      leaseRef,
      leaseAuthority,
      true,
      durableAttemptRef,
      durableEffectGeneration,
    ).catch(() => undefined)
    const recordedAt = new Date().toISOString()
    const unknownObservation: RouteTransportObservation = {
      transport: 'unknown',
      disposition: 'unknown',
      releaseStarted: true,
      requestDigest: preparation.prepared.requestDigest,
      failureCode: `operation_worker_${errorName(error)}`,
    }
    finalizationStarted = true
    if (isManagedCanary && fenced !== undefined) {
      await projectSellerOnboardingCanaryResult(
        ctx,
        dispatch,
        operation,
        descriptor,
        unknownObservation,
        recordedAt,
        { kind: 'reconciliation_required' },
        durableAttemptRef,
        durableEffectGeneration,
        { valid: false },
        fenced,
      )
    } else {
      await projectOuterResult(
        ctx,
        dispatch,
        operation,
        descriptor,
        unknownObservation,
        recordedAt,
        undefined,
        { kind: 'reconciliation_required' },
        durableAttemptRef,
        durableEffectGeneration,
        { valid: false },
        fenced,
      )
    }
    return { kind: 'recorded' }
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name.trim().length > 0 ? error.name : 'unknown'
}
