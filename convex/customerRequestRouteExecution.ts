import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseRouteTransportObservationJson } from '@/modules/capability-supply/route-transport-runtime'
import {
  assembleCustomerEvidenceExport,
  assembleSupportProblemList,
  loadProblemBusinessReports,
  loadProblemUpdates,
} from '@/modules/customer-request/route-execution/evidence-load'
import {
  canPreReleaseCancel,
  canRequestAdapterCancellation,
  cancelCommandArgsConflict,
  cancelDisposition,
  cancelPriorCommandConflicts,
  cancelReplayKind,
  cancelRunHeadIntegrityValid,
  cancelRunNotFound,
  recoverDispatchAttemptAligned,
  recoverDispatchLeaseStillCurrent,
  recoverExpiredDispatchKind,
  routeAttemptIntegrityValid,
  routeDispatchIntegrityValid,
} from '@/modules/customer-request/route-execution/journal'
import {
  leaseNextDispatch as leaseNextDispatchMachine,
  recordOutcome as recordOutcomeMachine,
  startOrResume as startOrResumeMachine,
} from '@/modules/customer-request/route-execution/machines'
import {
  decideBusinessProblemClaim,
  decideCustomerProblemReply,
  decideCustomerProblemReport,
  decideSupportProblemStatus,
  projectBusinessProblem,
  projectSupportProblemExport,
} from '@/modules/customer-request/route-execution/problem-support'
import { routeStepGrantDigest } from '@/modules/customer-request/route-mandate-admission'
import { routeStepGrantValue } from '@/modules/customer-request/runtime'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'

import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { getEligibleExactCapabilitySupply } from './capabilitySupply'
import {
  readCurrentRouteMandateStateForPrincipal,
} from './customerRequestRouteMandate'
import { evidenceLoadPorts } from './customerRequestEvidenceLoadPorts'
import {
  journalMutationPorts,
  markUnknownOutcome,
  queueNextStep,
  readRunProjection as readRunProjectionPorts,
} from './customerRequestRouteExecutionJournalPorts'
import { runtimeDb } from './source_state'

const startCommand = v.object({
  requestId: v.string(),
  principalId: v.string(),
  idempotencyKey: v.string(),
})

const runProjection = v.object({
  runRef: v.string(),
  requestId: v.string(),
  requestRevision: v.number(),
  generationRef: v.string(),
  businesses: v.optional(v.array(v.object({
    businessRef: v.string(),
    name: v.string(),
  }))),
  state: v.union(
    v.literal('queued'),
    v.literal('running'),
    v.literal('outcome_unknown'),
    v.literal('completed'),
    v.literal('failed'),
    v.literal('cancelled'),
  ),
  totalSteps: v.number(),
  completedSteps: v.number(),
  currentPosition: v.number(),
  currentState: v.union(
    v.literal('queued'),
    v.literal('leased'),
    v.literal('dispatched'),
    v.literal('accepted'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('outcome_unknown'),
    v.literal('cancelled'),
  ),
  resultJson: v.optional(v.string()),
  cancellationReleaseMayStartAt: v.optional(v.number()),
  cancellationUnavailableSince: v.optional(v.number()),
  cancellationRequestedAt: v.optional(v.number()),
  cancellationAttempt: v.optional(v.union(
    v.object({
      state: v.literal('pending'),
      requestedAt: v.number(),
      nextCheckAt: v.number(),
    }),
    v.object({
      state: v.literal('unknown'),
      requestedAt: v.number(),
      observedAt: v.number(),
      nextCheckAt: v.number(),
    }),
    v.object({
      state: v.literal('rejected'),
      requestedAt: v.number(),
      observedAt: v.number(),
      reason: v.string(),
    }),
  )),
  updatedAt: v.number(),
})

const startResult = v.union(
  v.object({ kind: v.literal('started'), run: runProjection }),
  v.object({ kind: v.literal('replayed'), run: runProjection }),
  v.object({ kind: v.literal('resumed'), run: runProjection }),
  v.object({ kind: v.literal('conflict'), reason: v.literal('command_changed') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('confirmation_required'),
      v.literal('confirmation_expired'),
      v.literal('confirmation_changed'),
      v.literal('route_unavailable'),
    ),
  }),
)

async function readRunProjection(
  ctx: MutationCtx | QueryCtx,
  runRef: string,
): Promise<Infer<typeof runProjection> | null> {
  return await readRunProjectionPorts(ctx, runRef) as Infer<typeof runProjection> | null
}

export const startOrResume = internalMutation({
  args: startCommand.fields,
  returns: startResult,
  handler: async (ctx, args): Promise<Infer<typeof startResult>> => (
    await startOrResumeMachine(args, journalMutationPorts(ctx)) as Infer<typeof startResult>
  ),
})

export const cancelCurrent = internalMutation({
  args: {
    requestId: v.string(), principalId: v.string(), idempotencyKey: v.string(),
    mode: v.union(v.literal('current_and_downstream'), v.literal('after_current_step')),
  },
  returns: v.union(
    v.object({ kind: v.literal('cancelled'), run: runProjection }),
    v.object({ kind: v.literal('replayed'), run: runProjection }),
    v.object({ kind: v.literal('pending'), run: runProjection }),
    v.object({ kind: v.literal('too_late'), run: runProjection }),
    v.object({ kind: v.literal('refused'), reason: v.literal('run_not_found') }),
    v.object({ kind: v.literal('conflict'), reason: v.literal('command_changed') }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    if (cancelCommandArgsConflict(args)) {
      return { kind: 'conflict' as const, reason: 'command_changed' as const }
    }
    const commandKey = `route-cancel-command:v1:${canonicalDigest({
      principalId: args.principalId, requestId: args.requestId, idempotencyKey: args.idempotencyKey,
    })}`
    const commandDigest = canonicalDigest(args)
    const prior = await ctx.db.query('customerRequestRouteCancellationCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (prior !== null) {
      const historicalDefaultDigest = canonicalDigest({
        requestId: args.requestId,
        principalId: args.principalId,
        idempotencyKey: args.idempotencyKey,
      })
      if (cancelPriorCommandConflicts({
        prior, args, commandDigest, historicalDefaultDigest,
      })) {
        return { kind: 'conflict' as const, reason: 'command_changed' as const }
      }
      const replayed = await readRunProjection(ctx, prior.runRef)
      if (replayed === null) throw new Error('customer_request_route_cancellation_integrity_failure')
      return { kind: cancelReplayKind(prior.result), run: replayed }
    }
    const head = await ctx.db.query('customerRequestRouteRunHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (cancelRunNotFound(head, args.principalId) || head === null) {
      return { kind: 'refused' as const, reason: 'run_not_found' as const }
    }
    const run = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', head.currentRunRef)).unique()
    if (!cancelRunHeadIntegrityValid(run, head) || run === null) {
      throw new Error('customer_request_route_run_head_integrity_failure')
    }
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_runRef_and_position', (query) => (
        query.eq('runRef', run.runRef).eq('position', run.currentPosition)
      )).unique()
    if (attempt === null) throw new Error('customer_request_route_run_attempt_integrity_failure')
    const outbox = await ctx.db.query('customerRequestRouteDispatchOutbox')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attempt.attemptRef)).unique()
    if (outbox === null) throw new Error('customer_request_route_dispatch_integrity_failure')
    const canCancel = canPreReleaseCancel({
      attemptState: attempt.state, outboxState: outbox.state,
    })
    const canRequestCancel = canRequestAdapterCancellation({
      canPreReleaseCancel: canCancel,
      mode: args.mode,
      attemptState: attempt.state,
      cancellationKind: attempt.grant.step.cancellation.kind,
    })
    if (canCancel) {
      await ctx.db.patch(attempt._id, { state: 'cancelled', updatedAt: now })
      await ctx.db.patch(outbox._id, { state: 'cancelled', updatedAt: now })
      await ctx.db.patch(run._id, { state: 'cancelled', updatedAt: now })
    }
    if (canRequestCancel) {
      const cancellationRef = `route-cancellation:v1:${canonicalDigest({
        runRef: run.runRef,
        attemptRef: attempt.attemptRef,
        operationKeyDigest: attempt.operationKeyDigest,
      })}`
      const existingCancellation = await ctx.db.query('customerRequestRouteCancellationAttempts')
        .withIndex('by_runRef_and_attemptRef', (query) => (
          query.eq('runRef', run.runRef).eq('attemptRef', attempt.attemptRef)
        )).unique()
      if (existingCancellation === null) {
        await ctx.db.insert('customerRequestRouteCancellationAttempts', {
          cancellationRef,
          runRef: run.runRef,
          attemptRef: attempt.attemptRef,
          operationKeyDigest: attempt.operationKeyDigest,
          state: 'pending',
          requestedAt: now,
          updatedAt: now,
        })
        await ctx.scheduler.runAfter(0, internal.customerRequestRouteCancellationWorker.run, {
          cancellationRef,
        })
      }
    }
    const commandResult = cancelDisposition({
      canPreReleaseCancel: canCancel,
      canRequestAdapterCancellation: canRequestCancel,
    })
    await ctx.db.insert('customerRequestRouteCancellationCommands', {
      commandKey,
      commandDigest,
      principalId: args.principalId,
      requestId: args.requestId,
      runRef: run.runRef,
      mode: args.mode,
      result: commandResult,
      boundaryChangedAt: run.updatedAt,
      committedAt: now,
    })
    const projection = await readRunProjection(ctx, run.runRef)
    if (projection === null) throw new Error('customer_request_route_run_integrity_failure')
    return { kind: commandResult, run: projection }
  },
})

