import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  ActionInvocationTracer,
  ActionInvocationView,
  InMemoryControlSnapshot,
  InvocationDecision,
  PreparedInvocation,
} from './contracts'
import { createInMemoryActionInvocationTracer } from './in-memory'
import type {
  DurableActionInvocationPort,
  DurableAttemptRow,
  DurableControlRow,
  PersistControlResult,
} from './internal/durable-contracts'
import {
  projectDurableAttempt,
  restoreDurableAttempt,
} from './internal/durable-contracts'
import type { InMemoryTracerOptions } from './in-memory-record-store'

export type DurableTracerOptions<Input, Result extends ActionResult> =
  Omit<InMemoryTracerOptions<Input, Result>, 'initialSnapshot' | 'resolveSourceState'> & Readonly<{
    port: DurableActionInvocationPort<Result>
    resolveSourceState(sourceRef: string): Readonly<{
      input: Input
      context: ActionContext
      prepared: PreparedInvocation | undefined
      observedResolution: ActionInvocationView<Result>['observedResolution']
      resultIdentity?: Readonly<{ sourceResultRef: string; resultDigest: string }>
    }>
  }>

export type DurableActionInvocationTracer<Input, Result extends ActionResult> =
  ActionInvocationTracer<Input, Result> & Readonly<{
    coldResume(invocationRef: string): DurableActionInvocationTracer<Input, Result>
    recordLateObservation(input: Readonly<{
      invocationRef: string
      commandId: string
      effectGeneration: number
      actorRef: string
      sourceEvidenceRef: string
      release: 'not_released' | 'released' | 'possibly_released'
      evidenceDigest: string
    }>): PersistControlResult
  }>

