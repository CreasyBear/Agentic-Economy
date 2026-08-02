import type { Infer } from 'convex/values'
import { routeStepGrantValue } from '@/modules/customer-request/runtime'

import {
  isBoundedJsonValue,
  openCapabilityDecisionModel,
  sameCapabilityContractRef,
  type CapabilityInputKey,
  type JsonValue,
  type PointedSchemaIdentity,
} from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import { readJsonPointer } from '@/modules/common/json-pointer'
import { stableUnique } from '@/modules/common/stable-unique'
import {
  type JournalMutationPorts,
  type OutcomeResult,
  type RunProjection,
} from '@/modules/customer-request/route-execution/machines'
import {
  routeAttemptIntegrityValid,
  routeRunIdentityDigest,
  decideSucceededOutcomeBranch,
} from '@/modules/customer-request/route-execution/journal'

import type { RouteStepGrant } from '@/modules/customer-request/route-mandate-admission'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { admitRouteStep } from './customerRequestRouteMandateAdmission'
import { readCurrentRouteMandateStateForPrincipal } from './customerRequestRouteMandate'
import {
  requireAttempt,
  requireRun,
  toAttemptRecord,
  toDispatchRecord,
  toRunRecord,
} from './customerRequestRouteExecutionSnapshots'
import { customerRequestRouteWorkpool } from './customerRequestRouteWorkpool'

type StoredRouteStepGrant = Infer<typeof routeStepGrantValue>

function toStoredRouteStepGrant(value: RouteStepGrant | StoredRouteStepGrant): StoredRouteStepGrant {
  return {
    ...value,
    request: { ...value.request },
    route: { ...value.route },
    step: {
      ...value.step,
      contractRef: { ...value.step.contractRef },
      dataScope: value.step.dataScope.map((scope) => ({
        ...scope,
        recipient: { ...scope.recipient },
        purposes: [...scope.purposes],
      })),
      effects: value.step.effects.map((effect) => ({ ...effect })),
      evidence: value.step.evidence.map((evidence) => ({ ...evidence })),
      cancellation: {
        ...value.step.cancellation,
        evidenceRefs: [...value.step.cancellation.evidenceRefs],
      },
      recovery: { ...value.step.recovery },
    },
    fallbackUse: { ...value.fallbackUse },
    admission: { ...value.admission },
  } satisfies StoredRouteStepGrant
}

function toRouteStepGrantSnapshot(value: unknown): RouteStepGrant {
  const stored = value as StoredRouteStepGrant
  return {
    ...stored,
    request: { ...stored.request },
    route: { ...stored.route },
    step: {
      ...stored.step,
      contractRef: { ...stored.step.contractRef },
      dataScope: stored.step.dataScope.map((scope) => ({
        ...scope,
        recipient: { ...scope.recipient },
        purposes: [...scope.purposes],
      })),
      effects: stored.step.effects.map((effect) => ({ ...effect })),
      evidence: stored.step.evidence.map((evidence) => ({
        ...evidence,
        schemaIdentity: rehydratePointedSchemaIdentity(evidence.schemaIdentity),
      })),
      cancellation: {
        ...stored.step.cancellation,
        evidenceRefs: [...stored.step.cancellation.evidenceRefs],
      },
      recovery: { ...stored.step.recovery },
    },
    fallbackUse: { ...stored.fallbackUse },
    admission: { ...stored.admission },
  }
}

function rehydratePointedSchemaIdentity(value: string): PointedSchemaIdentity {
  return value as PointedSchemaIdentity
}

type DbCtx = MutationCtx | QueryCtx
const PRE_RELEASE_CANCELLATION_WINDOW_MS = 5_000


async function enqueueRouteTransport(
  ctx: MutationCtx,
  dispatchRef: string,
  runAfter: number,
): Promise<void> {
  await customerRequestRouteWorkpool.enqueueAction(
    ctx,
    internal.customerRequestRouteTransportWorker.run,
    { dispatchRef },
    {
      runAfter,
      retry: true,
      onComplete: internal.customerRequestRouteExecution.completeRouteTransportWork,
      context: { dispatchRef },
    },
  )
}