const dispatchLease = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  runRef: v.string(),
  position: v.number(),
  operationKeyDigest: v.string(),
  inputJson: v.string(),
  grant: routeStepGrantValue,
  leaseExpiresAt: v.number(),
})

const leaseNextDispatchResult = v.union(
  v.object({ kind: v.literal('leased'), dispatch: dispatchLease }),
  v.object({ kind: v.literal('none') }),
  v.object({ kind: v.literal('refused'), reason: v.literal('lease_invalid') }),
)

export const leaseNextDispatch = internalMutation({
  args: { workerId: v.string(), leaseDurationMs: v.number() },
  returns: leaseNextDispatchResult,
  handler: async (ctx, args): Promise<Infer<typeof leaseNextDispatchResult>> => (
    await leaseNextDispatchMachine(args, journalMutationPorts(ctx)) as Infer<
      typeof leaseNextDispatchResult
    >
  ),
})

const leasedInvocation = v.object({
  dispatchRef: v.string(),
  attemptRef: v.string(),
  runRef: v.string(),
  operationKeyDigest: v.string(),
  inputJson: v.string(),
  inputDigest: v.string(),
  binding: v.object({
    adapterId: v.string(), endpointUrl: v.string(), credentialRef: v.string(),
    configJson: v.string(), configDigest: v.string(),
  }),
  authority: v.object({
    mandateDigest: v.string(), grantDigest: v.string(), capabilityContractDigest: v.string(),
    maximumSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
    expiresAt: v.number(),
  }),
})

export const openLeasedDispatch = internalQuery({
  args: { dispatchRef: v.string(), workerId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('available'), invocation: leasedInvocation }),
    v.object({ kind: v.literal('unavailable') }),
  ),
  handler: async (ctx, args) => {
    const material = await currentLeasedInvocation(ctx, args.dispatchRef, args.workerId, Date.now())
    return material === null
      ? { kind: 'unavailable' as const }
      : { kind: 'available' as const, invocation: material }
  },
})

const cancellationInvocation = v.object({
  cancellationRef: v.string(),
  attemptRef: v.string(),
  operationKeyDigest: v.string(),
  binding: v.object({
    adapterId: v.string(), endpointUrl: v.string(), credentialRef: v.string(),
    configJson: v.string(), configDigest: v.string(),
  }),
  authority: v.object({
    mandateDigest: v.string(), grantDigest: v.string(), capabilityContractDigest: v.string(),
    maximumSpend: v.object({ currency: v.string(), amountMinor: v.number() }),
    expiresAt: v.number(),
  }),
})

export const openCancellationAttempt = internalQuery({
  args: { cancellationRef: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('available'), invocation: cancellationInvocation }),
    v.object({ kind: v.literal('unavailable') }),
  ),
  handler: async (ctx, args) => {
    const cancellation = await ctx.db.query('customerRequestRouteCancellationAttempts')
      .withIndex('by_cancellationRef', (query) => query.eq('cancellationRef', args.cancellationRef))
      .unique()
    if (cancellation === null || cancellation.state !== 'pending') {
      return { kind: 'unavailable' as const }
    }
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', cancellation.attemptRef)).unique()
    if (attempt === null || attempt.runRef !== cancellation.runRef
      || attempt.operationKeyDigest !== cancellation.operationKeyDigest
      || attempt.grant.step.cancellation.kind !== 'adapter_managed'
      || (attempt.state !== 'dispatched' && attempt.state !== 'accepted')
      || !routeAttemptIntegrityValid(attempt)) return { kind: 'unavailable' as const }
    const mandate = await readCurrentRouteMandateStateForPrincipal(
      ctx, attempt.requestId, attempt.grant.principalId, Date.now(), { requireCurrentGraph: false },
    )
    if (mandate.kind !== 'active' || mandate.mandate.mandateRef !== attempt.grant.mandateRef
      || mandate.mandate.mandateDigest !== attempt.grant.mandateDigest) {
      return { kind: 'unavailable' as const }
    }
    const supply = await getEligibleExactCapabilitySupply(ctx.db, {
      networkId: mandate.networkId,
      businessId: attempt.grant.step.businessId,
      offeringId: attempt.grant.step.offeringId,
      bindingId: attempt.grant.step.bindingId,
      contractRef: attempt.grant.step.contractRef,
      expectedOfferingRegistrationHash: attempt.grant.step.offeringRegistrationHash,
      expectedBindingRegistrationHash: attempt.grant.step.bindingRegistrationHash,
    })
    if (supply.kind !== 'available') return { kind: 'unavailable' as const }
    return {
      kind: 'available' as const,
      invocation: {
        cancellationRef: cancellation.cancellationRef,
        attemptRef: attempt.attemptRef,
        operationKeyDigest: attempt.operationKeyDigest,
        binding: {
          adapterId: supply.binding.adapterId,
          endpointUrl: supply.binding.endpointUrl,
          credentialRef: supply.binding.credentialRef,
          configJson: supply.binding.configJson,
          configDigest: supply.binding.configDigest,
        },
        authority: {
          mandateDigest: attempt.grant.mandateDigest,
          grantDigest: attempt.grant.grantDigest,
          capabilityContractDigest: attempt.grant.step.contractRef.contractDigest,
          maximumSpend: { ...attempt.grant.step.maximumSpend },
          expiresAt: attempt.grant.expiresAt,
        },
      },
    }
  },
})