export function createDurableActionInvocationTracer<Input, Result extends ActionResult>(
  options: DurableTracerOptions<Input, Result>,
  resumeInvocationRef?: string,
): DurableActionInvocationTracer<Input, Result> {
  const resumed = resumeInvocationRef === undefined
    ? undefined
    : reconstructSnapshot(options.port, resumeInvocationRef)
  const makeMemory = (snapshot = resumed) => createInMemoryActionInvocationTracer({
    ...options,
    beforeEffectRelease: (view, effectGeneration) => {
      const durableVersion = options.port.readControl(view.invocationRef)?.invocationVersion
      if (durableVersion === undefined) return 'stale_invocation_version'
      const durableGeneration =
        options.port.readControl(view.invocationRef)?.currentEffectGeneration
      const result = persist(
        durableVersion,
        view,
        'begin_release',
        durableGeneration === undefined ? undefined : effectGeneration,
      )
      return result.kind === 'refused' ? result.code : undefined
    },
    ...(snapshot === undefined ? {} : { initialSnapshot: snapshot }),
    resolveSourceState: (sourceRef) => {
      const source = options.resolveSourceState(sourceRef)
      if (source.prepared === undefined) throw new Error(`Source ${sourceRef} has no prepared state.`)
      return { ...source, prepared: source.prepared }
    },
  })
  let memory = makeMemory()

  const persist = (
    beforeVersion: number | null,
    view: ActionInvocationView<Result>,
    kind: string,
    expectedEffectGeneration?: number,
    evidence?: import('./reconciliation-evidence').ReconciliationEvidence,
  ): PersistControlResult => {
    const snapshot = memory.exportSnapshot()
    const record = snapshot.records.find(({ control }) => control.invocationRef === view.invocationRef)
    if (record === undefined) throw new Error(`Missing control snapshot for ${view.invocationRef}.`)
    const { attempts: _attempts, ...controlProjection } = record.control
    const leasedControl = view.control.state === 'leased' ? view.control : undefined
    const currentAttempt = leasedControl === undefined
      ? undefined
      : view.attempts.find(({ attemptRef }) => attemptRef === leasedControl.attemptRef)
    const sourceState = options.resolveSourceState(record.sourceRef)
    const returned = view.observedResolution.state === 'returned'
      ? view.observedResolution
      : undefined
    if (
      returned !== undefined &&
      sourceState.resultIdentity !== undefined &&
      sourceState.resultIdentity.resultDigest !== canonicalDigest(returned.result as never)
    ) throw new Error(`Source result digest mismatch for ${view.invocationRef}.`)
    const row: DurableControlRow<Result> = {
      invocationRef: view.invocationRef,
      invocationVersion: view.invocationVersion,
      sourceRef: record.sourceRef,
      ...(returned === undefined || sourceState.resultIdentity === undefined ? {} : {
        sourceResultRef: sourceState.resultIdentity.sourceResultRef,
        sourceResultDigest: sourceState.resultIdentity.resultDigest,
        terminalBusinessOutcome: returned.businessOutcome,
      }),
      control: { ...controlProjection, persistence: 'durable_control' },
      ...(record.authorityBinding === undefined ? {} : { authorityBinding: record.authorityBinding }),
      ...(view.prepared === undefined ? {} : {
        preparedMaterialDigest: view.prepared.materialInputDigest,
        preparedTargetDigest: canonicalDigest(view.prepared.target),
        consequence: view.prepared.consequence,
        dataLimitSummary: view.prepared.dataUse.limits,
      }),
      ...(view.control.state === 'authorized' ? { authorityDecisionAt: view.control.decidedAt } : {}),
      ...(currentAttempt === undefined ? {} : {
        currentAttemptRef: currentAttempt.attemptRef,
        currentEffectGeneration: currentAttempt.effectGeneration,
        currentLeaseOwner: currentAttempt.lease.owner,
        currentLeaseExpiresAt: currentAttempt.lease.expiresAt,
      }),
      updatedAt: options.now(),
    }
    const latestViewAttempt = view.attempts.at(-1)
    const projectedAttempt = latestViewAttempt === undefined
      ? undefined
      : projectDurableAttempt(view.invocationRef, latestViewAttempt, options.now())
    const durableAttempt = projectedAttempt === undefined
      ? undefined
      : options.port.readAttempt(view.invocationRef, projectedAttempt.attemptRef)
    const attemptUpdate: DurableAttemptRow | undefined =
      projectedAttempt !== undefined &&
      (
        durableAttempt === undefined ||
        canonicalDigest(projectedAttempt as never) !== canonicalDigest(durableAttempt as never)
      )
        ? projectedAttempt
        : undefined
    const commandIdentity = {
      invocationRef: view.invocationRef,
      expectedInvocationVersion: beforeVersion,
      expectedEffectGeneration: expectedEffectGeneration ?? null,
      kind,
      nextInvocationVersion: view.invocationVersion,
      control: view.control,
    }
    const commandDigest = evidence === undefined
      ? canonicalDigest(commandIdentity)
      : canonicalDigest(evidence)
    const commandId = evidence === undefined
      ? `${view.invocationRef}:${beforeVersion ?? 'create'}:${kind}`
      : `${view.invocationRef}:reconciliation-evidence:${evidence.evidenceRef}`
    return options.port.transact({
      commandId,
      commandDigest,
      expectedInvocationVersion: beforeVersion,
      ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
      row,
      ...(attemptUpdate === undefined ? {} : { currentAttemptWrite: attemptUpdate }),
      history: {
        invocationRef: view.invocationRef,
        commandId,
        commandDigest,
        commandResult: 'applied',
        kind,
        ...(evidence === undefined ? {} : {
          effectGeneration: evidence.effectGeneration,
          sourceEvidenceRef: evidence.evidenceRef,
          observation: {
            kind: 'release_observation' as const,
            release: evidence.resolution,
            evidenceDigest: evidence.digest,
          },
        }),
        ...(attemptUpdate === undefined || durableAttempt === undefined ? {} : {
          attemptTransition: {
            attemptRef: attemptUpdate.attemptRef,
            effectGeneration: attemptUpdate.effectGeneration,
            priorDigest: canonicalDigest(durableAttempt as never),
            nextDigest: canonicalDigest(attemptUpdate as never),
            priorReleaseState: durableAttempt.release.state,
            nextReleaseState: attemptUpdate.release.state,
            priorOutcomeState: durableAttempt.outcome.state,
            nextOutcomeState: attemptUpdate.outcome.state,
          },
        }),
      },
    })
  }

  const accept = (
    beforeVersion: number,
    decision: InvocationDecision<Result>,
    kind: string,
    generation?: number,
  ): InvocationDecision<Result> => {
    if (decision.kind === 'refused') {
      if (
        decision.view !== undefined &&
        decision.view.invocationVersion > beforeVersion &&
        decision.code === 'reconciliation_required'
      ) {
        const result = persist(beforeVersion, decision.view, `${kind}_expired`, generation)
        if (result.kind === 'refused') {
          memory = makeMemory(reconstructSnapshot(options.port, decision.view.invocationRef))
          const durableView = memory.inspect(decision.view.invocationRef)
          return durableView === undefined
            ? { kind: 'refused', code: result.code }
            : { kind: 'refused', code: result.code, view: durableView }
        }
        return { ...decision, view: { ...decision.view, persistence: 'durable_control' } }
      }
      return decision
    }
    const persistenceVersion =
      (kind === 'execute' || kind === 'execute_acquired') &&
        decision.view.invocationVersion > beforeVersion + 1
        ? decision.view.invocationVersion - 1
        : beforeVersion
    const result = persist(persistenceVersion, decision.view, kind, generation)
    if (result.kind === 'refused') {
      memory = makeMemory(reconstructSnapshot(options.port, decision.view.invocationRef))
      const durableView = memory.inspect(decision.view.invocationRef)
      return durableView === undefined
        ? { kind: 'refused', code: result.code }
        : { kind: 'refused', code: result.code, view: durableView }
    }
    return { ...decision, view: { ...decision.view, persistence: 'durable_control' } }
  }

  return {
    async invoke(input) {
      const view = await memory.invoke(input)
      const result = persist(null, view, 'invoke')
      if (result.kind === 'refused') throw new Error(`Durable invoke refused: ${result.code}`)
      return { ...view, persistence: 'durable_control' }
    },
    prepare(input) {
      const view = memory.prepare(input)
      const result = persist(null, view, 'prepare')
      if (result.kind === 'refused') throw new Error(`Durable prepare refused: ${result.code}`)
      return { ...view, persistence: 'durable_control' }
    },
    decide(input) {
      return accept(input.expectedInvocationVersion, memory.decide(input), 'decide')
    },
    async execute(input) {
      return accept(input.expectedInvocationVersion, await memory.execute(input), 'execute')
    },
    acquire(input) {
      return accept(input.expectedInvocationVersion, memory.acquire(input), 'acquire')
    },
    async executeAcquired(input) {
      return accept(
        input.expectedInvocationVersion,
        await memory.executeAcquired(input),
        'execute_acquired',
        input.effectGeneration,
      )
    },
    publishObservation(input) {
      return accept(
        input.expectedInvocationVersion,
        memory.publishObservation(input),
        'publish_observation',
        input.effectGeneration,
      )
    },
    cancel(input) {
      return accept(input.expectedInvocationVersion, memory.cancel(input), 'cancel')
    },
    reconcile(input) {
      const commandId = `${input.invocationRef}:reconciliation-evidence:${input.evidence.evidenceRef}`
      const prior = options.port.readHistoryCommand(input.invocationRef, commandId)
      if (prior !== undefined) {
        const current = memory.inspect(input.invocationRef)
        if (current === undefined) return { kind: 'refused', code: 'invocation_not_found' }
        if (
          current.owner.callerRef !== input.actor.callerRef ||
          current.owner.principalRef !== input.actor.principalRef
        ) return { kind: 'refused', code: 'cross_principal_refused', view: current }
        if (JSON.stringify(current.origin) !== JSON.stringify(input.origin)) {
          return { kind: 'refused', code: 'cross_origin_refused', view: current }
        }
        return prior.commandDigest === canonicalDigest(input.evidence)
          ? { kind: 'accepted', view: { ...current, persistence: 'durable_control' } }
          : { kind: 'refused', code: 'command_identity_conflict', view: current }
      }
      const decision = memory.reconcile(input)
      if (decision.kind !== 'accepted') return decision
      const result = persist(
        input.expectedInvocationVersion,
        decision.view,
        'reconcile',
        undefined,
        input.evidence,
      )
      if (result.kind === 'refused') {
        memory = makeMemory(reconstructSnapshot(options.port, input.invocationRef))
        const durableView = memory.inspect(input.invocationRef)
        return durableView === undefined
          ? { kind: 'refused', code: result.code }
          : { kind: 'refused', code: result.code, view: durableView }
      }
      return { kind: 'accepted', view: { ...decision.view, persistence: 'durable_control' } }
    },
    inspect(invocationRef) {
      const view = memory.inspect(invocationRef)
      return view === undefined ? undefined : { ...view, persistence: 'durable_control' }
    },
    exportSnapshot: memory.exportSnapshot,
    coldResume(invocationRef) {
      return createDurableActionInvocationTracer(options, invocationRef)
    },
    recordLateObservation(input) {
      return options.port.recordLateObservation({ ...input, recordedAt: options.now() })
    },
  }
}

