import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isLegacyReferenceableInvocationOutcome } from '@/modules/actions/legacy-invocation-result-compatibility'
import type {
  ActionInvocationTracer,
  ActionInvocationView,
  DecisionRefusalCode,
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
    flushBeforeEffectRelease?: () => Promise<PersistControlResult | undefined>
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
      const authorityFence = options.beforeEffectRelease?.(view, effectGeneration)
      if (authorityFence instanceof Promise) {
        return authorityFence.then((refusal) => {
          if (refusal !== undefined) return refusal
          return persistRelease(view, effectGeneration)
        })
      }
      if (authorityFence !== undefined) return authorityFence
      return persistRelease(view, effectGeneration)
    },
    ...(snapshot === undefined ? {} : { initialSnapshot: snapshot }),
    resolveSourceState: (sourceRef) => {
      const source = options.resolveSourceState(sourceRef)
      if (source.prepared === undefined) throw new Error(`Source ${sourceRef} has no prepared state.`)
      return { ...source, prepared: source.prepared }
    },
  })
  const persistRelease = (view: ActionInvocationView<Result>, effectGeneration: number) => {
      const persistExactRelease = () => persist(
        view.invocationVersion - 1,
        view,
        'begin_release',
        effectGeneration,
      )
      if (options.flushBeforeEffectRelease === undefined) {
        const result = persistExactRelease()
        if (result.kind === 'refused') {
          releaseRefusals.set(view.invocationRef, result.code)
          memory = makeMemory(reconstructSnapshot(options.port, view.invocationRef))
          return result.code
        }
        if (result.kind === 'duplicate') {
          releaseRefusals.set(view.invocationRef, 'reconciliation_required')
          memory = makeMemory(reconstructSnapshot(options.port, view.invocationRef))
          return 'reconciliation_required'
        }
        releaseCommitVersions.set(view.invocationRef, view.invocationVersion)
        return undefined
      }
      return options.flushBeforeEffectRelease().then(async (prior) => {
        if (prior?.kind === 'refused') return prior.code
        const release = persistExactRelease()
        if (release.kind === 'refused') {
          releaseRefusals.set(view.invocationRef, release.code)
          return release.code
        }
        const flushed = await options.flushBeforeEffectRelease?.()
        if (flushed?.kind === 'refused') {
          releaseRefusals.set(view.invocationRef, flushed.code)
          return flushed.code
        }
        if (flushed?.kind === 'duplicate') {
          releaseRefusals.set(view.invocationRef, 'reconciliation_required')
          return 'reconciliation_required'
        }
        releaseCommitVersions.set(view.invocationRef, view.invocationVersion)
        return undefined
      })
  }
  const releaseCommitVersions = new Map<string, number>()
  const releaseRefusals = new Map<string, DecisionRefusalCode>()
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
    const currentAttempt = view.attempts.at(-1)
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
        terminalResultReferenceable: returned.resultReferenceable,
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
      canonicalCommandMaterial: (evidence ?? commandIdentity) as never,
    })
  }

  const accept = (
    beforeVersion: number,
    decision: InvocationDecision<Result>,
    kind: string,
    generation?: number,
  ): InvocationDecision<Result> => {
    if (decision.kind === 'refused') {
      const releaseRefusal = decision.view === undefined
        ? undefined
        : releaseRefusals.get(decision.view.invocationRef)
      if (releaseRefusal !== undefined) {
        releaseRefusals.delete(decision.view!.invocationRef)
        const current = memory.inspect(decision.view!.invocationRef)
        return current === undefined
          ? { kind: 'refused', code: releaseRefusal }
          : {
              kind: 'refused',
              code: releaseRefusal,
              view: { ...current, persistence: 'durable_control' },
            }
      }
      if (
        decision.view !== undefined &&
        decision.view.invocationVersion > beforeVersion &&
        (decision.code === 'reconciliation_required' || decision.code === 'authority_not_accepted')
      ) {
        const result = persist(beforeVersion, decision.view, `${kind}_refused`, generation)
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
    const committedReleaseVersion = releaseCommitVersions.get(decision.view.invocationRef)
    const persistenceVersion = committedReleaseVersion ?? beforeVersion
    releaseCommitVersions.delete(decision.view.invocationRef)
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
    authorizeStandingMandateUse(input) {
      return accept(
        input.expectedInvocationVersion,
        memory.authorizeStandingMandateUse(input),
        'authorize_standing_mandate_use',
      )
    },
    async execute(input) {
      const acquired = accept(input.expectedInvocationVersion, memory.acquire({
        ...input,
        leaseOwner: 'development:execute',
        leaseMs: 30_000,
      }), 'acquire')
      if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
        return acquired
      }
      const flushedAcquisition = await options.flushBeforeEffectRelease?.()
      if (flushedAcquisition?.kind === 'refused') {
        return {
          kind: 'refused',
          code: flushedAcquisition.code,
          view: acquired.view,
        }
      }
      return accept(
        acquired.view.invocationVersion,
        await memory.executeAcquired({
          invocationRef: input.invocationRef,
          expectedInvocationVersion: acquired.view.invocationVersion,
          attemptRef: acquired.view.control.attemptRef,
          leaseOwner: acquired.view.control.leaseOwner,
          effectGeneration: acquired.view.control.effectGeneration,
        }),
        'execute_acquired',
        acquired.view.control.effectGeneration,
      )
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
  const attemptRows = [...port.readAttempts(invocationRef, 100)]
  if (
    row.currentAttemptRef !== undefined &&
    !attemptRows.some(({ attemptRef }) => attemptRef === row.currentAttemptRef)
  ) {
    const currentAttempt = port.readAttempt(invocationRef, row.currentAttemptRef)
    if (currentAttempt !== undefined) attemptRows.push(currentAttempt)
  }
  const attempts = attemptRows
    .sort((left, right) => left.attemptNumber - right.attemptNumber)
    .map(restoreDurableAttempt)
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
      businessOutcome: string
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
  if (row.terminalBusinessOutcome === undefined) {
    return { kind: 'refused', code: 'outcome_not_referenceable' }
  }
  const referenceable = row.terminalResultReferenceable
    ?? isLegacyReferenceableInvocationOutcome(row.terminalBusinessOutcome)
  if (!referenceable) {
    return { kind: 'refused', code: 'outcome_not_referenceable' }
  }
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
