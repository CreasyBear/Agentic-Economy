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
import { routeStepGrantDigest } from '@/modules/customer-request/route-mandate-admission'
import { routeStepGrantValue } from '@/modules/customer-request/runtime'

import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import { env, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { getEligibleExactCapabilitySupply } from './capabilitySupply'
import { admitRouteStep } from './customerRequestRouteMandateAdmission'
import {
  readCurrentRouteMandateState,
  readCurrentRouteMandateStateForPrincipal,
} from './customerRequestRouteMandate'

const startCommand = v.object({
  requestId: v.string(),
  idempotencyKey: v.string(),
})

const runProjection = v.object({
  runRef: v.string(),
  requestId: v.string(),
  requestRevision: v.number(),
  generationRef: v.string(),
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
    if (args.idempotencyKey.trim().length === 0) {
      return { kind: 'conflict', reason: 'command_changed' }
    }
    const now = Date.now()
    const current = await readCurrentRouteMandateState(ctx, args.requestId, now)
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
    })
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
    if (routeWorkerConfigured()) {
      await ctx.scheduler.runAfter(0, internal.customerRequestRouteTransportWorker.runNext, {
        workerId: `route-worker:${dispatchRef}`,
      })
    }
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
    if (canCancel) {
      await ctx.db.patch(attempt._id, { state: 'cancelled', updatedAt: now })
      await ctx.db.patch(outbox._id, { state: 'cancelled', updatedAt: now })
      await ctx.db.patch(run._id, { state: 'cancelled', updatedAt: now })
    }
    await ctx.db.insert('customerRequestRouteCancellationCommands', {
      commandKey,
      commandDigest,
      principalId: args.principalId,
      requestId: args.requestId,
      runRef: run.runRef,
      result: canCancel ? 'cancelled' : 'too_late',
      committedAt: now,
    })
    const projection = await readRunProjection(ctx, run.runRef)
    if (projection === null) throw new Error('customer_request_route_run_integrity_failure')
    return canCancel
      ? { kind: 'cancelled' as const, run: projection }
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
    const pending = await ctx.db.query('customerRequestRouteDispatchOutbox')
      .withIndex('by_state_and_availableAt', (query) => (
        query.eq('state', 'pending').lte('availableAt', now)
      )).first()
    if (pending === null) return { kind: 'none' as const }
    const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
      .withIndex('by_attemptRef', (query) => query.eq('attemptRef', pending.attemptRef)).unique()
    if (attempt === null || !routeDispatchIntegrityValid(pending)
      || !routeAttemptIntegrityValid(attempt)
      || attempt.runRef !== pending.runRef || attempt.state !== 'queued'
      || attempt.operationKeyDigest !== pending.operationKeyDigest) {
      throw new Error('customer_request_route_dispatch_integrity_failure')
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
  },
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
      if (routeWorkerConfigured()) {
        await ctx.scheduler.runAfter(0, internal.customerRequestRouteTransportWorker.runNext, {
          workerId: `route-worker:recovery:${dispatch.dispatchRef}`,
        })
      }
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
  if (routeRunIdentityDigest(run) !== run.runDigest
    || attempts.length > run.totalSteps || current === undefined
    || attempts.some((attempt) => !routeAttemptIntegrityValid(attempt))) {
    throw new Error('customer_request_route_run_attempt_integrity_failure')
  }
  const { runRef: _runRef, runDigest: _runDigest, principalId: _principalId,
    mandateRef: _mandateRef, mandateDigest: _mandateDigest, routePlanId: _routePlanId,
    routeDigest: _routeDigest, createdAt: _createdAt, ...projection } = run
  return {
    runRef,
    requestId: projection.requestId,
    requestRevision: projection.requestRevision,
    generationRef: projection.generationRef,
    state: projection.state,
    totalSteps: projection.totalSteps,
    completedSteps: projection.completedSteps,
    currentPosition: projection.currentPosition,
    currentState: current.state,
    ...(projection.resultJson === undefined ? {} : { resultJson: projection.resultJson }),
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
    ctx, run.requestId, run.principalId, now,
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
  if (routeWorkerConfigured()) {
    await ctx.scheduler.runAfter(0, internal.customerRequestRouteTransportWorker.runNext, {
      workerId: `route-worker:${run.runRef}:${position}`,
    })
  }
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
): Promise<void> {
  await ctx.db.patch(attempt._id, { state: 'outcome_unknown', updatedAt: now })
  await ctx.db.patch(run._id, { state: 'outcome_unknown', updatedAt: now })
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
    ctx, attempt.requestId, attempt.grant.principalId, now,
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
    || publication.readinessValidUntil < attempt.grant.expiresAt) return null
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
    totalSteps: run.totalSteps,
    createdAt: run.createdAt,
  })
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

function routeWorkerConfigured(): boolean {
  return env.AE_ROUTE_CALL_SIGNING_SECRET !== undefined
    && env.AE_ROUTE_CALL_SIGNING_KEY_ID !== undefined
}
