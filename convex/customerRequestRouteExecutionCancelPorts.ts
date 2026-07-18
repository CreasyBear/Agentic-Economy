import type {
  AttemptRecordSnapshot,
  CancelMutationPorts,
  CancelOpenPorts,
  CancelResult,
  CancelSupplyLoadResult,
  CancellationAttemptSnapshot,
  DispatchRecordSnapshot,
  PriorCancelCommand,
  RunRecordSnapshot,
} from '@/modules/customer-request/route-execution/machines'
import { cancelReplayKind } from '@/modules/customer-request/route-execution/journal'
import type { RouteStepGrant } from '@/modules/customer-request/route-mandate-admission'

import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { getEligibleExactCapabilitySupply } from './capabilitySupply'
import {
  markUnknownOutcome,
  queueNextStep,
  readRunProjection,
} from './customerRequestRouteExecutionJournalPorts'
import { readCurrentRouteMandateStateForPrincipal } from './customerRequestRouteMandate'

export function cancelMutationPorts(ctx: MutationCtx): CancelMutationPorts {
  return {
    ...cancelOpenPorts(ctx),

    loadPriorCancelCommand: async (commandKey) => {
      const prior = await ctx.db.query('customerRequestRouteCancellationCommands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      return prior === null ? null : toPriorCancelCommand(prior)
    },

    loadRunProjection: async (runRef) => await readRunProjection(ctx, runRef),

    loadRunHead: async (requestId) => {
      const head = await ctx.db.query('customerRequestRouteRunHeads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      if (head === null) return null
      return {
        principalId: head.principalId,
        currentRunRef: head.currentRunRef,
        currentMandateRef: head.currentMandateRef,
      }
    },

    loadRunByRef: async (runRef) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
      return run === null ? null : toRunRecord(run)
    },

    loadAttemptAtPosition: async (runRef, position) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_runRef_and_position', (query) => (
          query.eq('runRef', runRef).eq('position', position)
        )).unique()
      return attempt === null ? null : toAttemptRecord(attempt)
    },

    loadDispatchByAttemptRef: async (attemptRef) => {
      const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
      return dispatch === null ? null : toDispatchRecord(dispatch)
    },

    commitCancelCommandReplay: async (runRef, priorResult) => {
      const replayed = await readRunProjection(ctx, runRef)
      if (replayed === null) throw new Error('customer_request_route_cancellation_integrity_failure')
      const disposition = priorResult === 'rejected' ? 'too_late' as const : priorResult
      return { kind: cancelReplayKind(disposition), run: replayed }
    },

    commitPreReleaseCancel: async (input) => {
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const outbox = await requireOutbox(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      await ctx.db.patch(attempt._id, { state: 'cancelled', updatedAt: input.now })
      await ctx.db.patch(outbox._id, { state: 'cancelled', updatedAt: input.now })
      await ctx.db.patch(run._id, { state: 'cancelled', updatedAt: input.now })
      await insertCancelCommand(ctx, input)
      return await cancelResultProjection(ctx, input.runRef, input.result)
    },

    commitPendingAdapterCancellation: async (input) => {
      const existingCancellation = await ctx.db.query('customerRequestRouteCancellationAttempts')
        .withIndex('by_runRef_and_attemptRef', (query) => (
          query.eq('runRef', input.runRef).eq('attemptRef', input.attemptRef)
        )).unique()
      if (existingCancellation === null) {
        await ctx.db.insert('customerRequestRouteCancellationAttempts', {
          cancellationRef: input.cancellationRef,
          runRef: input.runRef,
          attemptRef: input.attemptRef,
          operationKeyDigest: input.operationKeyDigest,
          state: 'pending',
          requestedAt: input.now,
          updatedAt: input.now,
        })
        await ctx.scheduler.runAfter(0, internal.customerRequestRouteCancellationWorker.run, {
          cancellationRef: input.cancellationRef,
        })
      }
      await insertCancelCommand(ctx, input)
      return await cancelResultProjection(ctx, input.runRef, input.result)
    },

    commitCancelDispositionOnly: async (input) => {
      await insertCancelCommand(ctx, input)
      return await cancelResultProjection(ctx, input.runRef, input.result)
    },

    commitCancellationObservation: async (input) => {
      const cancellation = await ctx.db.query('customerRequestRouteCancellationAttempts')
        .withIndex('by_cancellationRef', (query) => (
          query.eq('cancellationRef', input.cancellationRef)
        )).unique()
      if (cancellation === null) {
        throw new Error('customer_request_route_cancellation_integrity_failure')
      }
      await ctx.db.patch(cancellation._id, {
        state: input.state,
        requestDigest: input.observation.requestDigest,
        ...(input.observation.responseDigest === undefined
          ? {}
          : { responseDigest: input.observation.responseDigest }),
        ...(input.observation.providerReference === undefined
          ? {}
          : { providerReference: input.observation.providerReference }),
        ...(input.observation.reason === undefined ? {} : { reason: input.observation.reason }),
        ...(input.observation.failureCode === undefined
          ? {}
          : { failureCode: input.observation.failureCode }),
        resolvedAt: input.now,
        updatedAt: input.now,
      })
    },

    resolveCancellationCommand: async (runRef, result) => {
      await patchPendingCancelCommandResult(ctx, runRef, result)
    },

    commitAcceptedCancellation: async (input) => {
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      await ctx.db.patch(attempt._id, { state: 'cancelled', updatedAt: input.now })
      await ctx.db.patch(run._id, {
        state: 'cancelled',
        currentPosition: input.position,
        updatedAt: input.now,
      })
    },

    queueNextStepAfterRejectedCancel: async (runRef, position, now) => {
      const run = await requireRun(ctx, runRef)
      return await queueNextStep(ctx, run, position, now)
    },

    markUnknownAfterRejectedCancel: async (runRef, attemptRef, now) => {
      const run = await requireRun(ctx, runRef)
      const attempt = await requireAttempt(ctx, attemptRef)
      await markUnknownOutcome(ctx, run, attempt, now)
    },
  }
}