function reconstructSnapshot<Input, Result extends ActionResult>(
  port: DurableActionInvocationPort<Result>,
  invocationRef: string,
): InMemoryControlSnapshot<Input, Result> {
  const row = port.readControl(invocationRef)
  if (row === undefined) throw new Error(`Missing durable invocation ${invocationRef}.`)
  const attempts = port.readAttempts(invocationRef, 100).map(restoreDurableAttempt)
  return {
    format: 'action-invocation-control:development:v1',
    records: [{
      sourceRef: row.sourceRef,
      control: {
        ...row.control,
        persistence: 'in_memory_only',
        attempts,
      },
      ...(row.authorityBinding === undefined ? {} : { authorityBinding: row.authorityBinding }),
    }],
  }
}

export type { DurableActionInvocationPort } from './internal/durable-contracts'
export {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
} from './internal/development-durable-port'
export type { AsyncDurableActionInvocationPort } from './internal/async-durable-port'

export type CompletedResultIdentity =
  | Readonly<{
      kind: 'completed_result'
      invocationRef: string
      actionId: string
      actionVersion: string
      sourceRef: string
      sourceResultRef: string
      resultDigest: string
      businessOutcome: 'queued_communication' | 'completed'
    }>
  | Readonly<{ kind: 'refused'; code:
    | 'invocation_not_found'
    | 'cross_principal_refused'
    | 'request_owned_refused'
    | 'invocation_not_terminal'
    | 'outcome_not_referenceable'
    | 'source_result_mismatch'
  }>

