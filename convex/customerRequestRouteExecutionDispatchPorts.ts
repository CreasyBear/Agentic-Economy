import type {
  AttemptRecordSnapshot,
  CancelSupplyLoadResult,
  DispatchLifecycleOpenPorts,
  DispatchLifecyclePorts,
  DispatchPublicationSnapshot,
  DispatchRecordSnapshot,
  MarkAcceptedResult,
  MarkDispatchedResult,
  RecordNotReleasedResult,
  RecoverExpiredDispatchResult,
  RunRecordSnapshot,
} from '@/modules/customer-request/route-execution/machines'
import type { RouteStepGrant } from '@/modules/customer-request/route-mandate-admission'

import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { getEligibleExactCapabilitySupply } from './capabilitySupply'
import {
  markUnknownOutcome,
  readRunProjection,
} from './customerRequestRouteExecutionJournalPorts'
import { readCurrentRouteMandateStateForPrincipal } from './customerRequestRouteMandate'

export function dispatchLifecyclePorts(ctx: MutationCtx): DispatchLifecyclePorts {
  return {
    ...dispatchLifecycleOpenPorts(ctx),

    loadRunByRef: async (runRef) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
      return run === null ? null : toRunRecord(run)
    },

    loadRunProjection: async (runRef) => await readRunProjection(ctx, runRef),

    commitDispatchRequeued: async (input) => {
      const dispatch = await requireDispatch(ctx, input.dispatchRef)
      const attempt = await requireAttempt(ctx, input.attemptRef)
      await ctx.db.patch(dispatch._id, {
        state: 'pending',
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        availableAt: input.now,
        updatedAt: input.now,
      })
      await ctx.db.patch(attempt._id, { state: 'queued', updatedAt: input.now })
      await ctx.scheduler.runAfter(0, internal.customerRequestRouteTransportWorker.runNext, {
        workerId: `route-worker:recovery:${dispatch.dispatchRef}`,
      })
      return { kind: 'requeued' } satisfies Extract<RecoverExpiredDispatchResult, { kind: 'requeued' }>
    },

    commitDispatchOutcomeUnknown: async (input) => {
      const dispatch = await requireDispatch(ctx, input.dispatchRef)
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      await ctx.db.patch(dispatch._id, { state: 'outcome_unknown', updatedAt: input.now })
      await markUnknownOutcome(ctx, run, attempt, input.now)
      return { kind: 'outcome_unknown' } satisfies Extract<
        RecoverExpiredDispatchResult,
        { kind: 'outcome_unknown' }
      >
    },

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

    commitMarkAccepted: async (input) => {
      const attempt = await requireAttempt(ctx, input.attemptRef)
      await ctx.db.patch(attempt._id, { state: 'accepted', updatedAt: input.now })
      return { kind: 'recorded' } satisfies Extract<MarkAcceptedResult, { kind: 'recorded' }>
    },
  }
}

export function dispatchLifecycleOpenPorts(ctx: QueryCtx | MutationCtx): DispatchLifecycleOpenPorts {
  return {
    now: () => Date.now(),

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

    loadActiveMandateForPrincipal: async (requestId, principalId, now) => {
      const current = await readCurrentRouteMandateStateForPrincipal(
        ctx, requestId, principalId, now, { requireCurrentGraph: false },
      )
      if (current.kind !== 'active') return { kind: 'missing' }
      return {
        kind: 'active',
        mandateRef: current.mandate.mandateRef,
        mandateDigest: current.mandate.mandateDigest,
        networkId: current.networkId,
      }
    },

    loadEligibleExactCapabilitySupply: async (input) => {
      const supply = await getEligibleExactCapabilitySupply(ctx.db, input)
      if (supply.kind !== 'available') {
        return { kind: 'unavailable' } satisfies CancelSupplyLoadResult
      }
      return {
        kind: 'available',
        binding: {
          adapterId: supply.binding.adapterId,
          endpointUrl: supply.binding.endpointUrl,
          credentialRef: supply.binding.credentialRef,
          configJson: supply.binding.configJson,
          configDigest: supply.binding.configDigest,
        },
      }
    },

    loadPublicationAtRevision: async (publicationRef, revision) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', publicationRef).eq('revision', revision)
        )).unique()
      return publication === null ? null : toPublicationSnapshot(publication)
    },
  }
}

