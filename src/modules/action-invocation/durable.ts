import type { ActionContext, ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
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
import type { ReconciliationEvidence } from './reconciliation-evidence'

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
export function cancellationCommandMaterial(input: Readonly<{
  invocationRef: string
  idempotencyKey: string
}>): StableHashValue {
  return {
    format: 'action-invocation-cancel:v1',
    invocationRef: input.invocationRef,
    idempotencyKey: input.idempotencyKey,
  }
}
type DurableView<Result extends ActionResult> = ActionInvocationView<Result> & Readonly<{
  persistence: 'durable_control'
}>

function durableView<Result extends ActionResult>(
  view: ActionInvocationView<Result>,
): DurableView<Result> {
  return { ...view, persistence: 'durable_control' }
}

export type DurableActionInvocationTracer<Input, Result extends ActionResult> =
  ActionInvocationTracer<Input, Result> & Readonly<{
    coldResume(invocationRef: string): Promise<DurableActionInvocationTracer<Input, Result>>
    recordLateObservation(input: Readonly<{
      invocationRef: string
      commandId: string
      effectGeneration: number
      actorRef: string
      sourceEvidenceRef: string
      release: 'not_released' | 'released' | 'possibly_released'
      evidenceDigest: string
    }>): Promise<PersistControlResult>
  }>

export function createDurableActionInvocationTracer<Input, Result extends ActionResult>(
  options: DurableTracerOptions<Input, Result>,
  initialSnapshot?: InMemoryControlSnapshot<Result>,
): DurableActionInvocationTracer<Input, Result> {
  return createDurableActionInvocationTracerWithSnapshot(options, initialSnapshot)
}

function createDurableActionInvocationTracerWithSnapshot<Input, Result extends ActionResult>(
  options: DurableTracerOptions<Input, Result>,
  resumed?: InMemoryControlSnapshot<Result>,
): DurableActionInvocationTracer<Input, Result> {
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
  const persistRelease = async (
    view: ActionInvocationView<Result>,
    effectGeneration: number,
  ): Promise<DecisionRefusalCode | undefined> => {
    const persistExactRelease = () => persist(
      view.invocationVersion - 1,
      view,
      'begin_release',
      effectGeneration,
    )
    if (options.flushBeforeEffectRelease === undefined) {
      const result = await persistExactRelease()
      if (result.kind === 'refused') {
        releaseRefusals.set(view.invocationRef, result.code)
        memory = makeMemory(await reconstructSnapshot(options.port, view.invocationRef))
        return result.code
      }
      if (result.kind === 'duplicate') {
        releaseRefusals.set(view.invocationRef, 'reconciliation_required')
        memory = makeMemory(await reconstructSnapshot(options.port, view.invocationRef))
        return 'reconciliation_required'
      }
      releaseCommitVersions.set(view.invocationRef, view.invocationVersion)
      return undefined
    }
    const prior = await options.flushBeforeEffectRelease()
    if (prior?.kind === 'refused') return prior.code
    const release = await persistExactRelease()
    if (release.kind === 'refused') {
      releaseRefusals.set(view.invocationRef, release.code)
      return release.code
    }
    const flushed = await options.flushBeforeEffectRelease()
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
  }
  const releaseCommitVersions = new Map<string, number>()
  const releaseRefusals = new Map<string, DecisionRefusalCode>()
  const persist = async (
    beforeVersion: number | null,
    view: ActionInvocationView<Result>,
    kind: string,
    expectedEffectGeneration?: number,
    evidence?: ReconciliationEvidence,
    canonicalCommandMaterialOverride?: StableHashValue,
    commandIdOverride?: string,
  ): Promise<PersistControlResult> => {
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
      control: controlProjection,
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
      : await options.port.readAttempt(view.invocationRef, projectedAttempt.attemptRef)
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
    const commandMaterial = evidence ?? canonicalCommandMaterialOverride ?? commandIdentity
    const commandDigest = canonicalDigest(commandMaterial)
    const commandId = evidence === undefined
      ? commandIdOverride ?? `${view.invocationRef}:${beforeVersion ?? 'create'}:${kind}`
      : `${view.invocationRef}:reconciliation-evidence:${evidence.evidenceRef}`
    return await options.port.transact({
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
      canonicalCommandMaterial: commandMaterial,
    })
  }
  let memory = makeMemory()

  const accept = async (
    beforeVersion: number,
    decision: InvocationDecision<Result>,
    kind: string,
    generation?: number,
    canonicalCommandMaterialOverride?: StableHashValue,
    commandIdOverride?: string,
  ): Promise<InvocationDecision<Result>> => {
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
              view: durableView(current),
            }
      }
      if (
        decision.view !== undefined &&
        decision.view.invocationVersion > beforeVersion &&
        (decision.code === 'reconciliation_required' || decision.code === 'authority_not_accepted')
      ) {
        const result = await persist(beforeVersion, decision.view, `${kind}_refused`, generation)
        if (result.kind === 'refused') {
          memory = makeMemory(await reconstructSnapshot(options.port, decision.view.invocationRef))
          const durableStateView = memory.inspect(decision.view.invocationRef)
          return durableStateView === undefined
            ? { kind: 'refused', code: result.code }
            : { kind: 'refused', code: result.code, view: durableView(durableStateView) }
        }
        return { ...decision, view: durableView(decision.view) }
      }
      if (decision.view === undefined) return decision
      return { ...decision, view: durableView(decision.view) }
    }
    const committedReleaseVersion = releaseCommitVersions.get(decision.view.invocationRef)
    const persistenceVersion = committedReleaseVersion ?? beforeVersion
    releaseCommitVersions.delete(decision.view.invocationRef)
    const result = await persist(
      persistenceVersion,
      decision.view,
      kind,
      generation,
      undefined,
      canonicalCommandMaterialOverride,
      commandIdOverride,
    )
    if (result.kind === 'refused') {
      memory = makeMemory(await reconstructSnapshot(options.port, decision.view.invocationRef))
      const durableStateView = memory.inspect(decision.view.invocationRef)
      return durableStateView === undefined
        ? { kind: 'refused', code: result.code }
        : { kind: 'refused', code: result.code, view: durableView(durableStateView) }
    }
    return { ...decision, view: durableView(decision.view) }
  }

  return {
    async invoke(input) {
      const view = await memory.invoke(input)
      const result = await persist(null, view, 'invoke')
      if (result.kind === 'refused') throw new Error(`Durable invoke refused: ${result.code}`)
      return durableView(view)
    },
    async prepare(input) {
      const view = await memory.prepare(input)
      const result = await persist(null, view, 'prepare')
      if (result.kind === 'refused') throw new Error(`Durable prepare refused: ${result.code}`)
      return durableView(view)
    },
    async prepareExisting(input) {
      const view = await memory.prepareExisting(input)
      const result = await persist(input.expectedInvocationVersion, view, 'prepare_existing')
      if (result.kind === 'refused') throw new Error(`Durable prepare existing refused: ${result.code}`)
      return durableView(view)
    },
    async revisePrepared(input) {
      return accept(
        input.expectedInvocationVersion,
        await memory.revisePrepared(input),
        'revise_prepared',
      )
    },
    async decide(input) {
      return accept(input.expectedInvocationVersion, await memory.decide(input), 'decide')
    },
    async authorizeStandingMandateUse(input) {
      return accept(
        input.expectedInvocationVersion,
        await memory.authorizeStandingMandateUse(input),
        'authorize_standing_mandate_use',
      )
    },
    async execute(input) {
      const acquired = await accept(input.expectedInvocationVersion, await memory.acquire({
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
    async acquire(input) {
      return accept(input.expectedInvocationVersion, await memory.acquire(input), 'acquire')
    },
    async executeAcquired(input) {
      return accept(
        input.expectedInvocationVersion,
        await memory.executeAcquired(input),
        'execute_acquired',
        input.effectGeneration,
      )
    },
    async publishObservation(input) {
      return accept(
        input.expectedInvocationVersion,
        await memory.publishObservation(input),
        'publish_observation',
        input.effectGeneration,
      )
    },
    async cancel(input) {
      const commandId = `${input.invocationRef}:cancel`
      const commandMaterial = cancellationCommandMaterial(input)
      const prior = await options.port.readHistoryCommand(input.invocationRef, commandId)
      if (prior !== undefined) {
        const current = memory.inspect(input.invocationRef)
        if (current === undefined) return { kind: 'refused', code: 'invocation_not_found' }
        if (
          current.owner.callerRef !== input.actor.callerRef
          || current.owner.principalRef !== input.actor.principalRef
        ) {
          return { kind: 'refused', code: 'cross_principal_refused', view: durableView(current) }
        }
        if (stableStringify(current.origin) !== stableStringify(input.origin)) {
          return { kind: 'refused', code: 'cross_origin_refused', view: durableView(current) }
        }
        return prior.commandDigest === canonicalDigest(commandMaterial)
          ? { kind: 'accepted', view: durableView(current) }
          : { kind: 'refused', code: 'command_identity_conflict', view: durableView(current) }
      }
      return accept(
        input.expectedInvocationVersion,
        await memory.cancel(input),
        'cancel',
        undefined,
        commandMaterial,
        commandId,
      )
    },
    async reconcile(input) {
      const commandId = `${input.invocationRef}:reconciliation-evidence:${input.evidence.evidenceRef}`
      const prior = await options.port.readHistoryCommand(input.invocationRef, commandId)
      if (prior !== undefined) {
        const current = memory.inspect(input.invocationRef)
        if (current === undefined) return { kind: 'refused', code: 'invocation_not_found' }
        if (
          current.owner.callerRef !== input.actor.callerRef ||
          current.owner.principalRef !== input.actor.principalRef
        ) {
          return { kind: 'refused', code: 'cross_principal_refused', view: durableView(current) }
        }
        if (stableStringify(current.origin) !== stableStringify(input.origin)) {
          return { kind: 'refused', code: 'cross_origin_refused', view: durableView(current) }
        }
        return prior.commandDigest === canonicalDigest(input.evidence)
          ? { kind: 'accepted', view: durableView(current) }
          : { kind: 'refused', code: 'command_identity_conflict', view: durableView(current) }
      }
      const decision = await memory.reconcile(input)
      if (decision.kind !== 'accepted') {
        return decision.view === undefined
          ? decision
          : { ...decision, view: durableView(decision.view) }
      }
      const result = await persist(
        input.expectedInvocationVersion,
        decision.view,
        'reconcile',
        undefined,
        input.evidence,
      )
      if (result.kind === 'refused') {
        memory = makeMemory(await reconstructSnapshot(options.port, input.invocationRef))
        const durableStateView = memory.inspect(input.invocationRef)
        return durableStateView === undefined
          ? { kind: 'refused', code: result.code }
          : { kind: 'refused', code: result.code, view: durableView(durableStateView) }
      }
      return { kind: 'accepted', view: durableView(decision.view) }
    },
    inspect(invocationRef) {
      const view = memory.inspect(invocationRef)
      return view === undefined ? undefined : durableView(view)
    },
    exportSnapshot: memory.exportSnapshot,
    async coldResume(invocationRef) {
      return createDurableActionInvocationTracerWithSnapshot(
        options,
        await reconstructSnapshot(options.port, invocationRef),
      )
    },
    async recordLateObservation(input) {
      return await options.port.recordLateObservation({ ...input, recordedAt: options.now() })
    },
  }
}

async function reconstructSnapshot<Result extends ActionResult>(
  port: DurableActionInvocationPort<Result>,
  invocationRef: string,
): Promise<InMemoryControlSnapshot<Result>> {
  const rawRow = await port.readControl(invocationRef)
  if (rawRow === undefined) throw new Error(`Missing durable invocation ${invocationRef}.`)
  const row = rawRow
  const attemptRows = [...await port.readAttempts(invocationRef, 100)]
  if (
    row.currentAttemptRef !== undefined &&
    !attemptRows.some(({ attemptRef }) => attemptRef === row.currentAttemptRef)
  ) {
    const currentAttempt = await port.readAttempt(invocationRef, row.currentAttemptRef)
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

export async function readCompletedResultIdentity<Result extends ActionResult>(
  port: DurableActionInvocationPort<Result>,
  invocationRef: string,
  actor: Readonly<{ callerRef: string; principalRef: string }>,
  resolve: (sourceRef: string) => Readonly<{
    sourceResultRef?: string
    result?: Result
  }>,
): Promise<CompletedResultIdentity> {
  const row = await port.readControl(invocationRef)
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
  if (row.terminalResultReferenceable !== true) {
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
