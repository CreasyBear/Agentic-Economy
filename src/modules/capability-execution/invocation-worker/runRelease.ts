"use node";

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { Agent, fetch as guardedFetch } from 'undici'
import { persistCanonicalReleaseFence, type CanonicalClaimSnapshot } from '@/modules/action-invocation'
import { invokePreparedRouteTransport, prepareRegisteredRouteTransportInvocation, type RouteTransportFetch, type RouteTransportObservation, type RouteTransportRuntime } from '@/modules/capability-supply/route-transport-runtime'
import { chargeSettlementOutcome, credentialFromEnvironment, x402PaymentCredentialRefFromEnvironment, type EconomicRail } from '@/modules/capability-supply/server'
import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import { internal } from '../../../../convex/_generated/api'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { type ChargeSettlementResult, type WorkerAcceptedCharge, parseContractOutput, projectOuterResult, readCanonicalSnapshot } from '../../../../convex/capabilityOperationInvocationProjection'
import { authorizeAeInternalCharge, convergePreRelease, markBrokeredInvocationChargeOutcomeUnknown, reconcileAcceptedCharge, releaseBrokeredInvocationCharge, reserveBrokeredInvocationCharge, type BrokeredChargeReservation, type WorkerResult } from './charge'
import { brokeredProviderAuthorityValidator, createBrokeredX402PaymentCallbacks, createX402PaymentCallbacks, routeInvocation, releaseX402ExternalSpendBeforeSubmission, settleX402TransportObservation, BROKERED_X402_MANAGED_CUSTODY_REF } from './x402Route'
import { issueProviderLease, providerCredentialReader, providerLeaseAuthorityValidator, settleProviderLease, type ProviderLeaseAuthority } from './lease'
import { runBrokeredX402Transport } from './brokeredX402'
import type { InvocationPreparation } from './runPreparation'

type PreparedInvocationRun = Extract<InvocationPreparation, { kind: 'prepared' }>

