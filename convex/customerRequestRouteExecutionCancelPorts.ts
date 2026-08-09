import type {
  CancelMutationPorts,
  CancelOpenPorts,
  CancelResult,
  CancellationAttemptSnapshot,
  PriorCancelCommand,
} from '@/modules/customer-request/route-execution/machines'
import type { RouteMandate } from '@/modules/customer-request/route-mandate'
import { cancelReplayKind } from '@/modules/customer-request/route-execution/journal'
import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  markUnknownOutcome,
  queueNextStep,
  readRunProjection,
} from './customerRequestRouteExecutionJournalPorts'
import { loadEligibleRouteSupply } from './customerRequestRouteExecutionOpenPorts'
import { readCurrentRouteMandateStateForPrincipal } from './customerRequestRouteMandate'
import {
  requireAttempt,
  requireDispatchByAttempt,
  requireRun,
  toAttemptRecord,
  toDispatchRecord,
  toRunRecord,
} from './customerRequestRouteExecutionSnapshots'
import { customerRequestRouteWorkpool } from './customerRequestRouteWorkpool'

type CancellationMandateLoad = Readonly<
  | {
      kind: 'active'
      mandateRef: string
      mandateDigest: string
      networkId: string
      mandate: RouteMandate
    }
  | { kind: 'missing' }
>

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
      const outbox = await requireDispatchByAttempt(ctx, input.attemptRef)
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
        await customerRequestRouteWorkpool.enqueueAction(
          ctx,
          internal.customerRequestRouteCancellationWorker.run,
          { cancellationRef: input.cancellationRef },
          {
            retry: false,
            onComplete: internal.customerRequestRouteExecution.completeRouteCancellationWork,
            context: { cancellationRef: input.cancellationRef },
          },
        )
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
  const now = Date.now()
  return {
    now: () => now,
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

    loadRunByRef: async (runRef) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
      return run === null ? null : toRunRecord(run)
    },

    loadActiveMandateForCancellation: async (requestId, principalId, now) => {
      const current = await readCurrentRouteMandateStateForPrincipal(
        ctx, requestId, principalId, now, { requireCurrentGraph: false },
      )
      if (current.kind !== 'active') return { kind: 'missing' } satisfies CancellationMandateLoad
      return {
        kind: 'active' as const,
        mandateRef: current.mandate.mandateRef,
        mandateDigest: current.mandate.mandateDigest,
        networkId: current.networkId,
        mandate: current.mandate,
      } satisfies CancellationMandateLoad
    },

    loadEligibleExactCapabilitySupply: async (input) => (
      await loadEligibleRouteSupply(ctx, { ...input, now })
    ),
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