async function requireRun(
  ctx: MutationCtx,
  runRef: string,
): Promise<Doc<'customerRequestRouteRuns'>> {
  const run = await ctx.db.query('customerRequestRouteRuns')
    .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
  if (run === null) throw new Error('customer_request_route_run_integrity_failure')
  return run
}

async function requireAttempt(
  ctx: MutationCtx,
  attemptRef: string,
): Promise<Doc<'customerRequestRouteStepAttempts'>> {
  const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
  if (attempt === null) throw new Error('customer_request_route_run_attempt_integrity_failure')
  return attempt
}

async function requireDispatch(
  ctx: MutationCtx,
  dispatchRef: string,
): Promise<Doc<'customerRequestRouteDispatchOutbox'>> {
  const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
    .withIndex('by_dispatchRef', (query) => query.eq('dispatchRef', dispatchRef)).unique()
  if (dispatch === null) throw new Error('customer_request_route_dispatch_integrity_failure')
  return dispatch
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

function toRunRecord(run: Doc<'customerRequestRouteRuns'>): RunRecordSnapshot {
  return {
    runRef: run.runRef,
    principalId: run.principalId,
    requestId: run.requestId,
    requestRevision: run.requestRevision,
    mandateRef: run.mandateRef,
    mandateDigest: run.mandateDigest,
    generationRef: run.generationRef,
    routePlanId: run.routePlanId,
    routeDigest: run.routeDigest,
    ...(run.businesses === undefined ? {} : {
      businesses: run.businesses.map((business) => ({ ...business })),
    }),
    state: run.state,
    totalSteps: run.totalSteps,
    completedSteps: run.completedSteps,
    currentPosition: run.currentPosition,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

function toAttemptRecord(
  attempt: Doc<'customerRequestRouteStepAttempts'>,
): AttemptRecordSnapshot {
  return {
    attemptRef: attempt.attemptRef,
    attemptDigest: attempt.attemptDigest,
    runRef: attempt.runRef,
    requestId: attempt.requestId,
    mandateRef: attempt.mandateRef,
    actionId: attempt.actionId,
    position: attempt.position,
    operationKeyDigest: attempt.operationKeyDigest,
    grant: attempt.grant as unknown as RouteStepGrant,
    inputJson: attempt.inputJson,
    inputDigest: attempt.inputDigest,
    state: attempt.state,
    ...(attempt.outputJson === undefined ? {} : { outputJson: attempt.outputJson }),
    ...(attempt.outputDigest === undefined ? {} : { outputDigest: attempt.outputDigest }),
    ...(attempt.transportObservationJson === undefined
      ? {}
      : { transportObservationJson: attempt.transportObservationJson }),
    ...(attempt.transportObservationDigest === undefined
      ? {}
      : { transportObservationDigest: attempt.transportObservationDigest }),
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  }
}

function toDispatchRecord(
  dispatch: Doc<'customerRequestRouteDispatchOutbox'>,
): DispatchRecordSnapshot {
  return {
    dispatchRef: dispatch.dispatchRef,
    dispatchDigest: dispatch.dispatchDigest,
    runRef: dispatch.runRef,
    attemptRef: dispatch.attemptRef,
    operationKeyDigest: dispatch.operationKeyDigest,
    state: dispatch.state,
    availableAt: dispatch.availableAt,
    createdAt: dispatch.createdAt,
    ...(dispatch.leaseOwner === undefined ? {} : { leaseOwner: dispatch.leaseOwner }),
    ...(dispatch.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: dispatch.leaseExpiresAt }),
  }
}