export const resolveCancellationAttempt = internalMutation({
  args: {
    cancellationRef: v.string(),
    observation: v.object({
      disposition: v.union(
        v.literal('accepted'), v.literal('rejected'),
        v.literal('unknown'), v.literal('unsupported'),
      ),
      requestDigest: v.string(),
      responseDigest: v.optional(v.string()),
      providerReference: v.optional(v.string()),
      reason: v.optional(v.string()),
      failureCode: v.optional(v.string()),
    }),
  },
  returns: v.union(
    v.object({ kind: v.literal('recorded'), run: runProjection }),
    v.object({ kind: v.literal('replayed'), run: runProjection }),
    v.object({ kind: v.literal('refused') }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    const cancellation = await ctx.db.query('customerRequestRouteCancellationAttempts')
      .withIndex('by_cancellationRef', (query) => query.eq('cancellationRef', args.cancellationRef))
      .unique()
    if (cancellation === null) return { kind: 'refused' as const }
    const run = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', cancellation.runRef)).unique()
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', cancellation.attemptRef)).unique()
    if (run === null || attempt === null || attempt.runRef !== run.runRef) {
      throw new Error('customer_request_route_cancellation_integrity_failure')
    }
    if (cancellation.state !== 'pending') {
      const replayed = await readRunProjection(ctx, run.runRef)
      if (replayed === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'replayed' as const, run: replayed }
    }
    const state = args.observation.disposition === 'accepted'
      ? 'accepted' as const
      : args.observation.disposition === 'rejected' || args.observation.disposition === 'unsupported'
        ? 'rejected' as const
        : 'unknown' as const
    await ctx.db.patch(cancellation._id, {
      state,
      requestDigest: args.observation.requestDigest,
      ...(args.observation.responseDigest === undefined ? {} : { responseDigest: args.observation.responseDigest }),
      ...(args.observation.providerReference === undefined ? {} : { providerReference: args.observation.providerReference }),
      ...(args.observation.reason === undefined ? {} : { reason: args.observation.reason }),
      ...(args.observation.failureCode === undefined ? {} : { failureCode: args.observation.failureCode }),
      resolvedAt: now,
      updatedAt: now,
    })
    if (state === 'accepted') {
      await resolveCancellationCommand(ctx, run.runRef, 'cancelled')
      await ctx.db.patch(attempt._id, { state: 'cancelled', updatedAt: now })
      await ctx.db.patch(run._id, {
        state: 'cancelled',
        currentPosition: attempt.position,
        updatedAt: now,
      })
    } else if (state === 'rejected') {
      await resolveCancellationCommand(ctx, run.runRef, 'rejected')
      if (attempt.state === 'succeeded' && attempt.position < run.totalSteps) {
        const advanced = await queueNextStep(ctx, run, attempt.position + 1, now)
        if (!advanced) await markUnknownOutcome(ctx, run, attempt, now)
      }
    }
    const projection = await readRunProjection(ctx, run.runRef)
    if (projection === null) throw new Error('customer_request_route_run_integrity_failure')
    return { kind: 'recorded' as const, run: projection }
  },
})

export const recoverExpiredDispatch = internalMutation({
  args: { dispatchRef: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('requeued') }),
    v.object({ kind: v.literal('outcome_unknown') }),
    v.object({ kind: v.literal('unchanged') }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
      .withIndex('by_dispatchRef', (query) => query.eq('dispatchRef', args.dispatchRef)).unique()
    if (recoverDispatchLeaseStillCurrent(dispatch, now) || dispatch === null) {
      return { kind: 'unchanged' as const }
    }
    if (!routeDispatchIntegrityValid(dispatch)) {
      throw new Error('customer_request_route_dispatch_integrity_failure')
    }
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', dispatch.attemptRef)).unique()
    if (!recoverDispatchAttemptAligned({ attempt, dispatch }) || attempt === null) {
      throw new Error('customer_request_route_dispatch_integrity_failure')
    }
    const kind = recoverExpiredDispatchKind({
      dispatchState: dispatch.state,
      attemptState: attempt.state,
    })
    if (kind === 'requeued') {
      await ctx.db.patch(dispatch._id, {
        state: 'pending', leaseOwner: undefined, leaseExpiresAt: undefined,
        availableAt: now, updatedAt: now,
      })
      await ctx.db.patch(attempt._id, { state: 'queued', updatedAt: now })
      await ctx.scheduler.runAfter(0, internal.customerRequestRouteTransportWorker.runNext, {
        workerId: `route-worker:recovery:${dispatch.dispatchRef}`,
      })
      return { kind: 'requeued' as const }
    }
    if (kind === 'outcome_unknown') {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', attempt.runRef)).unique()
      if (run === null) throw new Error('customer_request_route_run_integrity_failure')
      await ctx.db.patch(dispatch._id, { state: 'outcome_unknown', updatedAt: now })
      await markUnknownOutcome(ctx, run, attempt, now)
      return { kind: 'outcome_unknown' as const }
    }
    return { kind: 'unchanged' as const }
  },
})

export const markDispatched = internalMutation({
  args: { dispatchRef: v.string(), attemptRef: v.string(), workerId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('recorded') }),
    v.object({ kind: v.literal('replayed') }),
    v.object({ kind: v.literal('refused'), reason: v.literal('lease_not_current') }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
      .withIndex('by_dispatchRef', (query) => query.eq('dispatchRef', args.dispatchRef)).unique()
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef)).unique()
    if (dispatch === null || attempt === null || !routeDispatchIntegrityValid(dispatch)
      || !routeAttemptIntegrityValid(attempt) || dispatch.attemptRef !== attempt.attemptRef) {
      return { kind: 'refused' as const, reason: 'lease_not_current' as const }
    }
    if (dispatch.state === 'delivered'
      && (attempt.state === 'dispatched' || attempt.state === 'accepted'
        || attempt.state === 'succeeded' || attempt.state === 'outcome_unknown')) {
      return { kind: 'replayed' as const }
    }
    if (dispatch.state !== 'leased' || attempt.state !== 'leased'
      || dispatch.leaseOwner !== args.workerId || (dispatch.leaseExpiresAt ?? 0) <= now) {
      return { kind: 'refused' as const, reason: 'lease_not_current' as const }
    }
    if (await currentLeasedInvocation(ctx, args.dispatchRef, args.workerId, now) === null) {
      return { kind: 'refused' as const, reason: 'lease_not_current' as const }
    }
    const run = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', attempt.runRef)).unique()
    if (run === null || run.currentPosition !== attempt.position) {
      throw new Error('customer_request_route_run_integrity_failure')
    }
    await ctx.db.patch(dispatch._id, { state: 'delivered', updatedAt: now })
    await ctx.db.patch(attempt._id, { state: 'dispatched', updatedAt: now })
    await ctx.db.patch(run._id, { state: 'running', updatedAt: now })
    return { kind: 'recorded' as const }
  },
})