export function journalMutationPorts(ctx: MutationCtx): JournalMutationPorts {
  return {
    now: () => Date.now(),

    loadActiveMandateForPrincipal: async (requestId, principalId, now) => {
      const current = await readCurrentRouteMandateStateForPrincipal(
        ctx, requestId, principalId, now,
      )
      if (current.kind === 'active') return { kind: 'active', mandate: current.mandate }
      if (current.kind === 'expired') return { kind: 'expired' }
      return { kind: 'missing' }
    },

    loadPriorRunCommand: async (commandKey) => {
      const prior = await ctx.db.query('customerRequestRouteRunCommands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      if (prior === null) return null
      return {
        commandDigest: prior.commandDigest,
        principalId: prior.principalId,
        requestId: prior.requestId,
        runRef: prior.runRef,
      }
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

    loadRunByMandateRef: async (mandateRef) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_mandateRef', (query) => query.eq('mandateRef', mandateRef)).unique()
      return run === null ? null : toRunRecord(run)
    },

    loadRunByRunRef: async (runRef) => {
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
      return run === null ? null : toRunRecord(run)
    },

    loadAttemptAtPosition: async (runRef, position) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_runRef_and_position', (query) => (
          query.eq('runRef', runRef).eq('position', position)
        )).unique()
      return attempt === null ? null : toAttemptRecord(attempt, toRouteStepGrantSnapshot)
    },

    loadAttemptByRef: async (attemptRef) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
      return attempt === null ? null : toAttemptRecord(attempt, toRouteStepGrantSnapshot)
    },

    loadDispatchByAttemptRef: async (attemptRef) => {
      const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
      return dispatch === null ? null : toDispatchRecord(dispatch)
    },

    snapshotRouteBusinesses: async (steps) => await snapshotRouteBusinesses(ctx, steps),

    materializeStepInput: async (request) => await materializeStepInput(ctx, request),

    admitRouteStep: async (input) => {
      const result = await admitRouteStep(ctx, {
        requestId: input.requestId,
        mandateRef: input.mandateRef,
        expectedMandateDigest: input.expectedMandateDigest,
        expectedGenerationRef: input.expectedGenerationRef,
        expectedRoutePlanId: input.expectedRoutePlanId,
        expectedRouteDigest: input.expectedRouteDigest,
        stepPosition: input.stepPosition,
        expectedActionId: input.expectedActionId,
        expectedCapabilityId: input.expectedCapabilityId,
        expectedCapabilityVersion: input.expectedCapabilityVersion,
        expectedCapabilityContractDigest: input.expectedCapabilityContractDigest,
        idempotencyKey: input.idempotencyKey,
      }, input.principalId)
      return 'grant' in result
        ? { ...result, grant: toRouteStepGrantSnapshot(result.grant) }
        : result
    },

    commitCommandReplay: async (runRef) => {
      const replayed = await readRunProjection(ctx, runRef)
      if (replayed === null) throw new Error('customer_request_route_run_command_integrity_failure')
      return { kind: 'replayed', run: replayed }
    },

    commitResumedRun: async (input) => {
      const resumed = await readRunProjection(ctx, input.runRef)
      if (resumed === null) throw new Error('customer_request_route_run_integrity_failure')
      if (input.headMissing) {
        await ctx.db.insert('customerRequestRouteRunHeads', {
          requestId: input.requestId,
          principalId: input.principalId,
          currentRunRef: input.runRef,
          currentMandateRef: input.mandateRef,
          createdAt: input.runCreatedAt,
          updatedAt: input.now,
        })
      }
      await ctx.db.insert('customerRequestRouteRunCommands', {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        principalId: input.principalId,
        requestId: input.requestId,
        runRef: input.runRef,
        committedAt: input.now,
      })
      return { kind: 'resumed', run: resumed }
    },

    cancelPriorUnreleasedRun: async (input) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', input.attemptRef)).unique()
      const outbox = await ctx.db.query('customerRequestRouteDispatchOutbox')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', input.attemptRef)).unique()
      const run = await ctx.db.query('customerRequestRouteRuns')
        .withIndex('by_runRef', (query) => query.eq('runRef', input.runRef)).unique()
      if (attempt === null || outbox === null || run === null) {
        throw new Error('customer_request_route_dispatch_integrity_failure')
      }
      await ctx.db.patch(attempt._id, { state: 'cancelled', updatedAt: input.now })
      await ctx.db.patch(outbox._id, { state: 'cancelled', updatedAt: input.now })
      await ctx.db.patch(run._id, { state: 'cancelled', updatedAt: input.now })
    },

    commitStartedRun: async (input) => {
      await ctx.db.insert('customerRequestRouteRuns', {
        runRef: input.runRef,
        runDigest: input.runDigest,
        ...input.runMaterial,
        businesses: [...input.runMaterial.businesses],
      })
      const headRow = await ctx.db.query('customerRequestRouteRunHeads')
        .withIndex('by_requestId', (query) => query.eq('requestId', input.requestId)).unique()
      if (headRow === null) {
        await ctx.db.insert('customerRequestRouteRunHeads', {
          requestId: input.requestId,
          principalId: input.principalId,
          currentRunRef: input.runRef,
          currentMandateRef: input.mandate.mandateRef,
          createdAt: input.now,
          updatedAt: input.now,
        })
      } else {
        await ctx.db.patch(headRow._id, {
          currentRunRef: input.runRef,
          currentMandateRef: input.mandate.mandateRef,
          updatedAt: input.now,
        })
      }
      await ctx.db.insert('customerRequestRouteStepAttempts', {
        attemptRef: input.attemptRef,
        attemptDigest: input.attemptDigest,
        runRef: input.runRef,
        requestId: input.requestId,
        mandateRef: input.mandate.mandateRef,
        actionId: input.actionId,
        position: input.position,
        operationKeyDigest: input.grant.operationKeyDigest,
        grant: toStoredRouteStepGrant(input.grant),
        inputJson: JSON.stringify(input.input),
        inputDigest: input.inputDigest,
        state: 'queued',
        createdAt: input.now,
        updatedAt: input.now,
      })
      await ctx.db.insert('customerRequestRouteDispatchOutbox', {
        dispatchRef: input.dispatchRef,
        dispatchDigest: input.dispatchDigest,
        runRef: input.runRef,
        attemptRef: input.attemptRef,
        operationKeyDigest: input.grant.operationKeyDigest,
        state: 'pending',
        availableAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      })
      await ctx.db.insert('customerRequestRouteRunCommands', {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        principalId: input.principalId,
        requestId: input.requestId,
        runRef: input.runRef,
        committedAt: input.now,
      })
      await enqueueRouteTransport(
        ctx,
        input.dispatchRef,
        PRE_RELEASE_CANCELLATION_WINDOW_MS,
      )
      const run = await readRunProjection(ctx, input.runRef)
      if (run === null) throw new Error('customer_request_route_run_write_integrity_failure')
      return { kind: 'started', run }
    },


    validateAttemptOutput: async (attemptRef, output) => {
      const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
        .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
      if (attempt === null) return null
      return await validateAttemptOutput(ctx, attempt, output)
    },

    commitPartialOutcome: async (input) => {
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      if (input.validated === null) {
        await ctx.db.patch(attempt._id, input.observationPatch)
        await markUnknownOutcome(ctx, run, attempt, input.now)
      } else {
        const partialResult: JsonValue = { kind: 'partial_result', output: input.validated.output }
        await ctx.db.patch(attempt._id, {
          outputJson: JSON.stringify(input.validated.output),
          outputDigest: canonicalDigest(input.validated.output),
          evidence: [...input.validated.evidence],
          ...input.observationPatch,
        })
        await markUnknownOutcome(ctx, run, attempt, input.now, partialResult)
      }
      const partial = await readRunProjection(ctx, run.runRef)
      if (partial === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'outcome_unknown', run: partial }
    },

    commitUnknownOutcome: async (input) => {
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      await ctx.db.patch(attempt._id, input.observationPatch)
      await markUnknownOutcome(ctx, run, attempt, input.now)
      const unknown = await readRunProjection(ctx, run.runRef)
      if (unknown === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'outcome_unknown', run: unknown }
    },

    commitFailedOutcome: async (input) => {
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      const failure: JsonValue = { reason: 'business_reported_failure' }
      await ctx.db.patch(attempt._id, {
        state: 'failed', ...input.observationPatch, updatedAt: input.now,
      })
      await ctx.db.patch(run._id, {
        state: 'failed',
        resultJson: JSON.stringify(failure),
        resultDigest: canonicalDigest(failure),
        updatedAt: input.now,
      })
      const failed = await readRunProjection(ctx, run.runRef)
      if (failed === null) throw new Error('customer_request_route_run_integrity_failure')
      return { kind: 'failed', run: failed }
    },

    commitSucceededOutcome: async (input) => {
      const attempt = await requireAttempt(ctx, input.attemptRef)
      const run = await requireRun(ctx, input.runRef)
      await persistSucceededAttempt(ctx, attempt, input)
      const cancellation = await ctx.db.query('customerRequestRouteCancellationCommands')
        .withIndex('by_runRef_and_committedAt', (query) => query.eq('runRef', run.runRef))
        .order('desc')
        .first()
      const branch = decideSucceededOutcomeBranch({
        attemptPosition: attempt.position,
        totalSteps: run.totalSteps,
        cancellationResult: cancellation?.result,
      })
      switch (branch) {
        case 'pending_cancellation_replay':
          return await applyPendingCancellationReplay(ctx, run, attempt.position, input.now)
        case 'too_late_cancellation':
          return await applyTooLateCancellation(ctx, run, attempt.position, input.now)
        case 'complete_final_step':
          return await completeRunOnFinalStep(ctx, run, input.validated.output, input.now)
        case 'advance_or_unknown': {
          const next = await queueNextStep(ctx, run, attempt.position + 1, input.now)
          if (!next) {
            await markUnknownOutcome(ctx, run, attempt, input.now)
            const unknown = await readRunProjection(ctx, run.runRef)
            if (unknown === null) throw new Error('customer_request_route_run_integrity_failure')
            return { kind: 'outcome_unknown', run: unknown }
          }
          const advanced = await readRunProjection(ctx, run.runRef)
          if (advanced === null) throw new Error('customer_request_route_run_integrity_failure')
          return { kind: 'advanced', run: advanced }
        }
        default: {
          const _exhaustive: never = branch
          return _exhaustive
        }
      }
    },

    loadSucceededReplay: async (input) => {
      const replayed = await readRunProjection(ctx, input.runRef)
      if (replayed === null) throw new Error('customer_request_route_run_integrity_failure')
      return {
        kind: input.runState === 'completed' ? 'completed' : 'replayed',
        run: replayed,
      }
    },
  }
}