export async function releaseInvocationRun(
  ctx: ActionCtx,
  preparedContext: PreparedInvocationRun,
): Promise<WorkerResult> {
  const {
    dispatch,
    port,
    principal,
    grant,
    operation,
    descriptor,
    input,
    isX402,
    economicRail,
    pricingConfig,
    connectionAuthority,
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
  let leaseRef: string | undefined
  let leaseAuthority: ProviderLeaseAuthority | undefined
  const beforeLease = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
  if (beforeLease === undefined) return { kind: 'none' }
  if (beforeLease.control.control.control.state === 'cancelled') return { kind: 'none' }
  if (beforeLease.control.control.control.state === 'reconciliation_required') return { kind: 'none' }
  if (connectionAuthority !== undefined && economicRail !== 'brokered_x402') {
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
      grantDigest: grant.policyDigest,
      capabilityContractDigest: operation.identity.contractDigest,
      maximumSpend: authorityMaximumSpend,
      expiresAt: Date.parse(authorityExpiresAt),
      callIdentity,
    },
    leaseRef,
    leaseAuthority,
    dispatch.invocationRef,
    dispatch.operationRef,
    operation.readiness.validUntil,
    operation.readiness.qualificationDigest,
    connectionAuthority,
    economicRail === 'brokered_x402' ? pricingConfig.providerAmount : undefined,
  )
  const preparation = prepareRegisteredRouteTransportInvocation(
    invocation,
    isX402
      ? dispatch.environment === 'production'
        ? () => true
        : () => x402PaymentCredentialRefFromEnvironment() !== undefined
      : undefined,
  )
  if (preparation.kind === 'refused') {
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, preparation.observation.failureCode)
  }
  const beforeCharge = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
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
  let moneyResult: WorkerAcceptedCharge | undefined
  let brokeredReservation: BrokeredChargeReservation | undefined
  if (economicRail === 'ae_internal') {
    const authorized = await authorizeAeInternalCharge(ctx, {
      principal,
      operation,
      dispatch,
      authorityMaximumSpend,
      durableAttemptRef,
    })
    if (authorized.kind === 'missing_billing_identity') {
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'billing_identity_missing')
    }
    if (authorized.kind === 'refused') {
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
      return await convergePreRelease(ctx, dispatch, claimed, authorized.code, authorized.retryable)
    }
    moneyResult = authorized.charge
  } else if (economicRail === 'brokered_x402') {
    const reserved = await reserveBrokeredInvocationCharge(ctx, {
      principal,
      operation,
      dispatch,
      authorityMaximumSpend,
      durableAttemptRef,
    })
    if (reserved.kind === 'missing_billing_identity') {
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'billing_identity_missing')
    }
    if (reserved.kind === 'refused') {
      return await convergePreRelease(ctx, dispatch, claimed, reserved.code, reserved.retryable)
    }
    brokeredReservation = reserved.reservation
    moneyResult = reserved.reservation.charge
  }
  const releaseBrokeredBuyerBeforeSubmission = async (): Promise<ChargeSettlementResult> => {
    if (brokeredReservation === undefined) return { kind: 'settled', outcome: 'not_released' }
    let externalSettlement: ChargeSettlementResult
    try {
      externalSettlement = await releaseX402ExternalSpendBeforeSubmission(ctx, {
        dispatch,
        operation,
        attemptRef: durableAttemptRef,
        effectGeneration: durableEffectGeneration,
        evidenceRefs: [preparation.prepared.requestDigest],
      })
    } catch {
      externalSettlement = { kind: 'reconciliation_required' }
    }
    if (externalSettlement.kind !== 'settled' || externalSettlement.outcome !== 'not_released') {
      await markBrokeredInvocationChargeOutcomeUnknown(ctx, brokeredReservation)
      return { kind: 'reconciliation_required' }
    }
    return await releaseBrokeredInvocationCharge(ctx, brokeredReservation)
  }
  const reconcileBeforeRelease = async (): Promise<ChargeSettlementResult> => {
    if (brokeredReservation !== undefined) {
      return await releaseBrokeredBuyerBeforeSubmission()
    }
    if (moneyResult === undefined) {
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
      return { kind: 'settled', outcome: 'not_released' }
    }
    const settlement = await reconcileAcceptedCharge(ctx, dispatch, operation, moneyResult, durableAttemptRef, 'not_released')
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    return settlement
  }

  const beforeRelease = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
  if (beforeRelease === undefined) return { kind: 'none' }
  if (beforeRelease.control.control.control.state === 'cancelled') {
    const settlement = await reconcileBeforeRelease()
    if (settlement.kind === 'reconciliation_required') {
      return await convergePreRelease(ctx, dispatch, claimed, 'invocation_cancelled', false, undefined, settlement)
    }
    return { kind: 'none' }
  }
  if (Date.parse(authorityExpiresAt) <= Date.now()) {
    const settlement = await reconcileBeforeRelease()
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
  let fenced: CanonicalClaimSnapshot | undefined
  try {
    const fencedResult = await persistCanonicalReleaseFence({ snapshot: claimed, recordedAt: new Date().toISOString() }, port)
    if (fencedResult.kind === 'refused') {
      const settlement = await reconcileBeforeRelease()
      return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'release_fence_refused', settlement)
    }
    fenced = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
  } catch {
    const settlement = await reconcileBeforeRelease()
    return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'release_fence_failed', settlement)
  }
  if (fenced === undefined) {
    const settlement = await reconcileBeforeRelease()
    return await convergePreRelease(ctx, dispatch, claimed, 'pre_release_failed', false, 'release_fence_readback_missing', settlement)
  }
  if (
    fenced.control.control.control.state === 'cancelled'
    || fenced.control.control.control.state === 'reconciliation_required'
  ) return { kind: 'none' }

  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  const send: RouteTransportFetch = async (target, init) => {
    if (Date.parse(authorityExpiresAt) <= Date.now()) throw new Error('operation_authority_expired')
    return await guardedFetch(target, { ...init, dispatcher })
  }
  const readProviderCredential = connectionAuthority === undefined || economicRail === 'brokered_x402'
    ? undefined
    : providerCredentialReader(ctx, connectionAuthority, dispatch)
  const validateProviderAuthority = connectionAuthority === undefined
    ? undefined
    : economicRail === 'brokered_x402'
      ? brokeredProviderAuthorityValidator(ctx, connectionAuthority)
      : providerLeaseAuthorityValidator(ctx, connectionAuthority, dispatch)
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
          onPaymentPossiblySubmitted: () => {
            brokeredPaymentPossiblySubmitted = true
          },
        })
      : createX402PaymentCallbacks(ctx, {
          dispatch,
          operation,
          connectionAuthority,
          durableAttemptRef,
          effectGeneration: claimed.attempt.effectGeneration,
          operationKeyDigest,
          ...(leaseRef === undefined ? {} : { leaseRef }),
          ...(leaseAuthority === undefined ? {} : { leaseAuthority }),
          validateProviderAuthority,
          dispatcher,
        })
  const runtime: RouteTransportRuntime = {
    send,
    resolveCredential: economicRail === 'brokered_x402'
      ? () => undefined
      : credentialFromEnvironment,
    readX402PaymentCredentialRef: economicRail === 'brokered_x402'
      ? () => BROKERED_X402_MANAGED_CUSTODY_REF
      : x402PaymentCredentialRefFromEnvironment,
    ...(validateProviderAuthority === undefined ? {} : {
      validateProviderConnectionAuthority: validateProviderAuthority,
    }),
    ...(readProviderCredential === undefined ? {} : {
      readProviderConnectionCredentialRef: readProviderCredential,
    }),
    ...(paymentCallbacks ?? {}),
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
  } catch {
    const settlement = await reconcileBeforeRelease()
    return await convergePreRelease(
      ctx,
      dispatch,
      claimed,
      'pre_release_failed',
      true,
      'Grant authority could not be revalidated before release.',
      settlement,
    )
  }
  if (
    finalGrant === null
    || finalGrant.grantRef !== persistedAuthority.grantRef
    || finalGrant.ownerId !== dispatch.ownerId
    || finalGrant.credentialId !== dispatch.credentialId
    || finalGrant.principalId !== dispatch.principalId
    || finalGrant.applicationRef !== dispatch.applicationRef
    || finalGrant.environment !== dispatch.environment
    || finalGrant.generation !== dispatch.grantGeneration
    || finalGrant.policyDigest !== grant.policyDigest
    || finalGrant.lifecycle !== 'active'
  ) {
    const settlement = await reconcileBeforeRelease()
    return await convergePreRelease(
      ctx,
      dispatch,
      claimed,
      'grant_generation_stale',
      false,
      'Refresh the agent grant and retry.',
      settlement,
    )
  }
  const beforeSend = await readCanonicalSnapshot(port, dispatch.invocationRef, durableAttemptRef)
  if (beforeSend === undefined) return { kind: 'none' }
  if (beforeSend.control.control.control.state === 'cancelled') {
    const cancellationSettlement = await reconcileBeforeRelease()
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, false, durableAttemptRef, durableEffectGeneration)
    if (cancellationSettlement.kind === 'reconciliation_required') {
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
    return { kind: 'none' }
  }
  if (beforeSend.control.control.control.state === 'reconciliation_required') return { kind: 'none' }
  let acceptedChargeReconciled = moneyResult === undefined
  let finalizationStarted = false
  try {
    if (economicRail === 'brokered_x402' && brokeredReservation !== undefined && moneyResult !== undefined) {
      const observation = await runBrokeredX402Transport(ctx, {
        dispatch,
        operation,
        descriptor,
        prepared: preparation.prepared,
        runtime,
        durableAttemptRef,
        durableEffectGeneration,
        operationKeyDigest,
        reservation: brokeredReservation,
        money: moneyResult,
        fenced,
      })
      acceptedChargeReconciled = true
      await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, observation.releaseStarted, durableAttemptRef, durableEffectGeneration)
      finalizationStarted = true
      return { kind: 'recorded' }
    }
    let observation: RouteTransportObservation
    try {
      observation = await invokePreparedRouteTransport(preparation.prepared, runtime)
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
    const settlement = isX402
      ? await settleX402TransportObservation(ctx, {
          dispatch,
          operation,
          observation,
          durableAttemptRef,
          durableEffectGeneration,
          operationKeyDigest,
        })
      : moneyResult === undefined
        ? deliveryOutcome === 'unknown'
          ? { kind: 'reconciliation_required' as const }
          : { kind: 'settled' as const, outcome: deliveryOutcome }
        : await reconcileAcceptedCharge(
            ctx,
            dispatch,
            operation,
            moneyResult,
            durableAttemptRef,
            deliveryOutcome,
          )
    acceptedChargeReconciled = true
    await settleProviderLease(ctx, dispatch, operation, leaseRef, leaseAuthority, observation.releaseStarted, durableAttemptRef, durableEffectGeneration)
    const recordedAt = new Date().toISOString()
    finalizationStarted = true
    await projectOuterResult(
      ctx,
      dispatch,
      operation,
      descriptor,
      observation,
      recordedAt,
      moneyResult,
      settlement,
      durableAttemptRef,
      durableEffectGeneration,
      outputValidation,
      fenced,
    )
    return { kind: 'recorded' }
  } catch (error) {
    if (finalizationStarted) throw error
    if (moneyResult !== undefined && !acceptedChargeReconciled) {
      if (brokeredReservation !== undefined) {
        if (brokeredPaymentPossiblySubmitted) {
          await markBrokeredInvocationChargeOutcomeUnknown(ctx, brokeredReservation)
        } else {
          await releaseBrokeredBuyerBeforeSubmission()
        }
      } else {
        await reconcileAcceptedCharge(
          ctx,
          dispatch,
          operation,
          moneyResult,
          durableAttemptRef,
          'unknown',
        )
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
    await projectOuterResult(
      ctx,
      dispatch,
      operation,
      descriptor,
      unknownObservation,
      recordedAt,
      moneyResult,
      { kind: 'reconciliation_required' },
      durableAttemptRef,
      durableEffectGeneration,
      { valid: false },
      fenced,
    )
    return { kind: 'recorded' }
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name.trim().length > 0 ? error.name : 'unknown'
}