export const recordNotReleased = internalMutation({
  args: {
    dispatchRef: v.string(), attemptRef: v.string(), workerId: v.string(),
    observationJson: v.string(),
  },
  returns: v.union(
    v.object({ kind: v.literal('failed'), run: runProjection }),
    v.object({ kind: v.literal('replayed'), run: runProjection }),
    v.object({ kind: v.literal('refused'), reason: v.literal('lease_not_current') }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    const observation = parseRouteTransportObservationJson(args.observationJson)
    if (observation === undefined || observation.disposition !== 'refused' || observation.releaseStarted) {
      return { kind: 'refused' as const, reason: 'lease_not_current' as const }
    }
    const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
      .withIndex('by_dispatchRef', (query) => query.eq('dispatchRef', args.dispatchRef)).unique()
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef)).unique()
    if (dispatch === null || attempt === null || dispatch.attemptRef !== attempt.attemptRef
      || dispatch.leaseOwner !== args.workerId || !routeDispatchIntegrityValid(dispatch)
      || !routeAttemptIntegrityValid(attempt)) {
      return { kind: 'refused' as const, reason: 'lease_not_current' as const }
    }
    const run = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', attempt.runRef)).unique()
    if (run === null) throw new Error('customer_request_route_run_integrity_failure')
    if (attempt.state === 'failed' && dispatch.state === 'failed') {
      const replayed = await readRunProjection(ctx, run.runRef)
      if (replayed === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'replayed' as const, run: replayed }
    }
    if (dispatch.state !== 'leased' || attempt.state !== 'leased'
      || (dispatch.leaseExpiresAt ?? 0) <= now) {
      return { kind: 'refused' as const, reason: 'lease_not_current' as const }
    }
    const result: JsonValue = { reason: observation.failureCode ?? 'transport_not_released' }
    await ctx.db.patch(dispatch._id, { state: 'failed', updatedAt: now })
    await ctx.db.patch(attempt._id, {
      state: 'failed', transportObservationJson: args.observationJson,
      transportObservationDigest: canonicalDigest(observation), updatedAt: now,
    })
    await ctx.db.patch(run._id, {
      state: 'failed', resultJson: JSON.stringify(result), resultDigest: canonicalDigest(result), updatedAt: now,
    })
    const failed = await readRunProjection(ctx, run.runRef)
    if (failed === null) throw new Error('customer_request_route_run_integrity_failure')
    return { kind: 'failed' as const, run: failed }
  },
})

export const markAccepted = internalMutation({
  args: { attemptRef: v.string(), operationKeyDigest: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('recorded') }),
    v.object({ kind: v.literal('replayed') }),
    v.object({ kind: v.literal('refused'), reason: v.literal('attempt_not_current') }),
  ),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef)).unique()
    if (attempt === null || attempt.operationKeyDigest !== args.operationKeyDigest) {
      return { kind: 'refused' as const, reason: 'attempt_not_current' as const }
    }
    if (attempt.state === 'accepted' || attempt.state === 'succeeded') return { kind: 'replayed' as const }
    if (attempt.state !== 'dispatched') {
      return { kind: 'refused' as const, reason: 'attempt_not_current' as const }
    }
    await ctx.db.patch(attempt._id, { state: 'accepted', updatedAt: Date.now() })
    return { kind: 'recorded' as const }
  },
})

const outcomeResult = v.union(
  v.object({ kind: v.literal('advanced'), run: runProjection }),
  v.object({ kind: v.literal('cancelled'), run: runProjection }),
  v.object({ kind: v.literal('completed'), run: runProjection }),
  v.object({ kind: v.literal('failed'), run: runProjection }),
  v.object({ kind: v.literal('outcome_unknown'), run: runProjection }),
  v.object({ kind: v.literal('replayed'), run: runProjection }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(v.literal('attempt_not_current'), v.literal('output_invalid')),
  }),
)

export const recordOutcome = internalMutation({
  args: {
    attemptRef: v.string(),
    operationKeyDigest: v.string(),
    observationJson: v.optional(v.string()),
    outcome: v.union(
      v.object({ kind: v.literal('succeeded'), outputJson: v.string() }),
      v.object({ kind: v.literal('partial'), outputJson: v.string() }),
      v.object({ kind: v.literal('failed') }),
      v.object({ kind: v.literal('unknown') }),
    ),
  },
  returns: outcomeResult,
  handler: async (ctx, args): Promise<Infer<typeof outcomeResult>> => (
    await recordOutcomeMachine(args, journalMutationPorts(ctx)) as Infer<typeof outcomeResult>
  ),
})

