import type { CustomerRequestCanonicalClaimMaterial } from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  routeAttemptIntegrityValid,
  routeDispatchIntegrityValid,
} from '@/modules/customer-request/route-execution/journal'
import type {
  DispatchLifecycleOpenPorts,
  DispatchLifecyclePorts,
  DispatchPublicationSnapshot,
  DispatchInvocation,
  MarkDispatchedResult,
  OpenDispatchResult,
  RecordNotReleasedResult,
} from '@/modules/customer-request/route-execution/machines'
import { routeStepGrantDigest } from '@/modules/customer-request/route-mandate-admission'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  markUnknownOutcome,
  readRunProjection,
} from './customerRequestRouteExecutionJournalPorts'
import {
  loadActiveRouteMandate,
  loadEligibleRouteSupply,
} from './customerRequestRouteExecutionOpenPorts'
import {
  requireAttempt,
  requireDispatch,
  requireRun,
  toAttemptRecord,
  toDispatchRecord,
  toRunRecord,
} from './customerRequestRouteExecutionSnapshots'

export function dispatchLifecyclePorts(ctx: MutationCtx): DispatchLifecyclePorts {
  return {
    ...dispatchLifecycleOpenPorts(ctx),

    loadRunByRef: async (runRef) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
      return run === null ? null : toRunRecord(run)
    },

    loadRunProjection: async (runRef) => await readRunProjection(ctx, runRef),


    commitMarkDispatched: async (input) => {
      const dispatch = await requireDispatch(ctx, input.dispatchRef)
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      await ctx.db.patch(dispatch._id, { state: 'delivered', updatedAt: input.now })
      await ctx.db.patch(attempt._id, { state: 'dispatched', updatedAt: input.now })
      await ctx.db.patch(run._id, { state: 'running', updatedAt: input.now })
      return { kind: 'recorded' } satisfies Extract<MarkDispatchedResult, { kind: 'recorded' }>
    },

    commitNotReleasedFailed: async (input) => {
      const dispatch = await requireDispatch(ctx, input.dispatchRef)
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      await ctx.db.patch(dispatch._id, { state: 'failed', updatedAt: input.now })
      await ctx.db.patch(attempt._id, {
        state: 'failed',
        transportObservationJson: input.observationJson,
        transportObservationDigest: input.observationDigest,
        updatedAt: input.now,
      })
      await ctx.db.patch(run._id, {
        state: 'failed',
        resultJson: input.resultJson,
        resultDigest: input.resultDigest,
        updatedAt: input.now,
      })
      const failed = await readRunProjection(ctx, run.runRef)
      if (failed === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'failed', run: failed } satisfies Extract<
        RecordNotReleasedResult,
        { kind: 'failed' }
      >
    },

  }
}