export function cancelOpenPorts(ctx: QueryCtx | MutationCtx): CancelOpenPorts {
  return {
    now: () => Date.now(),

    loadCancellationAttempt: async (cancellationRef) => {
      const cancellation = await ctx.db.query('customerRequestRouteCancellationAttempts')
        .withIndex('by_cancellationRef', (query) => query.eq('cancellationRef', cancellationRef))
        .unique()
      return cancellation === null ? null : toCancellationAttempt(cancellation)
    },

    loadAttemptByRef: async (attemptRef) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
      return attempt === null ? null : toAttemptRecord(attempt)
    },

    loadActiveMandateForCancellation: async (requestId, principalId, now) => {
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
      if (supply.kind !== 'available') return { kind: 'unavailable' } satisfies CancelSupplyLoadResult
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
  }
}

async function patchPendingCancelCommandResult(
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

async function insertCancelCommand(
  ctx: MutationCtx,
  input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    requestId: string
    runRef: string
    mode: 'current_and_downstream' | 'after_current_step'
    result: 'cancelled' | 'pending' | 'too_late'
    boundaryChangedAt: number
    now: number
  }>,
): Promise<void> {
  await ctx.db.insert('customerRequestRouteCancellationCommands', {
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    principalId: input.principalId,
    requestId: input.requestId,
    runRef: input.runRef,
    mode: input.mode,
    result: input.result,
    boundaryChangedAt: input.boundaryChangedAt,
    committedAt: input.now,
  })
}

async function cancelResultProjection(
  ctx: MutationCtx,
  runRef: string,
  result: 'cancelled' | 'pending' | 'too_late',
): Promise<CancelResult> {
  const projection = await readRunProjection(ctx, runRef)
  if (projection === null) throw new Error('customer_request_route_run_integrity_failure')
  return { kind: result, run: projection }
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

async function requireOutbox(
  ctx: MutationCtx,
  attemptRef: string,
): Promise<Doc<'customerRequestRouteDispatchOutbox'>> {
  const outbox = await ctx.db.query('customerRequestRouteDispatchOutbox')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
  if (outbox === null) throw new Error('customer_request_route_dispatch_integrity_failure')
  return outbox
}

function toPriorCancelCommand(
  prior: Doc<'customerRequestRouteCancellationCommands'>,
): PriorCancelCommand {
  return {
    commandDigest: prior.commandDigest,
    principalId: prior.principalId,
    requestId: prior.requestId,
    runRef: prior.runRef,
    ...(prior.mode === undefined ? {} : { mode: prior.mode }),
    result: prior.result,
  }
}

function toCancellationAttempt(
  cancellation: Doc<'customerRequestRouteCancellationAttempts'>,
): CancellationAttemptSnapshot {
  return {
    cancellationRef: cancellation.cancellationRef,
    runRef: cancellation.runRef,
    attemptRef: cancellation.attemptRef,
    operationKeyDigest: cancellation.operationKeyDigest,
    state: cancellation.state,
    requestedAt: cancellation.requestedAt,
    updatedAt: cancellation.updatedAt,
    ...(cancellation.resolvedAt === undefined ? {} : { resolvedAt: cancellation.resolvedAt }),
    ...(cancellation.reason === undefined ? {} : { reason: cancellation.reason }),
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