export const getCurrent = internalQuery({
  args: { requestId: v.string() },
  returns: v.union(v.object({ kind: v.literal('found'), run: runProjection }), v.object({ kind: v.literal('none') })),
  handler: async (ctx, args) => {
    const head = await ctx.db.query('customerRequestRouteRunHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head === null) return { kind: 'none' as const }
    const storedRun = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', head.currentRunRef)).unique()
    if (storedRun === null || storedRun.mandateRef !== head.currentMandateRef
      || storedRun.principalId !== head.principalId) {
      throw new Error('customer_request_route_run_head_integrity_failure')
    }
    const run = await readRunProjection(ctx, head.currentRunRef)
    if (run === null) throw new Error('customer_request_route_run_integrity_failure')
    return { kind: 'found' as const, run }
  },
})

const problemCategory = v.union(
  v.literal('incorrect_result'), v.literal('unexpected_cost'), v.literal('privacy_concern'),
  v.literal('duplicate_charge_or_effect'), v.literal('could_not_stop'), v.literal('other'),
)

export const reportProblem = internalMutation({
  args: {
    requestId: v.string(), principalId: v.string(), idempotencyKey: v.string(),
    category: problemCategory, summary: v.string(),
    affectedStep: v.optional(v.number()),
    evidenceReceiptRefs: v.array(v.string()),
    visibility: v.union(
      v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
    ),
  },
  returns: v.union(
    v.object({
      kind: v.literal('reported'), reportRef: v.string(), reportedAt: v.number(),
      affected: v.object({
        step: v.number(), attemptRef: v.optional(v.string()), business: v.optional(v.string()),
      }),
      visibility: v.union(
        v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
      ),
      evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    }),
    v.object({
      kind: v.literal('replayed'), reportRef: v.string(), reportedAt: v.number(),
      affected: v.object({
        step: v.number(), attemptRef: v.optional(v.string()), business: v.optional(v.string()),
      }),
      visibility: v.union(
        v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
      ),
      evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    }),
    v.object({ kind: v.literal('conflict') }),
    v.object({
      kind: v.literal('refused'),
      reason: v.union(v.literal('request_not_found'), v.literal('evidence_not_found')),
    }),
  ),
  handler: async (ctx, args) => {
    const head = await ctx.db.query('customerRequestRouteRunHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head === null || head.principalId !== args.principalId
      || args.idempotencyKey.trim().length === 0 || args.summary.trim().length === 0 || args.summary.length > 1_000) {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const commandKey = `route-problem:v1:${canonicalDigest({
      principalId: args.principalId, requestId: args.requestId, idempotencyKey: args.idempotencyKey,
    })}`
    const prior = await ctx.db.query('customerRequestRouteProblemReports')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (prior !== null) {
      const decision = decideCustomerProblemReport({ args, head, prior, now: Date.now() })
      if (decision.kind === 'reported' || decision.kind === 'replayed') {
        return {
          kind: decision.kind,
          reportRef: decision.reportRef,
          reportedAt: decision.reportedAt,
          affected: {
            step: decision.affected.step,
            ...(decision.affected.attemptRef === undefined
              ? {}
              : { attemptRef: decision.affected.attemptRef }),
            ...(decision.affected.business === undefined
              ? {}
              : { business: decision.affected.business }),
          },
          visibility: decision.visibility,
          evidence: decision.evidence.map((item) => ({
            receiptRef: item.receiptRef,
            label: item.label,
          })),
        }
      }
      if (decision.kind === 'conflict' || decision.kind === 'refused') {
        return decision
      }
      throw new Error('customer_request_route_problem_integrity_failure')
    }
    const run = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', head.currentRunRef)).unique()
    if (run === null || run.principalId !== args.principalId) {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const affectedStep = args.affectedStep ?? run.currentPosition
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_runRef_and_position', (query) => (
        query.eq('runRef', run.runRef).eq('position', affectedStep)
      )).unique()
    if (attempt === null || !routeAttemptIntegrityValid(attempt)) {
      return { kind: 'refused' as const, reason: 'evidence_not_found' as const }
    }
    const decision = decideCustomerProblemReport({
      args, head, prior: null, run, attempt, now: Date.now(),
    })
    if (decision.kind === 'append') {
      const { businessName, evidenceReceiptRefs, ...record } = decision.record
      await ctx.db.insert('customerRequestRouteProblemReports', {
        ...record,
        evidenceReceiptRefs: [...evidenceReceiptRefs],
        ...(businessName === undefined ? {} : { businessName }),
      })
      return {
        kind: decision.result.kind,
        reportRef: decision.result.reportRef,
        reportedAt: decision.result.reportedAt,
        affected: {
          step: decision.result.affected.step,
          ...(decision.result.affected.attemptRef === undefined
            ? {}
            : { attemptRef: decision.result.affected.attemptRef }),
          ...(decision.result.affected.business === undefined
            ? {}
            : { business: decision.result.affected.business }),
        },
        visibility: decision.result.visibility,
        evidence: decision.result.evidence.map((item) => ({
          receiptRef: item.receiptRef,
          label: item.label,
        })),
      }
    }
    if (decision.kind === 'conflict' || decision.kind === 'refused') {
      return decision
    }
    throw new Error('customer_request_route_problem_integrity_failure')
  },
})

const businessCausalityPosition = v.union(
  v.literal('supports'),
  v.literal('disputes'),
  v.literal('uncertain'),
)

const businessProblemReportResult = v.union(
  v.object({
    kind: v.union(v.literal('recorded'), v.literal('replayed')),
    statementRef: v.string(),
    reportRef: v.string(),
    business: v.string(),
    causalityPosition: businessCausalityPosition,
    statement: v.string(),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    recordedAt: v.number(),
  }),
  v.object({ kind: v.literal('conflict') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('authority_denied'),
      v.literal('report_not_found'),
      v.literal('sharing_not_authorized'),
      v.literal('evidence_not_found'),
      v.literal('invalid_report'),
    ),
  }),
)

const businessProblemViewResult = v.union(
  v.object({
    kind: v.literal('business_problem'),
    reportRef: v.string(),
    business: v.string(),
    category: v.union(
      v.literal('incorrect_result'),
      v.literal('unexpected_cost'),
      v.literal('duplicate_charge_or_effect'),
      v.literal('privacy_concern'),
      v.literal('could_not_stop'),
      v.literal('other'),
    ),
    customerStatement: v.string(),
    causality: v.literal('unknown'),
    resolution: v.literal('not_adjudicated'),
    decisionAuthority: v.literal('not_assigned'),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    availableEvidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    businessClaims: v.array(v.object({
      statementRef: v.string(),
      causalityPosition: businessCausalityPosition,
      statement: v.string(),
      evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
      recordedAt: v.number(),
    })),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('authority_denied'),
      v.literal('report_not_found'),
      v.literal('sharing_not_authorized'),
    ),
  }),
)

export const readProblemForBusiness = internalQuery({
  args: { reportRef: v.string() },
  returns: businessProblemViewResult,
  handler: async (ctx, args): Promise<Infer<typeof businessProblemViewResult>> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused', reason: 'authentication_required' }
    if (args.reportRef.trim().length === 0 || args.reportRef.length > 300) {
      return { kind: 'refused', reason: 'report_not_found' }
    }
    const report = await ctx.db.query('customerRequestRouteProblemReports')
      .withIndex('by_reportRef', (query) => query.eq('reportRef', args.reportRef)).unique()
    if (report === null || report.attemptRef === undefined) {
      return { kind: 'refused', reason: 'report_not_found' }
    }
    if ((report.visibility ?? 'customer_and_ae_only') !== 'share_with_affected_business') {
      return { kind: 'refused', reason: 'sharing_not_authorized' }
    }
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', report.attemptRef!)).unique()
    if (attempt === null || attempt.requestId !== report.requestId || attempt.position !== report.step
      || !routeAttemptIntegrityValid(attempt)) {
      throw new Error('customer_request_route_problem_attempt_integrity_failure')
    }
    const business = await ctx.db.get(attempt.grant.step.businessId as Id<'businesses'>)
    const owner = business === null ? null : await ctx.db.get(business.ownerId)
    if (business === null || owner === null || owner.clerkUserId !== identity.subject) {
      return { kind: 'refused', reason: 'authority_denied' }
    }
    const businessReports = await loadProblemBusinessReports(evidenceLoadPorts(ctx), report.reportRef)
    const projected = projectBusinessProblem({
      report,
      attempt,
      businessName: business.name,
      businessId: String(business._id),
      businessReports,
    })
    return {
      ...projected,
      evidence: projected.evidence.map((item) => ({
        receiptRef: item.receiptRef,
        label: item.label,
      })),
      availableEvidence: projected.availableEvidence.map((item) => ({
        receiptRef: item.receiptRef,
        label: item.label,
      })),
      businessClaims: projected.businessClaims.map((claim) => ({
        ...claim,
        evidence: claim.evidence.map((item) => ({
          receiptRef: item.receiptRef,
          label: item.label,
        })),
      })),
    }
  },
})