export async function persistSucceededAttempt(
  ctx: MutationCtx,
  attempt: Doc<'customerRequestRouteStepAttempts'>,
  input: Readonly<{
    now: number
    validated: Readonly<{
      output: JsonValue
      evidence: readonly Readonly<{
        evidenceId: string
        outputPointer: string
        schemaIdentity: string
        valueDigest: string
      }>[]
    }>
    observationPatch: Readonly<{
      transportObservationJson?: string
      transportObservationDigest?: string
    }>
  }>,
): Promise<void> {
  await ctx.db.patch(attempt._id, {
    state: 'succeeded',
    outputJson: JSON.stringify(input.validated.output),
    outputDigest: canonicalDigest(input.validated.output),
    evidence: [...input.validated.evidence],
    ...input.observationPatch,
    updatedAt: input.now,
  })
}

export async function applyPendingCancellationReplay(
  ctx: MutationCtx,
  run: Doc<'customerRequestRouteRuns'>,
  attemptPosition: number,
  now: number,
): Promise<OutcomeResult> {
  await ctx.db.patch(run._id, {
    completedSteps: attemptPosition,
    currentPosition: attemptPosition,
    updatedAt: now,
  })
  const pendingCancellation = await readRunProjection(ctx, run.runRef)
  if (pendingCancellation === null) {
    throw new Error('customer_request_route_run_integrity_failure')
  }
  return { kind: 'replayed', run: pendingCancellation }
}

