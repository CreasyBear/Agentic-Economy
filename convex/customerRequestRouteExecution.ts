import { v, type Infer } from 'convex/values'

import {
  isBoundedJsonValue,
  openCapabilityDecisionModel,
  sameCapabilityContractRef,
  type CapabilityInputKey,
  type JsonValue,
} from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseRouteTransportObservationJson } from '@/modules/capability-supply/route-transport-runtime'
import { projectCustomerRequestProblemTracking } from '@/modules/customer-request/problem-tracking'
import { routeStepGrantDigest } from '@/modules/customer-request/route-mandate-admission'
import { routeStepGrantValue } from '@/modules/customer-request/runtime'

import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { getEligibleExactCapabilitySupply } from './capabilitySupply'
import { admitRouteStep } from './customerRequestRouteMandateAdmission'
import {
  readCurrentRouteMandateStateForPrincipal,
} from './customerRequestRouteMandate'
import { runtimeDb } from './source_state'

const MAX_PENDING_DISPATCH_SCAN = 64
const PRE_RELEASE_CANCELLATION_WINDOW_MS = 1_000

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

export const startOrResume = internalMutation({
  args: startCommand.fields,
  returns: startResult,
  handler: async (ctx, args): Promise<Infer<typeof startResult>> => {
    if (args.principalId.trim().length === 0 || args.idempotencyKey.trim().length === 0) {
      return { kind: 'conflict', reason: 'command_changed' }
    }
    const now = Date.now()
    const current = await readCurrentRouteMandateStateForPrincipal(
      ctx, args.requestId, args.principalId, now,
    )
    if (current.kind !== 'active') {
      return {
        kind: 'refused',
        reason: current.kind === 'expired' ? 'confirmation_expired' : 'confirmation_required',
      }
    }
    const mandate = current.mandate
    const commandKey = `route-run-command:v1:${canonicalDigest({
      principalId: mandate.principal.principalId,
      requestId: args.requestId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const commandDigest = canonicalDigest(args)
    const priorCommand = await ctx.db.query('customerRequestRouteRunCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (priorCommand !== null) {
      if (priorCommand.commandDigest !== commandDigest
        || priorCommand.principalId !== mandate.principal.principalId
        || priorCommand.requestId !== args.requestId) {
        return { kind: 'conflict', reason: 'command_changed' }
      }
      const replayed = await readRunProjection(ctx, priorCommand.runRef)
      if (replayed === null) throw new Error('customer_request_route_run_command_integrity_failure')
      return { kind: 'replayed', run: replayed }
    }

    const head = await ctx.db.query('customerRequestRouteRunHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head !== null && head.principalId !== mandate.principal.principalId) {
      throw new Error('customer_request_route_run_head_integrity_failure')
    }
    const existing = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_mandateRef', (query) => query.eq('mandateRef', mandate.mandateRef)).unique()
    if (existing !== null) {
      if (head !== null && (head.currentRunRef !== existing.runRef
        || head.currentMandateRef !== mandate.mandateRef)) {
        throw new Error('customer_request_route_run_head_integrity_failure')
      }
      const resumed = await readRunProjection(ctx, existing.runRef)
      if (resumed === null) throw new Error('customer_request_route_run_integrity_failure')
      if (head === null) await ctx.db.insert('customerRequestRouteRunHeads', {
        requestId: args.requestId,
        principalId: mandate.principal.principalId,
        currentRunRef: existing.runRef,
        currentMandateRef: mandate.mandateRef,
        createdAt: existing.createdAt,
        updatedAt: now,
      })
      await ctx.db.insert('customerRequestRouteRunCommands', {
        commandKey,
        commandDigest,
        principalId: mandate.principal.principalId,
        requestId: args.requestId,
        runRef: existing.runRef,
        committedAt: now,
      })
      return { kind: 'resumed', run: resumed }
    }

    if (head !== null) {
      const priorRun = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', head.currentRunRef)).unique()
      if (priorRun === null || priorRun.mandateRef !== head.currentMandateRef) {
        throw new Error('customer_request_route_run_head_integrity_failure')
      }
      const priorAttempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_runRef_and_position', (query) => (
          query.eq('runRef', priorRun.runRef).eq('position', priorRun.currentPosition)
        )).unique()
      if (priorAttempt === null) throw new Error('customer_request_route_run_attempt_integrity_failure')
      if (priorAttempt.state === 'dispatched' || priorAttempt.state === 'accepted'
        || priorAttempt.state === 'outcome_unknown') {
        return { kind: 'refused', reason: 'route_unavailable' }
      }
      if (priorAttempt.state === 'queued' || priorAttempt.state === 'leased') {
        const priorOutbox = await ctx.db.query('customerRequestRouteDispatchOutbox')
          .withIndex('by_attemptRef', (query) => query.eq('attemptRef', priorAttempt.attemptRef)).unique()
        if (priorOutbox === null || (priorOutbox.state !== 'pending' && priorOutbox.state !== 'leased')) {
          throw new Error('customer_request_route_dispatch_integrity_failure')
        }
        await ctx.db.patch(priorAttempt._id, { state: 'cancelled', updatedAt: now })
        await ctx.db.patch(priorOutbox._id, { state: 'cancelled', updatedAt: now })
        await ctx.db.patch(priorRun._id, { state: 'cancelled', updatedAt: now })
      }
    }

    const orderedSteps = [...mandate.route.steps].sort((left, right) => left.position - right.position)
    const firstStep = orderedSteps[0]
    if (firstStep === undefined) return { kind: 'refused', reason: 'route_unavailable' }
    const businesses = await snapshotRouteBusinesses(ctx, orderedSteps)
    if (businesses === undefined) return { kind: 'refused', reason: 'route_unavailable' }
    const firstInput = await materializeStepInput(ctx, {
      requestId: args.requestId,
      generationRef: mandate.route.generationRef,
      routePlanId: mandate.route.routePlanId,
      routeDigest: mandate.route.routeDigest,
      position: firstStep.position,
      actionId: firstStep.actionId,
      contractRef: firstStep.contractRef,
      upstreamOutputs: new Map(),
    })
    if (firstInput === null) return { kind: 'refused', reason: 'route_unavailable' }
    const runRef = `route-run:v1:${canonicalDigest({
      principalId: mandate.principal.principalId,
      requestId: args.requestId,
      mandateRef: mandate.mandateRef,
      mandateDigest: mandate.mandateDigest,
    })}`
    const admission = await admitRouteStep(ctx, {
      requestId: args.requestId,
      mandateRef: mandate.mandateRef,
      expectedMandateDigest: mandate.mandateDigest,
      expectedGenerationRef: mandate.route.generationRef,
      expectedRoutePlanId: mandate.route.routePlanId,
      expectedRouteDigest: mandate.route.routeDigest,
      stepPosition: firstStep.position,
      expectedActionId: firstStep.actionId,
      expectedCapabilityId: firstStep.contractRef.capabilityId,
      expectedCapabilityVersion: firstStep.contractRef.version,
      expectedCapabilityContractDigest: firstStep.contractRef.contractDigest,
      idempotencyKey: `run-step:${runRef}:${firstStep.actionId}`,
    }, args.principalId)
    if (admission.kind !== 'admitted' && admission.kind !== 'replayed') {
      return {
        kind: 'refused',
        reason: admission.reason === 'mandate_not_current'
          ? 'confirmation_changed'
          : 'route_unavailable',
      }
    }

    const runMaterial = {
      principalId: mandate.principal.principalId,
      requestId: args.requestId,
      requestRevision: mandate.request.requestRevision,
      mandateRef: mandate.mandateRef,
      mandateDigest: mandate.mandateDigest,
      generationRef: mandate.route.generationRef,
      routePlanId: mandate.route.routePlanId,
      routeDigest: mandate.route.routeDigest,
      businesses,
      state: 'queued' as const,
      totalSteps: orderedSteps.length,
      completedSteps: 0,
      currentPosition: firstStep.position,
      createdAt: now,
      updatedAt: now,
    }
    const runDigest = routeRunIdentityDigest({ runRef, ...runMaterial })
    const inputDigest = canonicalDigest(firstInput)
    const attemptMaterial = {
      runRef,
      requestId: args.requestId,
      mandateRef: mandate.mandateRef,
      actionId: firstStep.actionId,
      position: firstStep.position,
      operationKeyDigest: admission.grant.operationKeyDigest,
      grantDigest: admission.grant.grantDigest,
      inputDigest,
      createdAt: now,
    }
    const attemptDigest = canonicalDigest(attemptMaterial)
    const attemptRef = `route-step-attempt:v1:${attemptDigest}`
    const dispatchMaterial = {
      runRef,
      attemptRef,
      operationKeyDigest: admission.grant.operationKeyDigest,
      availableAt: now,
      createdAt: now,
    }
    const dispatchDigest = canonicalDigest(dispatchMaterial)
    const dispatchRef = `route-dispatch:v1:${dispatchDigest}`

    await ctx.db.insert('customerRequestRouteRuns', { runRef, runDigest, ...runMaterial })
    if (head === null) {
      await ctx.db.insert('customerRequestRouteRunHeads', {
        requestId: args.requestId,
        principalId: mandate.principal.principalId,
        currentRunRef: runRef,
        currentMandateRef: mandate.mandateRef,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch(head._id, {
        currentRunRef: runRef,
        currentMandateRef: mandate.mandateRef,
        updatedAt: now,
      })
    }
    await ctx.db.insert('customerRequestRouteStepAttempts', {
      attemptRef,
      attemptDigest,
      runRef,
      requestId: args.requestId,
      mandateRef: mandate.mandateRef,
      actionId: firstStep.actionId,
      position: firstStep.position,
      operationKeyDigest: admission.grant.operationKeyDigest,
      grant: admission.grant,
      inputJson: JSON.stringify(firstInput),
      inputDigest,
      state: 'queued',
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('customerRequestRouteDispatchOutbox', {
      dispatchRef,
      dispatchDigest,
      runRef,
      attemptRef,
      operationKeyDigest: admission.grant.operationKeyDigest,
      state: 'pending',
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('customerRequestRouteRunCommands', {
      commandKey,
      commandDigest,
      principalId: mandate.principal.principalId,
      requestId: args.requestId,
      runRef,
      committedAt: now,
    })
    await ctx.scheduler.runAfter(
      PRE_RELEASE_CANCELLATION_WINDOW_MS,
      internal.customerRequestRouteTransportWorker.runNext,
      {
      workerId: `route-worker:${dispatchRef}`,
      },
    )
    const run = await readRunProjection(ctx, runRef)
    if (run === null) throw new Error('customer_request_route_run_write_integrity_failure')
    return { kind: 'started', run }
  },
})

export const cancelCurrent = internalMutation({
  args: { requestId: v.string(), principalId: v.string(), idempotencyKey: v.string() },
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
    if (args.idempotencyKey.trim().length === 0 || args.principalId.trim().length === 0) {
      return { kind: 'conflict' as const, reason: 'command_changed' as const }
    }
    const commandKey = `route-cancel-command:v1:${canonicalDigest({
      principalId: args.principalId, requestId: args.requestId, idempotencyKey: args.idempotencyKey,
    })}`
    const commandDigest = canonicalDigest(args)
    const prior = await ctx.db.query('customerRequestRouteCancellationCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (prior !== null) {
      if (prior.commandDigest !== commandDigest || prior.principalId !== args.principalId
        || prior.requestId !== args.requestId) {
        return { kind: 'conflict' as const, reason: 'command_changed' as const }
      }
      const replayed = await readRunProjection(ctx, prior.runRef)
      if (replayed === null) throw new Error('customer_request_route_cancellation_integrity_failure')
      return prior.result === 'cancelled'
        ? { kind: 'replayed' as const, run: replayed }
        : prior.result === 'pending'
          ? { kind: 'pending' as const, run: replayed }
        : { kind: 'too_late' as const, run: replayed }
    }
    const head = await ctx.db.query('customerRequestRouteRunHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head === null || head.principalId !== args.principalId) {
      return { kind: 'refused' as const, reason: 'run_not_found' as const }
    }
    const run = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', head.currentRunRef)).unique()
    if (run === null || run.mandateRef !== head.currentMandateRef) {
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
    const canCancel = (attempt.state === 'queued' || attempt.state === 'leased')
      && (outbox.state === 'pending' || outbox.state === 'leased')
    const canRequestAdapterCancellation = !canCancel
      && attempt.grant.step.cancellation.kind === 'adapter_managed'
      && (attempt.state === 'dispatched' || attempt.state === 'accepted')
    if (canCancel) {
      await ctx.db.patch(attempt._id, { state: 'cancelled', updatedAt: now })
      await ctx.db.patch(outbox._id, { state: 'cancelled', updatedAt: now })
      await ctx.db.patch(run._id, { state: 'cancelled', updatedAt: now })
    }
    if (canRequestAdapterCancellation) {
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
    const commandResult = canCancel
      ? 'cancelled' as const
      : canRequestAdapterCancellation
        ? 'pending' as const
        : 'too_late' as const
    await ctx.db.insert('customerRequestRouteCancellationCommands', {
      commandKey,
      commandDigest,
      principalId: args.principalId,
      requestId: args.requestId,
      runRef: run.runRef,
      result: commandResult,
      boundaryChangedAt: run.updatedAt,
      committedAt: now,
    })
    const projection = await readRunProjection(ctx, run.runRef)
    if (projection === null) throw new Error('customer_request_route_run_integrity_failure')
    return canCancel
      ? { kind: 'cancelled' as const, run: projection }
      : canRequestAdapterCancellation
        ? { kind: 'pending' as const, run: projection }
      : { kind: 'too_late' as const, run: projection }
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

export const leaseNextDispatch = internalMutation({
  args: { workerId: v.string(), leaseDurationMs: v.number() },
  returns: v.union(
    v.object({ kind: v.literal('leased'), dispatch: dispatchLease }),
    v.object({ kind: v.literal('none') }),
    v.object({ kind: v.literal('refused'), reason: v.literal('lease_invalid') }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    if (args.workerId.trim().length === 0 || !Number.isSafeInteger(args.leaseDurationMs)
      || args.leaseDurationMs < 1_000 || args.leaseDurationMs > 60_000) {
      return { kind: 'refused' as const, reason: 'lease_invalid' as const }
    }
    const pendingCandidates = await ctx.db.query('customerRequestRouteDispatchOutbox')
      .withIndex('by_state_and_availableAt', (query) => (
        query.eq('state', 'pending').lte('availableAt', now)
      )).take(MAX_PENDING_DISPATCH_SCAN)
    for (const pending of pendingCandidates) {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', pending.attemptRef)).unique()
      if (attempt === null || !routeDispatchIntegrityValid(pending)
        || !routeAttemptIntegrityValid(attempt)
        || attempt.runRef !== pending.runRef || attempt.state !== 'queued'
        || attempt.operationKeyDigest !== pending.operationKeyDigest) {
        throw new Error('customer_request_route_dispatch_integrity_failure')
      }
      if (attempt.grant.expiresAt <= now) {
        await failExpiredUnreleasedAttempt(ctx, pending, attempt, now)
        continue
      }
      const leaseExpiresAt = now + args.leaseDurationMs
      await ctx.db.patch(pending._id, {
        state: 'leased', leaseOwner: args.workerId, leaseExpiresAt, updatedAt: now,
      })
      await ctx.db.patch(attempt._id, { state: 'leased', updatedAt: now })
      await ctx.scheduler.runAfter(args.leaseDurationMs, internal.customerRequestRouteExecution.recoverExpiredDispatch, {
        dispatchRef: pending.dispatchRef,
      })
      return {
        kind: 'leased' as const,
        dispatch: {
          dispatchRef: pending.dispatchRef,
          attemptRef: attempt.attemptRef,
          runRef: attempt.runRef,
          position: attempt.position,
          operationKeyDigest: attempt.operationKeyDigest,
          inputJson: attempt.inputJson,
          grant: attempt.grant,
          leaseExpiresAt,
        },
      }
    }
    if (pendingCandidates.length === MAX_PENDING_DISPATCH_SCAN) {
      await ctx.scheduler.runAfter(0, internal.customerRequestRouteTransportWorker.runNext, {
        workerId: `route-worker:expired-dispatch-cleanup:${now}`,
      })
    }
    return { kind: 'none' as const }
  },
})

async function failExpiredUnreleasedAttempt(
  ctx: MutationCtx,
  dispatch: Doc<'customerRequestRouteDispatchOutbox'>,
  attempt: Doc<'customerRequestRouteStepAttempts'>,
  now: number,
): Promise<void> {
  const run = await ctx.db.query('customerRequestRouteRuns')
    .withIndex('by_runRef', (query) => query.eq('runRef', attempt.runRef)).unique()
  if (run === null || run.mandateRef !== attempt.mandateRef
    || run.currentPosition !== attempt.position
    || (run.state !== 'queued' && run.state !== 'running')) {
    throw new Error('customer_request_route_run_integrity_failure')
  }
  const failure: JsonValue = { reason: 'authority_expired_before_release' }
  await ctx.db.patch(dispatch._id, { state: 'failed', updatedAt: now })
  await ctx.db.patch(attempt._id, { state: 'failed', updatedAt: now })
  await ctx.db.patch(run._id, {
    state: 'failed', resultJson: JSON.stringify(failure),
    resultDigest: canonicalDigest(failure), updatedAt: now,
  })
}

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
    if (dispatch === null || dispatch.leaseExpiresAt === undefined || dispatch.leaseExpiresAt > now) {
      return { kind: 'unchanged' as const }
    }
    if (!routeDispatchIntegrityValid(dispatch)) {
      throw new Error('customer_request_route_dispatch_integrity_failure')
    }
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', dispatch.attemptRef)).unique()
    if (attempt === null || attempt.runRef !== dispatch.runRef
      || attempt.operationKeyDigest !== dispatch.operationKeyDigest) {
      throw new Error('customer_request_route_dispatch_integrity_failure')
    }
    if (dispatch.state === 'leased' && attempt.state === 'leased') {
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
    if (dispatch.state === 'delivered'
      && (attempt.state === 'dispatched' || attempt.state === 'accepted')) {
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
  handler: async (ctx, args): Promise<Infer<typeof outcomeResult>> => {
    const now = Date.now()
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef)).unique()
    if (attempt === null || attempt.operationKeyDigest !== args.operationKeyDigest) {
      return { kind: 'refused', reason: 'attempt_not_current' }
    }
    const run = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', attempt.runRef)).unique()
    if (run === null) throw new Error('customer_request_route_run_integrity_failure')
    if (attempt.state === 'succeeded') {
      const replayed = await readRunProjection(ctx, run.runRef)
      if (replayed === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: run.state === 'completed' ? 'completed' : 'replayed', run: replayed }
    }
    if (attempt.state !== 'accepted' && attempt.state !== 'dispatched') {
      return { kind: 'refused', reason: 'attempt_not_current' }
    }
    const observation = args.observationJson === undefined
      ? undefined
      : parseRouteTransportObservationJson(args.observationJson)
    if (args.observationJson !== undefined && (observation === undefined
      || (args.outcome.kind === 'succeeded' && observation.disposition !== 'succeeded')
      || (args.outcome.kind === 'partial' && observation.disposition !== 'partial')
      || (args.outcome.kind === 'failed' && observation.disposition !== 'refused')
      || (args.outcome.kind === 'unknown'
        && observation.disposition !== 'unknown' && observation.disposition !== 'partial')
      || !observation.releaseStarted)) {
      return { kind: 'refused', reason: 'output_invalid' }
    }
    const observationPatch = observation === undefined ? {} : {
      transportObservationJson: args.observationJson,
      transportObservationDigest: canonicalDigest(observation),
    }
    if (args.outcome.kind === 'partial') {
      const suppliedOutput = parseBoundedJson(args.outcome.outputJson)
      const validated = suppliedOutput === undefined
        ? null
        : await validateAttemptOutput(ctx, attempt, suppliedOutput)
      if (validated === null) {
        await ctx.db.patch(attempt._id, observationPatch)
        await markUnknownOutcome(ctx, run, attempt, now)
      } else {
        const partialResult: JsonValue = { kind: 'partial_result', output: validated.output }
        await ctx.db.patch(attempt._id, {
          outputJson: JSON.stringify(validated.output),
          outputDigest: canonicalDigest(validated.output),
          evidence: [...validated.evidence],
          ...observationPatch,
        })
        await markUnknownOutcome(ctx, run, attempt, now, partialResult)
      }
      const partial = await readRunProjection(ctx, run.runRef)
      if (partial === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'outcome_unknown', run: partial }
    }
    if (args.outcome.kind === 'unknown') {
      await ctx.db.patch(attempt._id, observationPatch)
      await markUnknownOutcome(ctx, run, attempt, now)
      const unknown = await readRunProjection(ctx, run.runRef)
      if (unknown === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'outcome_unknown', run: unknown }
    }
    if (args.outcome.kind === 'failed') {
      const failure: JsonValue = { reason: 'business_reported_failure' }
      await ctx.db.patch(attempt._id, { state: 'failed', ...observationPatch, updatedAt: now })
      await ctx.db.patch(run._id, {
        state: 'failed', resultJson: JSON.stringify(failure),
        resultDigest: canonicalDigest(failure), updatedAt: now,
      })
      const failed = await readRunProjection(ctx, run.runRef)
      if (failed === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'failed', run: failed }
    }
    const suppliedOutput = args.outcome.kind === 'succeeded'
      ? parseBoundedJson(args.outcome.outputJson)
      : undefined
    const validated = suppliedOutput === undefined
      ? null
      : await validateAttemptOutput(ctx, attempt, suppliedOutput)
    if (validated === null) {
      await markUnknownOutcome(ctx, run, attempt, now)
      const unknown = await readRunProjection(ctx, run.runRef)
      if (unknown === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'outcome_unknown', run: unknown }
    }
    await ctx.db.patch(attempt._id, {
      state: 'succeeded',
      outputJson: JSON.stringify(validated.output),
      outputDigest: canonicalDigest(validated.output),
      evidence: [...validated.evidence],
      ...observationPatch,
      updatedAt: now,
    })
    const cancellation = await ctx.db.query('customerRequestRouteCancellationCommands')
      .withIndex('by_runRef_and_committedAt', (query) => query.eq('runRef', run.runRef))
      .order('desc')
      .first()
    if (attempt.position < run.totalSteps && cancellation?.result === 'pending') {
      await ctx.db.patch(run._id, {
        completedSteps: attempt.position,
        currentPosition: attempt.position,
        updatedAt: now,
      })
      const pendingCancellation = await readRunProjection(ctx, run.runRef)
      if (pendingCancellation === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'replayed', run: pendingCancellation }
    }
    if (attempt.position < run.totalSteps && cancellation?.result === 'too_late') {
      await ctx.db.patch(run._id, {
        state: 'cancelled',
        completedSteps: attempt.position,
        currentPosition: attempt.position,
        updatedAt: now,
      })
      const cancelled = await readRunProjection(ctx, run.runRef)
      if (cancelled === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'cancelled', run: cancelled }
    }
    if (attempt.position === run.totalSteps) {
      await ctx.db.patch(run._id, {
        state: 'completed',
        completedSteps: run.totalSteps,
        resultJson: JSON.stringify(validated.output),
        resultDigest: canonicalDigest(validated.output),
        updatedAt: now,
      })
      const completed = await readRunProjection(ctx, run.runRef)
      if (completed === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'completed', run: completed }
    }
    const next = await queueNextStep(ctx, run, attempt.position + 1, now)
    if (!next) {
      await markUnknownOutcome(ctx, run, attempt, now)
      const unknown = await readRunProjection(ctx, run.runRef)
      if (unknown === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'outcome_unknown', run: unknown }
    }
    const advanced = await readRunProjection(ctx, run.runRef)
    if (advanced === null) throw new Error('customer_request_route_run_integrity_failure')
    return { kind: 'advanced', run: advanced }
  },
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
    const commandDigest = canonicalDigest(args)
    const legacyCommandDigest = canonicalDigest({
      requestId: args.requestId, principalId: args.principalId, idempotencyKey: args.idempotencyKey,
      category: args.category, summary: args.summary,
    })
    const prior = await ctx.db.query('customerRequestRouteProblemReports')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (prior !== null) return (
      prior.commandDigest === commandDigest
      || (prior.evidenceReceiptRefs === undefined && prior.visibility === undefined
        && prior.commandDigest === legacyCommandDigest)
    )
      ? {
          kind: 'replayed' as const, reportRef: prior.reportRef, reportedAt: prior.createdAt,
          affected: {
            step: prior.step ?? 1,
            ...(prior.attemptRef === undefined ? {} : { attemptRef: prior.attemptRef }),
            ...(prior.businessName === undefined ? {} : { business: prior.businessName }),
          },
          visibility: prior.visibility ?? 'customer_and_ae_only',
          evidence: (prior.evidenceReceiptRefs ?? []).map((receiptRef, index) => ({
            receiptRef, label: `Attached evidence ${index + 1}`,
          })),
        }
      : { kind: 'conflict' as const }
    const reportedAt = Date.now()
    const reportRef = `problem:${canonicalDigest({ commandKey, commandDigest, runRef: head.currentRunRef })}`
    const run = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', head.currentRunRef)).unique()
    if (run === null || run.principalId !== args.principalId) {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const affectedStep = args.affectedStep ?? run.currentPosition
    if (!Number.isSafeInteger(affectedStep) || affectedStep < 1 || affectedStep > run.totalSteps
      || args.evidenceReceiptRefs.length > 20 || new Set(args.evidenceReceiptRefs).size !== args.evidenceReceiptRefs.length) {
      return { kind: 'refused' as const, reason: 'evidence_not_found' as const }
    }
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_runRef_and_position', (query) => (
        query.eq('runRef', run.runRef).eq('position', affectedStep)
      )).unique()
    if (attempt === null || !routeAttemptIntegrityValid(attempt)) {
      return { kind: 'refused' as const, reason: 'evidence_not_found' as const }
    }
    const availableEvidence = (attempt.evidence ?? []).map((item, index) => ({
      receiptRef: `evidence:${canonicalDigest({ attemptRef: attempt.attemptRef, evidence: item })}`,
      label: `Result evidence ${index + 1}`,
    }))
    const selectedEvidence = args.evidenceReceiptRefs.map((receiptRef) => (
      availableEvidence.find((item) => item.receiptRef === receiptRef)
    ))
    if (selectedEvidence.some((item) => item === undefined)) {
      return { kind: 'refused' as const, reason: 'evidence_not_found' as const }
    }
    const businessName = run.businesses?.[attempt.position - 1]?.name
    await ctx.db.insert('customerRequestRouteProblemReports', {
      reportRef, commandKey, commandDigest, principalId: args.principalId,
      requestId: args.requestId, runRef: head.currentRunRef, mandateRef: run.mandateRef,
      attemptRef: attempt.attemptRef, step: attempt.position,
      ...(businessName === undefined ? {} : { businessName }),
      evidenceReceiptRefs: args.evidenceReceiptRefs,
      visibility: args.visibility,
      category: args.category, summary: args.summary.trim(), createdAt: reportedAt,
    })
    return {
      kind: 'reported' as const, reportRef, reportedAt,
      affected: {
        step: attempt.position, attemptRef: attempt.attemptRef,
        ...(businessName === undefined ? {} : { business: businessName }),
      },
      visibility: args.visibility,
      evidence: selectedEvidence.filter((item) => item !== undefined),
    }
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
    const businessReports = await readProblemBusinessReports(ctx, report.reportRef)
    if (businessReports.some((item) => item.businessId !== String(business._id))) {
      throw new Error('customer_request_route_problem_business_report_integrity_failure')
    }
    const availableEvidence = labelAttemptEvidence(
      attempt,
      (attempt.evidence ?? []).map((item) => (
        `evidence:${canonicalDigest({ attemptRef: attempt.attemptRef, evidence: item })}`
      )),
    )
    const evidence = labelAttemptEvidence(attempt, report.evidenceReceiptRefs ?? [])
    if (evidence.length !== (report.evidenceReceiptRefs ?? []).length
      || businessReports.some((item) => (
        labelAttemptEvidence(attempt, item.evidenceReceiptRefs).length !== item.evidenceReceiptRefs.length
      ))) {
      throw new Error('customer_request_route_problem_evidence_integrity_failure')
    }
    return {
      kind: 'business_problem',
      reportRef: report.reportRef,
      business: business.name,
      category: report.category,
      customerStatement: report.summary,
      causality: 'unknown',
      resolution: 'not_adjudicated',
      decisionAuthority: 'not_assigned',
      evidence,
      availableEvidence,
      businessClaims: businessReports.map((item) => ({
        statementRef: item.statementRef,
        causalityPosition: item.causalityPosition,
        statement: item.statement,
        evidence: labelAttemptEvidence(attempt, item.evidenceReceiptRefs),
        recordedAt: item.createdAt,
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
    const statement = args.statement.trim()
    if (args.idempotencyKey.trim().length === 0 || statement.length === 0 || statement.length > 1_000
      || args.evidenceReceiptRefs.length > 20
      || new Set(args.evidenceReceiptRefs).size !== args.evidenceReceiptRefs.length) {
      return { kind: 'refused', reason: 'invalid_report' }
    }
    const commandKey = `route-problem-business-report:v1:${canonicalDigest({
      reportRef: args.reportRef,
      businessId: String(business._id),
      idempotencyKey: args.idempotencyKey,
    })}`
    const commandDigest = canonicalDigest(args)
    const prior = await ctx.db.query('customerRequestRouteProblemBusinessReports')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (prior !== null) {
      const priorEvidence = labelAttemptEvidence(attempt, prior.evidenceReceiptRefs)
      if (priorEvidence.length !== prior.evidenceReceiptRefs.length) {
        throw new Error('customer_request_route_problem_business_report_integrity_failure')
      }
      return prior.commandDigest === commandDigest
        ? {
          kind: 'replayed',
          statementRef: prior.statementRef,
          reportRef: prior.reportRef,
          business: prior.businessName,
          causalityPosition: prior.causalityPosition,
          statement: prior.statement,
          evidence: priorEvidence,
          recordedAt: prior.createdAt,
        }
        : { kind: 'conflict' }
    }
    const evidence = labelAttemptEvidence(attempt, args.evidenceReceiptRefs)
    if (evidence.length !== args.evidenceReceiptRefs.length) {
      return { kind: 'refused', reason: 'evidence_not_found' }
    }
    const recordedAt = Date.now()
    const statementRef = `problem-business-report:${canonicalDigest({
      commandKey, commandDigest, attemptRef: attempt.attemptRef,
    })}`
    await ctx.db.insert('customerRequestRouteProblemBusinessReports', {
      statementRef,
      reportRef: report.reportRef,
      commandKey,
      commandDigest,
      businessId: String(business._id),
      businessName: business.name,
      actorRef: identity.tokenIdentifier,
      causalityPosition: args.causalityPosition,
      statement,
      evidenceReceiptRefs: args.evidenceReceiptRefs,
      createdAt: recordedAt,
    })
    return {
      kind: 'recorded',
      statementRef,
      reportRef: report.reportRef,
      business: business.name,
      causalityPosition: args.causalityPosition,
      statement,
      evidence,
      recordedAt,
    }
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
    const message = args.publicMessage.trim()
    if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 0
      || args.idempotencyKey.trim().length === 0 || message.length === 0 || message.length > 1_000) {
      return { kind: 'refused', reason: 'invalid_update' }
    }
    const commandKey = `route-problem-update:v1:${canonicalDigest({
      reportRef: args.reportRef,
      actorRef: authority.membership.clerkUserId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const commandDigest = canonicalDigest(args)
    const prior = await ctx.db.query('customerRequestRouteProblemUpdates')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (prior !== null) return prior.commandDigest === commandDigest
      ? {
          kind: 'updated',
          reportRef: prior.reportRef,
          version: prior.version,
          state: prior.state,
          recordedAt: prior.createdAt,
        }
      : { kind: 'conflict', reason: 'idempotency_key_reused' }
    const updates = await readProblemUpdates(ctx, args.reportRef)
    if (updates.length !== args.expectedVersion) {
      return { kind: 'conflict', reason: 'stale_version' }
    }
    const version = updates.length + 1
    const recordedAt = Date.now()
    await ctx.db.insert('customerRequestRouteProblemUpdates', {
      updateRef: `problem-update:${canonicalDigest({ commandKey, commandDigest, version })}`,
      reportRef: args.reportRef,
      commandKey,
      commandDigest,
      version,
      source: 'ae_support',
      actorRef: authority.membership.clerkUserId,
      state: args.state,
      message,
      createdAt: recordedAt,
    })
    return { kind: 'updated', reportRef: args.reportRef, version, state: args.state, recordedAt }
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
    const message = args.message.trim()
    if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 1
      || args.idempotencyKey.trim().length === 0 || message.length === 0 || message.length > 1_000) {
      return { kind: 'refused', reason: 'invalid_update' }
    }
    const commandKey = `route-problem-reply:v1:${canonicalDigest({
      reportRef: args.reportRef,
      principalId: args.principalId,
      idempotencyKey: args.idempotencyKey,
    })}`
    const commandDigest = canonicalDigest(args)
    const prior = await ctx.db.query('customerRequestRouteProblemUpdates')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
    if (prior !== null) return prior.commandDigest === commandDigest
      ? {
          kind: 'updated',
          reportRef: prior.reportRef,
          version: prior.version,
          state: prior.state,
          recordedAt: prior.createdAt,
        }
      : { kind: 'conflict', reason: 'idempotency_key_reused' }
    const updates = await readProblemUpdates(ctx, args.reportRef)
    const latest = updates.at(-1)
    if (updates.length !== args.expectedVersion) {
      return { kind: 'conflict', reason: 'stale_version' }
    }
    if (latest?.state !== 'waiting_for_customer') {
      return { kind: 'refused', reason: 'invalid_update' }
    }
    const version = updates.length + 1
    const recordedAt = Date.now()
    await ctx.db.insert('customerRequestRouteProblemUpdates', {
      updateRef: `problem-update:${canonicalDigest({ commandKey, commandDigest, version })}`,
      reportRef: args.reportRef,
      commandKey,
      commandDigest,
      version,
      source: 'customer',
      actorRef: args.principalId,
      state: 'investigating',
      message,
      createdAt: recordedAt,
    })
    return {
      kind: 'updated',
      reportRef: args.reportRef,
      version,
      state: 'investigating',
      recordedAt,
    }
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
    const reports = await ctx.db.query('customerRequestRouteProblemReports').order('desc').take(limit)
    const updatesByProblem = await Promise.all(
      reports.map(async (problem) => readProblemUpdates(ctx, problem.reportRef)),
    )
    return {
      kind: 'allowed' as const,
      rows: reports.map((problem, index) => {
        const updates = updatesByProblem[index] ?? []
        const latest = updates.at(-1)
        const tracking = projectCustomerRequestProblemTracking(
          problem.createdAt,
          Date.now(),
          latest === undefined ? undefined : { state: latest.state, recordedAt: latest.createdAt },
        )
        return {
          reportRef: problem.reportRef,
          requestRef: problem.requestId,
          version: updates.length,
          state: tracking.state,
          nextActor: tracking.nextActor,
          category: problem.category,
          summary: problem.summary,
          ...(problem.businessName === undefined ? {} : { business: problem.businessName }),
          reportedAt: problem.createdAt,
          lastUpdatedAt: latest?.createdAt ?? problem.createdAt,
        }
      }),
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
    const [updates, businessReports, attempt] = await Promise.all([
      readProblemUpdates(ctx, problem.reportRef),
      readProblemBusinessReports(ctx, problem.reportRef),
      problem.attemptRef === undefined
        ? null
        : ctx.db.query('customerRequestRouteStepAttempts')
          .withIndex('by_attemptRef', (query) => query.eq('attemptRef', problem.attemptRef!)).unique(),
    ])
    if (problem.attemptRef !== undefined && attempt === null) {
      throw new Error('customer_request_route_problem_attempt_integrity_failure')
    }
    if (attempt !== null && (attempt.requestId !== problem.requestId || attempt.position !== problem.step)) {
      throw new Error('customer_request_route_problem_attempt_integrity_failure')
    }
    const latest = updates.at(-1)
    const tracking = projectCustomerRequestProblemTracking(
      problem.createdAt,
      Date.now(),
      latest === undefined ? undefined : { state: latest.state, recordedAt: latest.createdAt },
    )
    const evidenceByReceipt = new Map<string, string>()
    if (attempt !== null) {
      for (const [index, item] of (attempt.evidence ?? []).entries()) {
        evidenceByReceipt.set(
          `evidence:${canonicalDigest({ attemptRef: attempt.attemptRef, evidence: item })}`,
          `Result evidence ${index + 1}`,
        )
      }
    }
    if ((problem.evidenceReceiptRefs ?? []).some((receiptRef) => !evidenceByReceipt.has(receiptRef))) {
      throw new Error('customer_request_route_problem_evidence_integrity_failure')
    }
    if (businessReports.some((report) => (
      report.businessId !== attempt?.grant.step.businessId
      || report.evidenceReceiptRefs.some((receiptRef) => !evidenceByReceipt.has(receiptRef))
    ))) {
      throw new Error('customer_request_route_problem_business_report_integrity_failure')
    }
    return {
      kind: 'problem_export' as const,
      reportRef: problem.reportRef,
      requestRef: problem.requestId,
      version: updates.length,
      state: tracking.state,
      category: problem.category,
      summary: problem.summary,
      claimSource: 'customer' as const,
      causality: 'unknown' as const,
      resolution: 'not_adjudicated' as const,
      nextAction: tracking.nextAction,
      nextActor: tracking.nextActor,
      ...(tracking.nextUpdateDueAt === undefined ? {} : { nextUpdateDueAt: tracking.nextUpdateDueAt }),
      decisionAuthority: tracking.decisionAuthority,
      visibility: problem.visibility ?? 'customer_and_ae_only',
      evidence: (problem.evidenceReceiptRefs ?? []).map((receiptRef) => ({
        receiptRef,
        label: evidenceByReceipt.get(receiptRef)!,
      })),
      reportedAt: problem.createdAt,
      affected: {
        step: problem.step ?? 1,
        ...(problem.businessName === undefined ? {} : { business: problem.businessName }),
      },
      claims: [
        {
          claimSource: 'customer' as const,
          causalityPosition: 'reported_problem' as const,
          statement: problem.summary,
          evidence: (problem.evidenceReceiptRefs ?? []).map((receiptRef) => ({
            receiptRef,
            label: evidenceByReceipt.get(receiptRef)!,
          })),
          recordedAt: problem.createdAt,
        },
        ...businessReports.map((businessReport) => ({
          claimSource: 'business' as const,
          causalityPosition: businessReport.causalityPosition,
          statement: businessReport.statement,
          business: businessReport.businessName,
          evidence: businessReport.evidenceReceiptRefs.map((receiptRef) => ({
            receiptRef,
            label: evidenceByReceipt.get(receiptRef)!,
          })),
          recordedAt: businessReport.createdAt,
        })),
      ],
      history: [
        {
          version: 0,
          state: 'received' as const,
          source: 'customer' as const,
          message: problem.summary,
          recordedAt: problem.createdAt,
        },
        ...updates.map((update) => ({
          version: update.version,
          state: update.state,
          source: update.source,
          message: update.message,
          recordedAt: update.createdAt,
        })),
      ],
    }
  },
})

const exportedStepState = v.union(
  v.literal('queued'), v.literal('contacting'), v.literal('awaiting_result'), v.literal('completed'),
  v.literal('failed'), v.literal('outcome_unknown'), v.literal('cancelled'),
)

async function readProblemUpdates(ctx: MutationCtx | QueryCtx, reportRef: string) {
  const updates = await ctx.db.query('customerRequestRouteProblemUpdates')
    .withIndex('by_reportRef_and_version', (query) => query.eq('reportRef', reportRef))
    .take(101)
  if (updates.length > 100 || updates.some((update, index) => update.version !== index + 1)) {
    throw new Error('customer_request_route_problem_update_integrity_failure')
  }
  return updates
}

async function readProblemBusinessReports(ctx: MutationCtx | QueryCtx, reportRef: string) {
  const reports = await ctx.db.query('customerRequestRouteProblemBusinessReports')
    .withIndex('by_reportRef_and_createdAt', (query) => query.eq('reportRef', reportRef))
    .take(101)
  if (reports.length > 100) {
    throw new Error('customer_request_route_problem_business_report_integrity_failure')
  }
  return reports
}

function labelAttemptEvidence(
  attempt: Doc<'customerRequestRouteStepAttempts'>,
  receiptRefs: readonly string[],
) {
  const available = new Map((attempt.evidence ?? []).map((item, index) => [
    `evidence:${canonicalDigest({ attemptRef: attempt.attemptRef, evidence: item })}`,
    `Result evidence ${index + 1}`,
  ]))
  return receiptRefs.flatMap((receiptRef) => {
    const label = available.get(receiptRef)
    return label === undefined ? [] : [{ receiptRef, label }]
  })
}

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
  handler: async (ctx, args) => {
    const head = await ctx.db.query('customerRequestRouteRunHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head === null || head.principalId !== args.principalId) return { kind: 'none' as const }
    const run = await ctx.db.query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', head.currentRunRef)).unique()
    if (run === null || run.principalId !== args.principalId) throw new Error('customer_request_route_run_integrity_failure')
    const attempts = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_runRef_and_position', (query) => query.eq('runRef', run.runRef)).take(run.totalSteps + 1)
    if (attempts.length === 0 || attempts.length > run.totalSteps
      || attempts.some((attempt) => !routeAttemptIntegrityValid(attempt))) {
      throw new Error('customer_request_route_run_attempt_integrity_failure')
    }
    const problems = await ctx.db.query('customerRequestRouteProblemReports')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).take(101)
    if (problems.length > 100 || problems.some((problem) => problem.principalId !== args.principalId)) {
      throw new Error('customer_request_route_problem_integrity_failure')
    }
    const [updatesByProblem, businessReportsByProblem] = await Promise.all([
      Promise.all(problems.map(async (problem) => readProblemUpdates(ctx, problem.reportRef))),
      Promise.all(problems.map(async (problem) => readProblemBusinessReports(ctx, problem.reportRef))),
    ])
    return {
      kind: 'found' as const, state: run.state, generatedAt: Date.now(),
      ...(run.resultJson === undefined ? {} : { resultJson: run.resultJson }),
      steps: attempts.sort((left, right) => left.position - right.position).map((attempt) => ({
        step: attempt.position, state: exportState(attempt.state), observedAt: attempt.updatedAt,
        evidence: (attempt.evidence ?? []).map((item, index) => ({
          receiptRef: `evidence:${canonicalDigest({ attemptRef: attempt.attemptRef, evidence: item })}`,
          label: `Result evidence ${index + 1}`,
        })),
      })),
      problems: problems.map((problem, problemIndex) => {
        const updates = updatesByProblem[problemIndex] ?? []
        const businessReports = businessReportsByProblem[problemIndex] ?? []
        const latest = updates.at(-1)
        const tracking = projectCustomerRequestProblemTracking(
          problem.createdAt,
          Date.now(),
          latest === undefined ? undefined : {
            state: latest.state,
            recordedAt: latest.createdAt,
          },
        )
        const attempt = attempts.find((candidate) => candidate.attemptRef === problem.attemptRef)
        const evidenceByReceipt = new Map<string, string>()
        if (attempt !== undefined) {
          for (const [index, item] of (attempt.evidence ?? []).entries()) {
            evidenceByReceipt.set(
              `evidence:${canonicalDigest({ attemptRef: attempt.attemptRef, evidence: item })}`,
              `Result evidence ${index + 1}`,
            )
          }
        }
        if (businessReports.some((businessReport) => (
          businessReport.businessId !== attempt?.grant.step.businessId
          || businessReport.evidenceReceiptRefs.some((receiptRef) => !evidenceByReceipt.has(receiptRef))
        ))) {
          throw new Error('customer_request_route_problem_business_report_integrity_failure')
        }
        return {
          reportRef: problem.reportRef,
          version: updates.length,
          state: tracking.state,
          category: problem.category, summary: problem.summary,
          claimSource: 'customer' as const, causality: 'unknown' as const,
          resolution: 'not_adjudicated' as const,
          nextAction: tracking.nextAction,
          nextActor: tracking.nextActor,
          ...(tracking.nextUpdateDueAt === undefined ? {} : { nextUpdateDueAt: tracking.nextUpdateDueAt }),
          decisionAuthority: tracking.decisionAuthority,
          visibility: problem.visibility ?? 'customer_and_ae_only',
          evidence: (problem.evidenceReceiptRefs ?? []).map((receiptRef) => ({
            receiptRef, label: evidenceByReceipt.get(receiptRef) ?? 'Recorded evidence',
          })),
          reportedAt: problem.createdAt,
          affected: {
            step: problem.step ?? 1,
            ...(problem.attemptRef === undefined ? {} : { attemptRef: problem.attemptRef }),
            ...(problem.businessName === undefined ? {} : { business: problem.businessName }),
          },
          claims: [
            {
              claimSource: 'customer' as const,
              causalityPosition: 'reported_problem' as const,
              statement: problem.summary,
              evidence: (problem.evidenceReceiptRefs ?? []).map((receiptRef) => ({
                receiptRef,
                label: evidenceByReceipt.get(receiptRef) ?? 'Recorded evidence',
              })),
              recordedAt: problem.createdAt,
            },
            ...businessReports.map((businessReport) => ({
              claimSource: 'business' as const,
              causalityPosition: businessReport.causalityPosition,
              statement: businessReport.statement,
              business: businessReport.businessName,
              evidence: businessReport.evidenceReceiptRefs.map((receiptRef) => ({
                receiptRef,
                label: evidenceByReceipt.get(receiptRef) ?? 'Recorded evidence',
              })),
              recordedAt: businessReport.createdAt,
            })),
          ],
          history: [
            {
              version: 0,
              state: 'received' as const,
              source: 'customer' as const,
              message: problem.summary,
              recordedAt: problem.createdAt,
            },
            ...updates.map((update) => ({
              version: update.version,
              state: update.state,
              source: update.source,
              message: update.message,
              recordedAt: update.createdAt,
            })),
          ],
        }
      }),
    }
  },
})

function exportState(state: Doc<'customerRequestRouteStepAttempts'>['state']): Infer<typeof exportedStepState> {
  if (state === 'leased' || state === 'dispatched') return 'contacting'
  if (state === 'accepted') return 'awaiting_result'
  if (state === 'succeeded') return 'completed'
  return state
}

async function readRunProjection(
  ctx: MutationCtx | QueryCtx,
  runRef: string,
): Promise<Infer<typeof runProjection> | null> {
  const run = await ctx.db.query('customerRequestRouteRuns')
    .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
  if (run === null) return null
  const attempts = await ctx.db.query('customerRequestRouteStepAttempts')
    .withIndex('by_runRef_and_position', (query) => query.eq('runRef', runRef))
    .take(run.totalSteps + 1)
  const current = attempts.find((attempt) => attempt.position === run.currentPosition)
  const cancellation = await ctx.db.query('customerRequestRouteCancellationCommands')
    .withIndex('by_runRef_and_committedAt', (query) => query.eq('runRef', runRef))
    .order('desc')
    .first()
  if (routeRunIdentityDigest(run) !== run.runDigest
    || attempts.length > run.totalSteps || current === undefined
    || attempts.some((attempt) => !routeAttemptIntegrityValid(attempt))) {
    throw new Error('customer_request_route_run_attempt_integrity_failure')
  }
  const cancellationAttempt = await ctx.db.query('customerRequestRouteCancellationAttempts')
    .withIndex('by_runRef_and_attemptRef', (query) => (
      query.eq('runRef', runRef).eq('attemptRef', current.attemptRef)
    )).unique()
  const { runRef: _runRef, runDigest: _runDigest, principalId: _principalId,
    mandateRef: _mandateRef, mandateDigest: _mandateDigest, routePlanId: _routePlanId,
    routeDigest: _routeDigest, createdAt: _createdAt, ...projection } = run
  return {
    runRef,
    requestId: projection.requestId,
    requestRevision: projection.requestRevision,
    generationRef: projection.generationRef,
    ...(projection.businesses === undefined ? {} : {
      businesses: projection.businesses.map((business) => ({ ...business })),
    }),
    state: projection.state,
    totalSteps: projection.totalSteps,
    completedSteps: projection.completedSteps,
    currentPosition: projection.currentPosition,
    currentState: current.state,
    ...(projection.resultJson === undefined ? {} : { resultJson: projection.resultJson }),
    ...((current.state === 'queued' || current.state === 'leased')
      ? { cancellationReleaseMayStartAt: current.createdAt + PRE_RELEASE_CANCELLATION_WINDOW_MS }
      : {}),
    ...(cancellation?.result === 'too_late' || cancellation?.result === 'rejected'
      ? {
          cancellationUnavailableSince: cancellation.boundaryChangedAt ?? cancellation.committedAt,
          cancellationRequestedAt: cancellation.committedAt,
        }
      : {}),
    ...(cancellationAttempt?.state === 'pending'
      ? {
          cancellationAttempt: {
            state: 'pending' as const,
            requestedAt: cancellationAttempt.requestedAt,
            nextCheckAt: cancellationAttempt.updatedAt + 30_000,
          },
        }
      : cancellationAttempt?.state === 'unknown'
        ? {
            cancellationAttempt: {
              state: 'unknown' as const,
              requestedAt: cancellationAttempt.requestedAt,
              observedAt: cancellationAttempt.resolvedAt ?? cancellationAttempt.updatedAt,
              nextCheckAt: cancellationAttempt.updatedAt + 30_000,
            },
          }
        : {}),
    updatedAt: projection.updatedAt,
  }
}

type StepInputRequest = Readonly<{
  requestId: string
  generationRef: string
  routePlanId: string
  routeDigest: string
  position: number
  actionId: string
  contractRef: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
  upstreamOutputs: ReadonlyMap<string, JsonValue>
}>

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

async function materializeStepInput(
  ctx: MutationCtx,
  request: StepInputRequest,
): Promise<JsonValue | null> {
  const generationRow = await ctx.db.query('customerRequestV2RoutePlanGenerations')
    .withIndex('by_requestId_and_generationRef', (query) => (
      query.eq('requestId', request.requestId).eq('generationRef', request.generationRef)
    )).unique()
  const route = generationRow?.routeGeneration.routes.find((candidate) => (
    candidate.routePlanId === request.routePlanId && candidate.routeDigest === request.routeDigest
  ))
  const step = route?.steps[request.position - 1]
  if (step === undefined || step.actionId !== request.actionId
    || !sameCapabilityContractRef(step.contractRef, request.contractRef)) return null
  const stored = await getActiveExactCapabilityContract(ctx.db, request.contractRef)
  if (stored.kind !== 'found') return null
  let model: ReturnType<typeof openCapabilityDecisionModel>
  try {
    model = openCapabilityDecisionModel(encodeCapabilityContractDocumentJson(stored.documentJson).contract)
  } catch {
    return null
  }
  if (!sameCapabilityContractRef(model.contractRef, request.contractRef)) return null
  const mappedFacts = step.deferredInputs.flatMap((mapping) => {
    const value = request.upstreamOutputs.get(mapping.mappingId)
    return value === undefined ? [] : [{
      input: mapping.target.inputKey as CapabilityInputKey,
      inputPointer: mapping.target.inputPointer,
      value,
    }]
  })
  if (mappedFacts.length !== step.deferredInputs.length) return null
  const assessed = model.assessInput({
    contractRef: model.contractRef,
    selectionKey: model.selectionKey,
    stage: 'commitment',
    facts: [
      ...step.resolvedInputs.map((fact) => ({
        input: fact.inputKey as CapabilityInputKey,
        inputPointer: fact.inputPointer,
        value: fact.value,
      })),
      ...mappedFacts,
    ],
  })
  return assessed.kind === 'viable' && assessed.stage === 'commitment' ? assessed.input : null
}

async function validateAttemptOutput(
  ctx: MutationCtx,
  attempt: Doc<'customerRequestRouteStepAttempts'>,
  output: unknown,
): Promise<Readonly<{
  output: JsonValue
  evidence: readonly Readonly<{
    evidenceId: string
    outputPointer: string
    schemaIdentity: string
    valueDigest: string
  }>[]
}> | null> {
  const contractRef = attempt.grant.step.contractRef
  const stored = await getActiveExactCapabilityContract(ctx.db, contractRef)
  if (stored.kind !== 'found') return null
  let model: ReturnType<typeof openCapabilityDecisionModel>
  try {
    model = openCapabilityDecisionModel(encodeCapabilityContractDocumentJson(stored.documentJson).contract)
  } catch {
    return null
  }
  if (!sameCapabilityContractRef(model.contractRef, contractRef)) return null
  const validation = model.validateOutput(output)
  if (validation.kind !== 'valid') return null
  const evidence: Array<{
    evidenceId: string; outputPointer: string; schemaIdentity: string; valueDigest: string
  }> = []
  for (const semantic of model.evidence) {
    const value = readJsonPointer(validation.value, semantic.outputPointer)
    if (value === undefined || !isBoundedJsonValue(value)) {
      if (semantic.guaranteed || semantic.purpose === 'completion') return null
      continue
    }
    evidence.push({
      evidenceId: semantic.evidenceId,
      outputPointer: semantic.outputPointer,
      schemaIdentity: semantic.schemaIdentity,
      valueDigest: canonicalDigest(value),
    })
  }
  return { output: validation.value, evidence }
}

async function queueNextStep(
  ctx: MutationCtx,
  run: Doc<'customerRequestRouteRuns'>,
  position: number,
  now: number,
): Promise<boolean> {
  const mandateState = await readCurrentRouteMandateStateForPrincipal(
    ctx, run.requestId, run.principalId, now, { requireCurrentGraph: false },
  )
  if (mandateState.kind !== 'active' || mandateState.mandate.mandateRef !== run.mandateRef) return false
  const mandateStep = mandateState.mandate.route.steps.find((step) => step.position === position)
  if (mandateStep === undefined) return false
  const generationRow = await ctx.db.query('customerRequestV2RoutePlanGenerations')
    .withIndex('by_requestId_and_generationRef', (query) => (
      query.eq('requestId', run.requestId).eq('generationRef', run.generationRef)
    )).unique()
  const route = generationRow?.routeGeneration.routes.find((candidate) => (
    candidate.routePlanId === run.routePlanId && candidate.routeDigest === run.routeDigest
  ))
  const routeStep = route?.steps[position - 1]
  if (routeStep === undefined || routeStep.actionId !== mandateStep.actionId) return false
  const attempts = await ctx.db.query('customerRequestRouteStepAttempts')
    .withIndex('by_runRef_and_position', (query) => query.eq('runRef', run.runRef))
    .take(run.totalSteps + 1)
  if (attempts.length >= run.totalSteps) return false
  const upstreamOutputs = new Map<string, JsonValue>()
  for (const mapping of routeStep.deferredInputs) {
    const source = attempts.find((candidate) => candidate.actionId === mapping.source.actionId)
    const evidence = source?.evidence?.find((candidate) => (
      candidate.evidenceId === mapping.source.evidenceId
      && candidate.outputPointer === mapping.source.outputPointer
      && candidate.schemaIdentity === mapping.schemaIdentity
    ))
    const sourceOutput = source?.outputJson === undefined ? undefined : parseBoundedJson(source.outputJson)
    if (source?.state !== 'succeeded' || sourceOutput === undefined || evidence === undefined) return false
    const pointed = readJsonPointer(sourceOutput, mapping.source.outputPointer)
    if (pointed === undefined || !isBoundedJsonValue(pointed)
      || canonicalDigest(pointed) !== evidence.valueDigest) return false
    upstreamOutputs.set(mapping.mappingId, pointed)
  }
  const input = await materializeStepInput(ctx, {
    requestId: run.requestId,
    generationRef: run.generationRef,
    routePlanId: run.routePlanId,
    routeDigest: run.routeDigest,
    position,
    actionId: mandateStep.actionId,
    contractRef: mandateStep.contractRef,
    upstreamOutputs,
  })
  if (input === null) return false
  const admission = await admitRouteStep(ctx, {
    requestId: run.requestId,
    mandateRef: mandateState.mandate.mandateRef,
    expectedMandateDigest: mandateState.mandate.mandateDigest,
    expectedGenerationRef: run.generationRef,
    expectedRoutePlanId: run.routePlanId,
    expectedRouteDigest: run.routeDigest,
    stepPosition: position,
    expectedActionId: mandateStep.actionId,
    expectedCapabilityId: mandateStep.contractRef.capabilityId,
    expectedCapabilityVersion: mandateStep.contractRef.version,
    expectedCapabilityContractDigest: mandateStep.contractRef.contractDigest,
    idempotencyKey: `run-step:${run.runRef}:${mandateStep.actionId}`,
  }, run.principalId)
  if (admission.kind !== 'admitted' && admission.kind !== 'replayed') return false
  const inputDigest = canonicalDigest(input)
  const attemptMaterial = {
    runRef: run.runRef,
    requestId: run.requestId,
    mandateRef: run.mandateRef,
    actionId: mandateStep.actionId,
    position,
    operationKeyDigest: admission.grant.operationKeyDigest,
    grantDigest: admission.grant.grantDigest,
    inputDigest,
    createdAt: now,
  }
  const attemptDigest = canonicalDigest(attemptMaterial)
  const attemptRef = `route-step-attempt:v1:${attemptDigest}`
  const dispatchMaterial = {
    runRef: run.runRef,
    attemptRef,
    operationKeyDigest: admission.grant.operationKeyDigest,
    availableAt: now,
    createdAt: now,
  }
  const dispatchDigest = canonicalDigest(dispatchMaterial)
  await ctx.db.insert('customerRequestRouteStepAttempts', {
    attemptRef,
    attemptDigest,
    runRef: run.runRef,
    requestId: run.requestId,
    mandateRef: run.mandateRef,
    actionId: mandateStep.actionId,
    position,
    operationKeyDigest: admission.grant.operationKeyDigest,
    grant: admission.grant,
    inputJson: JSON.stringify(input),
    inputDigest,
    state: 'queued',
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert('customerRequestRouteDispatchOutbox', {
    dispatchRef: `route-dispatch:v1:${dispatchDigest}`,
    dispatchDigest,
    runRef: run.runRef,
    attemptRef,
    operationKeyDigest: admission.grant.operationKeyDigest,
    state: 'pending',
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.scheduler.runAfter(
    PRE_RELEASE_CANCELLATION_WINDOW_MS,
    internal.customerRequestRouteTransportWorker.runNext,
    { workerId: `route-worker:${run.runRef}:${position}` },
  )
  await ctx.db.patch(run._id, {
    state: 'running', completedSteps: position - 1, currentPosition: position, updatedAt: now,
  })
  return true
}

async function markUnknownOutcome(
  ctx: MutationCtx,
  run: Doc<'customerRequestRouteRuns'>,
  attempt: Doc<'customerRequestRouteStepAttempts'>,
  now: number,
  result?: JsonValue,
): Promise<void> {
  await ctx.db.patch(attempt._id, { state: 'outcome_unknown', updatedAt: now })
  await ctx.db.patch(run._id, {
    state: 'outcome_unknown',
    ...(result === undefined ? {} : {
      resultJson: JSON.stringify(result),
      resultDigest: canonicalDigest(result),
    }),
    updatedAt: now,
  })
}

function readJsonPointer(value: JsonValue, pointer: string): JsonValue | undefined {
  if (!pointer.startsWith('/') || pointer.length < 2) return undefined
  let current: JsonValue | undefined = value
  for (const encoded of pointer.slice(1).split('/')) {
    const segment = encoded.replaceAll('~1', '/').replaceAll('~0', '~')
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment)) return undefined
      current = current[Number(segment)]
    } else if (current !== null && typeof current === 'object') {
      const object = current as Readonly<Record<string, JsonValue>>
      current = Object.prototype.hasOwnProperty.call(object, segment)
        ? object[segment]
        : undefined
    } else return undefined
  }
  return current
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

function routeRunIdentityDigest(run: Readonly<{
  runRef: string
  principalId: string
  requestId: string
  requestRevision: number
  mandateRef: string
  mandateDigest: string
  generationRef: string
  routePlanId: string
  routeDigest: string
  businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  totalSteps: number
  createdAt: number
}>): string {
  return canonicalDigest({
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
    totalSteps: run.totalSteps,
    createdAt: run.createdAt,
  })
}

async function snapshotRouteBusinesses(
  ctx: MutationCtx,
  steps: readonly Readonly<{ businessId: string }>[],
): Promise<Array<{ businessRef: string; name: string }> | undefined> {
  const businessIds = [...new Set(steps.map(({ businessId }) => businessId))]
  const businesses = []
  for (const businessId of businessIds) {
    const business = await ctx.db.get(businessId as Id<'businesses'>)
    const name = business?.name.trim()
    if (name === undefined || name.length === 0) return undefined
    businesses.push({
      businessRef: `business:${canonicalDigest({ businessId })}`,
      name,
    })
  }
  return businesses
}

function routeAttemptIntegrityValid(attempt: Doc<'customerRequestRouteStepAttempts'>): boolean {
  const attemptDigest = canonicalDigest({
    runRef: attempt.runRef,
    requestId: attempt.requestId,
    mandateRef: attempt.mandateRef,
    actionId: attempt.actionId,
    position: attempt.position,
    operationKeyDigest: attempt.operationKeyDigest,
    grantDigest: attempt.grant.grantDigest,
    inputDigest: attempt.inputDigest,
    createdAt: attempt.createdAt,
  })
  const input = parseBoundedJson(attempt.inputJson)
  const output = attempt.outputJson === undefined ? undefined : parseBoundedJson(attempt.outputJson)
  const observation = attempt.transportObservationJson === undefined
    ? undefined
    : parseRouteTransportObservationJson(attempt.transportObservationJson)
  return attempt.attemptDigest === attemptDigest
    && attempt.attemptRef === `route-step-attempt:v1:${attemptDigest}`
    && input !== undefined
    && canonicalDigest(input) === attempt.inputDigest
    && (attempt.outputJson === undefined
      ? attempt.outputDigest === undefined
      : output !== undefined && canonicalDigest(output) === attempt.outputDigest)
    && (attempt.transportObservationJson === undefined
      ? attempt.transportObservationDigest === undefined
      : observation !== undefined && canonicalDigest(observation) === attempt.transportObservationDigest)
}

function routeDispatchIntegrityValid(dispatch: Doc<'customerRequestRouteDispatchOutbox'>): boolean {
  const digest = canonicalDigest({
    runRef: dispatch.runRef,
    attemptRef: dispatch.attemptRef,
    operationKeyDigest: dispatch.operationKeyDigest,
    availableAt: dispatch.createdAt,
    createdAt: dispatch.createdAt,
  })
  return dispatch.dispatchDigest === digest
    && dispatch.dispatchRef === `route-dispatch:v1:${digest}`
}