export const recordProblemBusinessReport = internalMutation({
  args: {
    reportRef: v.string(),
    idempotencyKey: v.string(),
    causalityPosition: businessCausalityPosition,
    statement: v.string(),
    evidenceReceiptRefs: v.array(v.string()),
  },
  returns: businessProblemReportResult,
  handler: async (ctx, args): Promise<Infer<typeof businessProblemReportResult>> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused', reason: 'authentication_required' }
    const report = await ctx.db.query('customerRequestRouteProblemReports')
      .withIndex('by_reportRef', (query) => query.eq('reportRef', args.reportRef)).unique()
    if (report === null || report.attemptRef === undefined) {
      return { kind: 'refused', reason: 'report_not_found' }
    }
    if ((report.visibility ?? 'customer_and_ae_only') !== 'share_with_affected_business') {
      return { kind: 'refused', reason: 'sharing_not_authorized' }
    }
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', report.attemptRef!)).unique()
    if (attempt === null || attempt.requestId !== report.requestId || attempt.position !== report.step
      || !routeAttemptIntegrityValid(attempt)) {
      throw new Error('customer_request_route_problem_attempt_integrity_failure')
    }
    const business = await ctx.db.get(attempt.grant.step.businessId as Id<'businesses'>)
    const owner = business === null ? null : await ctx.db.get(business.ownerId)
    if (business === null || owner === null || owner.clerkUserId !== identity.subject) {
      return { kind: 'refused', reason: 'authority_denied' }
    }
    const commandKey = `route-problem-business-report:v1:${canonicalDigest({
      reportRef: args.reportRef,
      businessId: String(business._id),
      idempotencyKey: args.idempotencyKey,
    })}`
    const prior = await ctx.db.query('customerRequestRouteProblemBusinessReports')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    const decision = decideBusinessProblemClaim({
      args,
      report,
      attempt,
      business: { id: String(business._id), name: business.name },
      actorRef: identity.tokenIdentifier,
      prior,
      now: Date.now(),
    })
    if (decision.kind === 'append') {
      await ctx.db.insert('customerRequestRouteProblemBusinessReports', {
        ...decision.record,
        evidenceReceiptRefs: [...decision.record.evidenceReceiptRefs],
      })
      return {
        ...decision.result,
        evidence: decision.result.evidence.map((item) => ({
          receiptRef: item.receiptRef,
          label: item.label,
        })),
      }
    }
    if (decision.kind === 'recorded' || decision.kind === 'replayed') {
      return {
        ...decision,
        evidence: decision.evidence.map((item) => ({
          receiptRef: item.receiptRef,
          label: item.label,
        })),
      }
    }
    if (decision.kind === 'conflict' || decision.kind === 'refused') {
      return decision
    }
    throw new Error('customer_request_route_problem_business_report_integrity_failure')
  },
})

const problemUpdateState = v.union(
  v.literal('investigating'),
  v.literal('waiting_for_customer'),
  v.literal('closed'),
)

const problemUpdateResult = v.union(
  v.object({
    kind: v.literal('updated'),
    reportRef: v.string(),
    version: v.number(),
    state: problemUpdateState,
    recordedAt: v.number(),
  }),
  v.object({ kind: v.literal('conflict'), reason: v.union(
    v.literal('idempotency_key_reused'),
    v.literal('stale_version'),
  ) }),
  v.object({ kind: v.literal('refused'), reason: v.union(
    v.literal('authentication_required'),
    v.literal('authority_denied'),
    v.literal('report_not_found'),
    v.literal('invalid_update'),
  ) }),
)

export const updateProblemStatus = internalMutation({
  args: {
    reportRef: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
    state: problemUpdateState,
    publicMessage: v.string(),
  },
  returns: problemUpdateResult,
  handler: async (ctx, args): Promise<Infer<typeof problemUpdateResult>> => {
    const authority = await resolveAdminAuthority(
      { db: runtimeDb(ctx.db), auth: ctx.auth },
      'annotate_triage',
    )
    if (authority.kind === 'denied') {
      return {
        kind: 'refused',
        reason: authority.reason === 'missing_membership'
          ? 'authentication_required'
          : 'authority_denied',
      }
    }
    const report = await ctx.db.query('customerRequestRouteProblemReports')
      .withIndex('by_reportRef', (query) => query.eq('reportRef', args.reportRef)).unique()
    if (report === null) return { kind: 'refused', reason: 'report_not_found' }
    const commandKey = `route-problem-update:v1:${canonicalDigest({
      reportRef: args.reportRef,
      actorRef: authority.membership.clerkUserId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const prior = await ctx.db.query('customerRequestRouteProblemUpdates')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (prior !== null) {
      const decision = decideSupportProblemStatus({
        args,
        actorRef: authority.membership.clerkUserId,
        updates: [],
        prior,
        now: Date.now(),
      })
      if (decision.kind === 'append') {
        throw new Error('customer_request_route_problem_update_integrity_failure')
      }
      return decision
    }
    const updates = await loadProblemUpdates(evidenceLoadPorts(ctx), args.reportRef)
    const decision = decideSupportProblemStatus({
      args,
      actorRef: authority.membership.clerkUserId,
      updates,
      prior: null,
      now: Date.now(),
    })
    if (decision.kind === 'append') {
      await ctx.db.insert('customerRequestRouteProblemUpdates', { ...decision.record })
      return decision.result
    }
    return decision
  },
})

export const replyProblem = internalMutation({
  args: {
    requestId: v.string(),
    reportRef: v.string(),
    principalId: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
    message: v.string(),
  },
  returns: problemUpdateResult,
  handler: async (ctx, args): Promise<Infer<typeof problemUpdateResult>> => {
    const report = await ctx.db.query('customerRequestRouteProblemReports')
      .withIndex('by_reportRef', (query) => query.eq('reportRef', args.reportRef)).unique()
    if (report === null || report.requestId !== args.requestId || report.principalId !== args.principalId) {
      return { kind: 'refused', reason: 'report_not_found' }
    }
    const commandKey = `route-problem-reply:v1:${canonicalDigest({
      reportRef: args.reportRef,
      principalId: args.principalId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const prior = await ctx.db.query('customerRequestRouteProblemUpdates')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (prior !== null) {
      const decision = decideCustomerProblemReply({
        args,
        updates: [],
        prior,
        now: Date.now(),
      })
      if (decision.kind === 'append') {
        throw new Error('customer_request_route_problem_update_integrity_failure')
      }
      return decision
    }
    const updates = await loadProblemUpdates(evidenceLoadPorts(ctx), args.reportRef)
    const decision = decideCustomerProblemReply({
      args,
      updates,
      prior: null,
      now: Date.now(),
    })
    if (decision.kind === 'append') {
      await ctx.db.insert('customerRequestRouteProblemUpdates', { ...decision.record })
      return decision.result
    }
    return decision
  },
})

export const listProblemsForSupport = internalQuery({
  args: { limit: v.number() },
  returns: v.union(
    v.object({
      kind: v.literal('allowed'),
      rows: v.array(v.object({
        reportRef: v.string(),
        requestRef: v.string(),
        version: v.number(),
        state: v.union(
          v.literal('received'),
          v.literal('update_due'),
          v.literal('investigating'),
          v.literal('waiting_for_customer'),
          v.literal('closed'),
        ),
        nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
        category: problemCategory,
        summary: v.string(),
        business: v.optional(v.string()),
        reportedAt: v.number(),
        lastUpdatedAt: v.number(),
      })),
    }),
    v.object({
      kind: v.literal('denied'),
      reason: v.union(
        v.literal('missing_membership'),
        v.literal('inactive_membership'),
        v.literal('action_not_allowed'),
      ),
      rows: v.array(v.any()),
    }),
  ),
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: runtimeDb(ctx.db), auth: ctx.auth },
      'read_admin_readbacks',
    )
    if (authority.kind === 'denied') {
      return { kind: 'denied' as const, reason: authority.reason, rows: [] }
    }
    const limit = Number.isSafeInteger(args.limit) ? Math.min(Math.max(args.limit, 1), 100) : 50
    return {
      kind: 'allowed' as const,
      rows: await assembleSupportProblemList({ limit }, evidenceLoadPorts(ctx)),
    }
  },
})