export function readCompletedResultIdentity<Result extends ActionResult>(
  port: DurableActionInvocationPort<Result>,
  invocationRef: string,
  actor: Readonly<{ callerRef: string; principalRef: string }>,
  resolve: (sourceRef: string) => Readonly<{
    sourceResultRef?: string
    result?: Result
  }>,
): CompletedResultIdentity {
  const row = port.readControl(invocationRef)
  if (row === undefined) return { kind: 'refused', code: 'invocation_not_found' }
  if (
    row.control.owner.callerRef !== actor.callerRef ||
    row.control.owner.principalRef !== actor.principalRef
  ) return { kind: 'refused', code: 'cross_principal_refused' }
  if (row.control.origin.kind !== 'standalone') {
    return { kind: 'refused', code: 'request_owned_refused' }
  }
  if (
    row.control.control.state !== 'terminal' ||
    row.sourceResultRef === undefined ||
    row.sourceResultDigest === undefined
  ) return { kind: 'refused', code: 'invocation_not_terminal' }
  if (
    row.terminalBusinessOutcome !== 'queued_communication' &&
    row.terminalBusinessOutcome !== 'completed'
  ) return { kind: 'refused', code: 'outcome_not_referenceable' }
  const source = resolve(row.sourceRef)
  if (
    source.sourceResultRef !== row.sourceResultRef ||
    source.result === undefined ||
    canonicalDigest(source.result as never) !== row.sourceResultDigest
  ) return { kind: 'refused', code: 'source_result_mismatch' }
  return {
    kind: 'completed_result',
    invocationRef,
    actionId: row.control.action.id,
    actionVersion: row.control.action.contractVersion,
    sourceRef: row.sourceRef,
    sourceResultRef: row.sourceResultRef,
    resultDigest: row.sourceResultDigest,
    businessOutcome: row.terminalBusinessOutcome,
  }
}