export async function applyTooLateCancellation(
  ctx: MutationCtx,
  run: Doc<'customerRequestRouteRuns'>,
  attemptPosition: number,
  now: number,
): Promise<OutcomeResult> {
  await ctx.db.patch(run._id, {
    state: 'cancelled',
    completedSteps: attemptPosition,
    currentPosition: attemptPosition,
    updatedAt: now,
  })
  const cancelled = await readRunProjection(ctx, run.runRef)
  if (cancelled === null) throw new Error('customer_request_route_run_integrity_failure')
  return { kind: 'cancelled', run: cancelled }
}

export async function completeRunOnFinalStep(
  ctx: MutationCtx,
  run: Doc<'customerRequestRouteRuns'>,
  output: JsonValue,
  now: number,
): Promise<OutcomeResult> {
  await ctx.db.patch(run._id, {
    state: 'completed',
    completedSteps: run.totalSteps,
    resultJson: JSON.stringify(output),
    resultDigest: canonicalDigest(output),
    updatedAt: now,
  })
  const completed = await readRunProjection(ctx, run.runRef)
  if (completed === null) throw new Error('customer_request_route_run_integrity_failure')
  return { kind: 'completed', run: completed }
}

export async function readRunProjection(
  ctx: DbCtx,
  runRef: string,
): Promise<RunProjection | null> {
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
  return {
    runRef,
    requestId: run.requestId,
    requestRevision: run.requestRevision,
    generationRef: run.generationRef,
    ...(run.businesses === undefined ? {} : {
      businesses: run.businesses.map((business) => ({ ...business })),
    }),
    state: run.state,
    totalSteps: run.totalSteps,
    completedSteps: run.completedSteps,
    currentPosition: run.currentPosition,
    currentState: current.state,
    ...(run.resultJson === undefined ? {} : { resultJson: run.resultJson }),
    ...(current.state === 'queued'
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
        : cancellationAttempt?.state === 'rejected'
          ? {
              cancellationAttempt: {
                state: 'rejected' as const,
                requestedAt: cancellationAttempt.requestedAt,
                observedAt: cancellationAttempt.resolvedAt ?? cancellationAttempt.updatedAt,
                reason: cancellationAttempt.reason ?? 'provider_rejected_cancellation',
              },
            }
          : {}),
    updatedAt: run.updatedAt,
  }
}