const supportProblemExport = v.object({
  kind: v.literal('problem_export'),
  reportRef: v.string(),
  requestRef: v.string(),
  version: v.number(),
  state: v.union(
    v.literal('received'),
    v.literal('update_due'),
    v.literal('investigating'),
    v.literal('waiting_for_customer'),
    v.literal('closed'),
  ),
  category: problemCategory,
  summary: v.string(),
  claimSource: v.literal('customer'),
  causality: v.literal('unknown'),
  resolution: v.literal('not_adjudicated'),
  nextAction: v.union(
    v.literal('await_status_update'),
    v.literal('check_status'),
    v.literal('provide_information'),
    v.literal('none'),
  ),
  nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
  nextUpdateDueAt: v.optional(v.number()),
  decisionAuthority: v.literal('not_assigned'),
  visibility: v.union(
    v.literal('customer_and_ae_only'),
    v.literal('share_with_affected_business'),
  ),
  evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
  reportedAt: v.number(),
  affected: v.object({ step: v.number(), business: v.optional(v.string()) }),
  claims: v.array(v.object({
    claimSource: v.union(v.literal('customer'), v.literal('business')),
    causalityPosition: v.union(
      v.literal('reported_problem'),
      v.literal('supports'),
      v.literal('disputes'),
      v.literal('uncertain'),
    ),
    statement: v.string(),
    business: v.optional(v.string()),
    evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
    recordedAt: v.number(),
  })),
  history: v.array(v.object({
    version: v.number(),
    state: v.union(
      v.literal('received'),
      v.literal('investigating'),
      v.literal('waiting_for_customer'),
      v.literal('closed'),
    ),
    source: v.union(v.literal('customer'), v.literal('ae_support')),
    message: v.string(),
    recordedAt: v.number(),
  })),
  reconstruction: v.optional(v.object({
    request: v.object({ revision: v.number(), ordinaryRequest: v.string() }),
    choice: v.object({
      businesses: v.array(v.string()), selectedBecause: v.array(v.string()),
      confirmedAt: v.number(), validUntil: v.number(),
    }),
    authority: v.object({
      state: v.union(v.literal('current'), v.literal('expired'), v.literal('revoked')),
      source: v.literal('customer_confirmation'),
      spend: v.object({
        limit: v.object({ currency: v.string(), amountMinor: v.number() }),
        admitted: v.object({ currency: v.string(), amountMinor: v.number() }),
      }),
      dataSharing: v.array(v.object({
        classification: v.union(
          v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential'),
        ),
        recipient: v.string(), purposes: v.array(v.string()),
        releaseState: v.union(v.literal('authorized'), v.literal('business_step_released')),
      })),
      effects: v.array(v.object({
        class: v.union(
          v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change'),
        ),
        reversibility: v.union(
          v.literal('not_applicable'), v.literal('reversible'),
          v.literal('conditional'), v.literal('irreversible'),
        ),
        releaseState: v.union(v.literal('authorized'), v.literal('business_step_released')),
      })),
    }),
    execution: v.object({
      state: v.union(
        v.literal('queued'), v.literal('running'), v.literal('outcome_unknown'),
        v.literal('completed'), v.literal('failed'), v.literal('cancelled'),
      ),
      completedSteps: v.number(), totalSteps: v.number(),
      duplicateRisk: v.union(
        v.literal('protected_by_required_idempotency'), v.literal('mixed_or_not_applicable'),
      ),
      steps: v.array(v.object({
        step: v.number(), business: v.string(),
        state: v.union(
          v.literal('blocked'), v.literal('queued'), v.literal('ready_to_contact'), v.literal('contacting'),
          v.literal('awaiting_result'), v.literal('completed'), v.literal('failed'),
          v.literal('outcome_unknown'), v.literal('cancelled'),
        ),
        evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
      })),
    }),
    recovery: v.object({
      nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
      nextAction: v.union(
        v.literal('await_status_update'), v.literal('check_status'),
        v.literal('provide_information'), v.literal('none'),
      ),
      retry: v.union(
        v.literal('not_needed'), v.literal('safe'), v.literal('blocked_until_reconciled'),
      ),
    }),
  })),
})

export const exportProblemForSupport = internalQuery({
  args: { reportRef: v.string() },
  returns: v.union(
    supportProblemExport,
    v.object({ kind: v.literal('not_found') }),
    v.object({
      kind: v.literal('denied'),
      reason: v.union(
        v.literal('missing_membership'),
        v.literal('inactive_membership'),
        v.literal('action_not_allowed'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: runtimeDb(ctx.db), auth: ctx.auth },
      'read_admin_readbacks',
    )
    if (authority.kind === 'denied') {
      return { kind: 'denied' as const, reason: authority.reason }
    }
    const problem = await ctx.db.query('customerRequestRouteProblemReports')
      .withIndex('by_reportRef', (query) => query.eq('reportRef', args.reportRef)).unique()
    if (problem === null) return { kind: 'not_found' as const }
    const ports = evidenceLoadPorts(ctx)
    const [updates, businessReports, attempt, requestRevisions, mandateIssue, run, revocation,
      reservations, attempts] = await Promise.all([
      loadProblemUpdates(ports, problem.reportRef),
      loadProblemBusinessReports(ports, problem.reportRef),
      problem.attemptRef === undefined
        ? null
        : ctx.db.query('customerRequestRouteStepAttempts')
          .withIndex('by_attemptRef', (query) => query.eq('attemptRef', problem.attemptRef!)).unique(),
      ctx.db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => (
          query.eq('requestId', problem.requestId)
        )).collect(),
      problem.mandateRef === undefined
        ? null
        : ctx.db.query('customerRequestRouteMandateIssues')
          .withIndex('by_mandateRef', (query) => query.eq('mandateRef', problem.mandateRef!)).unique(),
      ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', problem.runRef)).unique(),
      problem.mandateRef === undefined
        ? null
        : ctx.db.query('customerRequestRouteMandateRevocations')
          .withIndex('by_mandateRef', (query) => query.eq('mandateRef', problem.mandateRef!)).first(),
      problem.mandateRef === undefined
        ? []
        : ctx.db.query('customerRequestRouteStepReservations')
          .withIndex('by_mandateRef_and_recordedAt', (query) => query.eq('mandateRef', problem.mandateRef!))
          .collect(),
      ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_runRef_and_position', (query) => query.eq('runRef', problem.runRef))
        .collect(),
    ])
    if (attempt !== null && !routeAttemptIntegrityValid(attempt)) {
      throw new Error('customer_request_route_problem_attempt_integrity_failure')
    }
    const requestRevision = mandateIssue === null
      ? undefined
      : requestRevisions.find((revision) => (
          revision.requestRevision === mandateIssue.mandate.request.requestRevision
        ))
    if (run === null) {
      throw new Error('customer_request_route_problem_reconstruction_integrity_failure')
    }
    const businessNames = new Map<string, string>()
    if (problem.mandateRef !== undefined && mandateIssue !== null) {
      for (const step of mandateIssue.mandate.route.steps) {
        const business = await ctx.db.get(step.businessId as Id<'businesses'>)
        if (business === null) throw new Error('customer_request_route_problem_business_integrity_failure')
        businessNames.set(step.businessId, business.name)
      }
    }
    const observedAt = Date.now()
    return projectSupportProblemExport({
      problem,
      updates,
      businessReports,
      attempt,
      requestRevision,
      mandateIssue,
      run,
      revocation,
      reservations,
      attempts,
      businessNames,
      observedAt,
    })
  },
})

const exportedStepState = v.union(
  v.literal('queued'), v.literal('ready_to_contact'), v.literal('contacting'), v.literal('awaiting_result'), v.literal('completed'),
  v.literal('failed'), v.literal('outcome_unknown'), v.literal('cancelled'),
)

export const exportCustomerEvidence = internalQuery({
  args: { requestId: v.string(), principalId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('none') }),
    v.object({
      kind: v.literal('found'),
      state: v.union(
        v.literal('queued'), v.literal('running'), v.literal('outcome_unknown'),
        v.literal('completed'), v.literal('failed'), v.literal('cancelled'),
      ),
      generatedAt: v.number(), resultJson: v.optional(v.string()),
      steps: v.array(v.object({
        step: v.number(), state: exportedStepState, observedAt: v.number(),
        business: v.string(), providerOrigin: v.string(), outputDigest: v.optional(v.string()),
        evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
      })),
      problems: v.array(v.object({
        reportRef: v.string(),
        version: v.number(),
        state: v.union(
          v.literal('received'),
          v.literal('update_due'),
          v.literal('investigating'),
          v.literal('waiting_for_customer'),
          v.literal('closed'),
        ),
        category: problemCategory, summary: v.string(), claimSource: v.literal('customer'),
        causality: v.literal('unknown'), resolution: v.literal('not_adjudicated'),
        nextAction: v.union(
          v.literal('await_status_update'),
          v.literal('check_status'),
          v.literal('provide_information'),
          v.literal('none'),
        ),
        nextActor: v.union(v.literal('ae'), v.literal('customer'), v.literal('none')),
        nextUpdateDueAt: v.optional(v.number()),
        decisionAuthority: v.literal('not_assigned'), reportedAt: v.number(),
        visibility: v.union(
          v.literal('customer_and_ae_only'), v.literal('share_with_affected_business'),
        ),
        evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
        affected: v.object({
          step: v.number(), attemptRef: v.optional(v.string()), business: v.optional(v.string()),
        }),
        claims: v.array(v.object({
          claimSource: v.union(v.literal('customer'), v.literal('business')),
          causalityPosition: v.union(
            v.literal('reported_problem'),
            v.literal('supports'),
            v.literal('disputes'),
            v.literal('uncertain'),
          ),
          statement: v.string(),
          business: v.optional(v.string()),
          evidence: v.array(v.object({ receiptRef: v.string(), label: v.string() })),
          recordedAt: v.number(),
        })),
        history: v.array(v.object({
          version: v.number(),
          state: v.union(
            v.literal('received'),
            v.literal('investigating'),
            v.literal('waiting_for_customer'),
            v.literal('closed'),
          ),
          source: v.union(v.literal('customer'), v.literal('ae_support')),
          message: v.string(),
          recordedAt: v.number(),
        })),
      })),
    }),
  ),
  handler: async (ctx, args) => await assembleCustomerEvidenceExport(args, evidenceLoadPorts(ctx)),
})