export function dispatchLifecycleOpenPorts(ctx: QueryCtx | MutationCtx): DispatchLifecycleOpenPorts {
  const now = Date.now()
  return {
    now: () => now,
    loadDispatchByRef: async (dispatchRef) => {
      const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
        .withIndex('by_dispatchRef', (query) => query.eq('dispatchRef', dispatchRef)).unique()
      return dispatch === null ? null : toDispatchRecord(dispatch)
    },

    loadAttemptByRef: async (attemptRef) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
      return attempt === null ? null : toAttemptRecord(attempt)
    },
    loadRunByRef: async (runRef) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
      return run === null ? null : toRunRecord(run)
    },

    loadActiveMandateForPrincipal: async (requestId, principalId, now) => (
      await loadActiveRouteMandate(ctx, requestId, principalId, now)
    ),

    loadEligibleExactCapabilitySupply: async (input) => (
      await loadEligibleRouteSupply(ctx, { ...input, now })
    ),

    loadPublicationAtRevision: async (publicationRef, revision) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', publicationRef).eq('revision', revision)
        )).unique()
      return publication === null ? null : toPublicationSnapshot(publication)
    },
  }
}
export async function openDispatchFromJournal(
  args: Readonly<{ dispatchRef: string }>,
  ports: DispatchLifecycleOpenPorts,
): Promise<OpenDispatchResult> {
  const now = ports.now()
  const dispatch = await ports.loadDispatchByRef(args.dispatchRef)
  const attempt = dispatch === null ? null : await ports.loadAttemptByRef(dispatch.attemptRef)
  const run = dispatch === null ? null : await ports.loadRunByRef(dispatch.runRef)
  if (dispatch === null || attempt === null || run === null || dispatch.state !== 'pending'
    || attempt.state !== 'queued' || dispatch.attemptRef !== attempt.attemptRef
    || dispatch.runRef !== attempt.runRef || dispatch.runRef !== run.runRef
    || run.requestId !== attempt.requestId || run.principalId !== attempt.grant.principalId
    || dispatch.operationKeyDigest !== attempt.operationKeyDigest
    || !routeDispatchIntegrityValid(dispatch) || !routeAttemptIntegrityValid(attempt)
    || attempt.grant.grantRef !== `route-step-grant:v1:${attempt.grant.grantDigest}`
    || routeStepGrantDigest(attempt.grant) !== attempt.grant.grantDigest
    || attempt.grant.expiresAt <= now) {
    return { kind: 'unavailable' }
  }
  if (dispatch.leaseOwner === undefined || dispatch.leaseExpiresAt === undefined) {
    return { kind: 'unavailable' }
  }
  const mandate = await ports.loadActiveMandateForPrincipal(
    attempt.requestId, attempt.grant.principalId, now,
  )
  if (mandate.kind !== 'active' || mandate.mandateRef !== attempt.grant.mandateRef
    || mandate.mandateDigest !== attempt.grant.mandateDigest) {
    return { kind: 'unavailable' }
  }
  const supply = await ports.loadEligibleExactCapabilitySupply({
    networkId: mandate.networkId,
    businessId: attempt.grant.step.businessId,
    offeringId: attempt.grant.step.offeringId,
    bindingId: attempt.grant.step.bindingId,
    contractRef: attempt.grant.step.contractRef,
    expectedOfferingRegistrationHash: attempt.grant.step.offeringRegistrationHash,
    expectedBindingRegistrationHash: attempt.grant.step.bindingRegistrationHash,
    now,
  })
  if (supply.kind !== 'available') return { kind: 'unavailable' }
  const publication = await ports.loadPublicationAtRevision(
    attempt.grant.step.publicationRef,
    attempt.grant.step.publicationRevision,
  )
  if (publication === null || publication.disposition !== 'current'
    || publication.businessId !== attempt.grant.step.businessId
    || publication.networkId !== mandate.networkId
    || publication.offeringId !== attempt.grant.step.offeringId
    || publication.bindingId !== attempt.grant.step.bindingId
    || publication.capabilityId !== attempt.grant.step.contractRef.capabilityId
    || publication.version !== attempt.grant.step.contractRef.version
    || publication.contractDigest !== attempt.grant.step.contractRef.contractDigest
    || publication.credentialState !== 'ready' || publication.healthState !== 'healthy'
    || publication.readinessObservedAt === undefined || publication.readinessObservedAt > now
    || publication.readinessValidUntil === undefined
    || publication.readinessValidUntil < now) {
    return { kind: 'unavailable' }
  }
  const acceptedBasis = mandate.mandate.authorization.kind === 'explicit'
    ? {
        kind: 'customer_request_mandate_use' as const,
        mandateRef: mandate.mandate.mandateRef,
        mandateDigest: mandate.mandate.mandateDigest,
        requestRevision: mandate.mandate.request.requestRevision,
        routeGeneration: mandate.mandate.route.generation,
        authorization: {
          kind: 'explicit' as const,
          authorizationEvidenceRef: mandate.mandate.authorization.authorizationEvidenceRef,
          authorizationEvidenceDigest: mandate.mandate.authorization.authorizationEvidenceDigest,
        },
        grantRef: attempt.grant.grantRef,
        grantDigest: attempt.grant.grantDigest,
      }
    : {
        kind: 'customer_request_mandate_use' as const,
        mandateRef: mandate.mandate.mandateRef,
        mandateDigest: mandate.mandate.mandateDigest,
        requestRevision: mandate.mandate.request.requestRevision,
        routeGeneration: mandate.mandate.route.generation,
        authorization: {
          kind: 'standing_low_risk' as const,
          standingPolicyRef: mandate.mandate.authorization.standingPolicyRef,
          standingPolicyDigest: mandate.mandate.authorization.standingPolicyDigest,
          authorityUseRef: mandate.mandate.authorization.authorityUseRef,
        },
        grantRef: attempt.grant.grantRef,
        grantDigest: attempt.grant.grantDigest,
      }
  const targetDigest = canonicalDigest({
    kind: 'dispatch',
    operationRef: attempt.grant.step.operationRef,
    admittedOperation: attempt.grant.step.admittedOperation,
    publicationRef: attempt.grant.step.publicationRef,
    publicationRevision: attempt.grant.step.publicationRevision,
    bindingId: attempt.grant.step.bindingId,
    bindingRegistrationHash: attempt.grant.step.bindingRegistrationHash,
    adapterId: supply.binding.adapterId,
    configDigest: supply.binding.configDigest,
    endpointUrl: supply.binding.endpointUrl,
  } as StableHashValue)
  const canonical = {
    invocationRef: `action-invocation:customer-request-route:${dispatch.dispatchRef}`,
    sourceRef: dispatch.dispatchRef,
    invocationVersion: 1,
    actor: {
      callerRef: 'runtime:customer-request-route-worker',
      principalRef: attempt.grant.principalId,
    },
    origin: {
      kind: 'request_owned' as const,
      requestRef: run.requestId,
      revision: run.requestRevision,
    },
    action: {
      id: attempt.grant.step.actionId,
      contractVersion: String(attempt.grant.step.contractRef.version),
    },
    materialInputDigest: attempt.inputDigest,
    authority: {
      reference: attempt.grant.grantRef,
      decisionDigest: attempt.grant.grantDigest,
      targetDigest,
      consequence: `customer_request_route_step:${canonicalDigest(
        attempt.grant.step.effects as StableHashValue,
      )}`,
      limits: { amount: { ...attempt.grant.step.maximumSpend } },
      expiresAt: new Date(attempt.grant.expiresAt).toISOString(),
      acceptedBasis,
    },
    attempt: {
      attemptRef: attempt.attemptRef,
      attemptNumber: 1,
      effectGeneration: 1,
      operationKey: dispatch.operationKeyDigest,
      leaseOwner: dispatch.leaseOwner,
      leaseExpiresAt: new Date(dispatch.leaseExpiresAt).toISOString(),
    },
    recordedAt: new Date(dispatch.createdAt).toISOString(),
  } satisfies CustomerRequestCanonicalClaimMaterial
  const invocation: DispatchInvocation = {
    dispatchRef: dispatch.dispatchRef,
    attemptRef: attempt.attemptRef,
    runRef: attempt.runRef,
    requestId: attempt.requestId,
    requestRevision: run.requestRevision,
    principalId: attempt.grant.principalId,
    mandateRef: attempt.grant.mandateRef,
    grantRef: attempt.grant.grantRef,
    authorityDigest: attempt.grant.authorityDigest,
    actionId: attempt.grant.step.actionId,
    position: attempt.grant.step.position,
    operationKeyDigest: attempt.operationKeyDigest,
    inputJson: attempt.inputJson,
    inputDigest: attempt.inputDigest,
    binding: { ...supply.binding },
    authority: {
      mandateDigest: attempt.grant.mandateDigest,
      grantDigest: attempt.grant.grantDigest,
      capabilityContractDigest: attempt.grant.step.contractRef.contractDigest,
      maximumSpend: { ...attempt.grant.step.maximumSpend },
      expiresAt: attempt.grant.expiresAt,
    },
    canonical,
  }
  return { kind: 'available', invocation }
}


function toPublicationSnapshot(
  publication: Doc<'capabilityPublications'>,
): DispatchPublicationSnapshot {
  return {
    disposition: publication.disposition,
    businessId: String(publication.businessId),
    networkId: publication.networkId,
    offeringId: publication.offeringId,
    bindingId: publication.bindingId,
    capabilityId: publication.capabilityId,
    version: publication.version,
    contractDigest: publication.contractDigest,
    credentialState: publication.credentialState,
    healthState: publication.healthState,
    ...(publication.readinessObservedAt === undefined
      ? {}
      : { readinessObservedAt: publication.readinessObservedAt }),
    ...(publication.readinessValidUntil === undefined
      ? {}
      : { readinessValidUntil: publication.readinessValidUntil }),
  }
}