export async function markUnknownOutcome(
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

export async function queueNextStep(
  ctx: MutationCtx,
  run: Doc<'customerRequestRouteRuns'>,
  position: number,
  now: number,
): Promise<boolean> {
  const mandateState = await readCurrentRouteMandateStateForPrincipal(
    ctx, run.requestId, run.principalId, now, { requireCurrentGraph: false },
  )
  if (mandateState.kind !== 'active' || mandateState.mandate.mandateRef !== run.mandateRef) {
    return false
  }
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
    const sourceOutput = source?.outputJson === undefined
      ? undefined
      : parseBoundedJson(source.outputJson)
    if (source?.state !== 'succeeded' || sourceOutput === undefined || evidence === undefined) {
      return false
    }
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
    grant: toStoredRouteStepGrant(admission.grant),
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
  await enqueueRouteTransport(
    ctx,
    `route-dispatch:v1:${dispatchDigest}`,
    PRE_RELEASE_CANCELLATION_WINDOW_MS,
  )
  await ctx.db.patch(run._id, {
    state: 'running', completedSteps: position - 1, currentPosition: position, updatedAt: now,
  })
  return true
}


async function materializeStepInput(
  ctx: MutationCtx,
  request: Readonly<{
    requestId: string
    generationRef: string
    routePlanId: string
    routeDigest: string
    position: number
    actionId: string
    contractRef: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
    upstreamOutputs: ReadonlyMap<string, JsonValue>
  }>,
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
    model = openCapabilityDecisionModel(
      encodeCapabilityContractDocumentJson(stored.documentJson).contract,
    )
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
    model = openCapabilityDecisionModel(
      encodeCapabilityContractDocumentJson(stored.documentJson).contract,
    )
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

async function snapshotRouteBusinesses(
  ctx: MutationCtx,
  steps: readonly Readonly<{ businessId: string }>[],
): Promise<Array<{ businessRef: string; name: string }> | undefined> {
  const businessIds = stableUnique(steps.map(({ businessId }) => businessId))
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