async function resolveCancellationCommand(
  ctx: MutationCtx,
  runRef: string,
  result: 'cancelled' | 'rejected',
): Promise<void> {
  const command = await ctx.db.query('customerRequestRouteCancellationCommands')
    .withIndex('by_runRef_and_committedAt', (query) => query.eq('runRef', runRef))
    .order('desc')
    .first()
  if (command === null || command.result !== 'pending') {
    throw new Error('customer_request_route_cancellation_command_integrity_failure')
  }
  await ctx.db.patch(command._id, { result })
}

function parseBoundedJson(value: string): JsonValue | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

async function currentLeasedInvocation(
  ctx: QueryCtx | MutationCtx,
  dispatchRef: string,
  workerId: string,
  now: number,
): Promise<Infer<typeof leasedInvocation> | null> {
  const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
    .withIndex('by_dispatchRef', (query) => query.eq('dispatchRef', dispatchRef)).unique()
  if (dispatch === null || dispatch.state !== 'leased' || dispatch.leaseOwner !== workerId
    || (dispatch.leaseExpiresAt ?? 0) <= now || !routeDispatchIntegrityValid(dispatch)) return null
  const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', dispatch.attemptRef)).unique()
  if (attempt === null || attempt.state !== 'leased' || attempt.runRef !== dispatch.runRef
    || attempt.operationKeyDigest !== dispatch.operationKeyDigest || !routeAttemptIntegrityValid(attempt)
    || attempt.grant.grantRef !== `route-step-grant:v1:${attempt.grant.grantDigest}`
    || routeStepGrantDigest(attempt.grant) !== attempt.grant.grantDigest
    || attempt.grant.expiresAt <= now) return null
  const mandate = await readCurrentRouteMandateStateForPrincipal(
    ctx, attempt.requestId, attempt.grant.principalId, now, { requireCurrentGraph: false },
  )
  if (mandate.kind !== 'active' || mandate.mandate.mandateRef !== attempt.grant.mandateRef
    || mandate.mandate.mandateDigest !== attempt.grant.mandateDigest) return null
  const supply = await getEligibleExactCapabilitySupply(ctx.db, {
    networkId: mandate.networkId,
    businessId: attempt.grant.step.businessId,
    offeringId: attempt.grant.step.offeringId,
    bindingId: attempt.grant.step.bindingId,
    contractRef: attempt.grant.step.contractRef,
    expectedOfferingRegistrationHash: attempt.grant.step.offeringRegistrationHash,
    expectedBindingRegistrationHash: attempt.grant.step.bindingRegistrationHash,
  })
  if (supply.kind !== 'available') return null
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', attempt.grant.step.publicationRef)
        .eq('revision', attempt.grant.step.publicationRevision)
    )).unique()
  if (publication === null || publication.disposition !== 'current'
    || String(publication.businessId) !== attempt.grant.step.businessId
    || publication.networkId !== mandate.networkId
    || publication.offeringId !== attempt.grant.step.offeringId
    || publication.bindingId !== attempt.grant.step.bindingId
    || publication.capabilityId !== attempt.grant.step.contractRef.capabilityId
    || publication.version !== attempt.grant.step.contractRef.version
    || publication.contractDigest !== attempt.grant.step.contractRef.contractDigest
    || publication.credentialState !== 'ready' || publication.healthState !== 'healthy'
    || publication.readinessObservedAt === undefined || publication.readinessObservedAt > now
    || publication.readinessValidUntil === undefined
    || publication.readinessValidUntil < now) return null
  return {
    dispatchRef: dispatch.dispatchRef,
    attemptRef: attempt.attemptRef,
    runRef: attempt.runRef,
    operationKeyDigest: attempt.operationKeyDigest,
    inputJson: attempt.inputJson,
    inputDigest: attempt.inputDigest,
    binding: {
      adapterId: supply.binding.adapterId,
      endpointUrl: supply.binding.endpointUrl,
      credentialRef: supply.binding.credentialRef,
      configJson: supply.binding.configJson,
      configDigest: supply.binding.configDigest,
    },
    authority: {
      mandateDigest: attempt.grant.mandateDigest,
      grantDigest: attempt.grant.grantDigest,
      capabilityContractDigest: attempt.grant.step.contractRef.contractDigest,
      maximumSpend: { ...attempt.grant.step.maximumSpend },
      expiresAt: attempt.grant.expiresAt,
    },
  }
}

