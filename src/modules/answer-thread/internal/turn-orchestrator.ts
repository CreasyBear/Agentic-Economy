import {
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerOperationCandidate,
  type AnswerSource,
  type AnswerWorkStep,
  type AnswerPriorTurnContext,
  type AnswerRequestPreflightResult,
  type EffectiveAnswerAgentRoute,
} from '@/modules/answer/public'
import {
  type KeylessExecutableSourcePort,
  type OperationExecuteDeps,
} from '@/modules/capability-execution'
import type {
  HarnessModelRequestRecord,
  HarnessRunLoopPhaseHandlers,
} from '@/modules/harness/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  type AeSearchContext,
} from '@/modules/answer/search-context'
import {
  buildAnswerTurnProblem,
  type AnswerTurnProblem,
} from '@/lib/errors'
import {
  type AnswerOperationInvokeContext,
  type AnswerPendingDecision,
  type AnswerRequestInterpretation,
  type AnswerRunGateSummary,
  type AnswerToolCallRecord,
  type AnswerTurnCheckpoint,
  type AnswerTurnOperationArtifacts,
  type AnswerTurnRecord,
  type AnswerContinuationSource,
  type FollowUpIntent,
} from '../answer-thread.schema'
import {
  isPublicWorkStep,
  publicWorkLog,
  safeWorkLogUserText,
} from './public-worklog'

import {
  persistAnswerTurnCheckpoint,
  readAnswerTurnCheckpoint,
  renewAnswerTurnLease,
  type AnswerHarnessFinalizationResult,
  type AnswerTurnReservationResult,
  type RenewAnswerTurnLeaseResult,
} from '../answer-thread.functions'
import { normalizeAnswerTurnQuery } from './turn-digests'
import { type AnswerTurnRecordLite } from './answer-turn-evidence-freeze'
import { answerHarnessFinalizationSucceeded } from './answer-turn-harness-report'
import type {
  PersistAnswerTurnInput,
  PersistAnswerTurnResult,
} from './answer-turn-persist-result'
import {
  pendingDecisionFor,
  selectedInputDigestFor,
  readOperationInputFromToolCalls,
} from './answer-continuation-state'
import {
  createLiveAnswerHarnessOperation,
  type LiveAnswerHarnessOperation,
} from './answer-harness-operation'
import { agentTurnPath, readOperationArtifacts } from './turns/agent'
import { boundaryTurnPath } from './turns/boundary'
import {
  type SnapshotAssemblyPlan,
  type TurnPathContext,
  type TurnTimingCollector,
  type WorkStepEmitter,
} from './turns/types'
import {
  type AnswerTurnLeaseConflictReason,
  startAnswerTurnLeaseHeartbeat,
} from './answer-turn-lease'
import { emitOrDeferSnapshot } from './answer-turn-snapshots'
import {
  readFinalizedAnswerTurn,
} from './answer-turn-persist'
import { createStreamAnswerTurnPhases } from './answer-turn-phases'
import {
  createTurnTimingCollector,
  withWorkStepDuration,
} from './answer-turn-timing'

export type RuntimeAnswerRoute =
  | Readonly<{
      kind: 'tool_search'
      agent: EffectiveAnswerAgentRoute
    }>
  | Readonly<{ kind: 'safety_refusal' }>

export type StreamAnswerTurnRuntimeState = {
  checkpointDigestRef: { value?: string }
  resumeCheckpoint?: AnswerTurnCheckpoint
  query: string
  threadId: string
  turnId: string
  turnSeq: number
  isNewThread: boolean
  reservationKey: string
  requestDigest: string
  generation: number
  createdAt: number
  searchContext: AeSearchContext | undefined
  registryQuery?: string
  priorTurns: readonly AnswerTurnRecordLite[]
  priorTurnCount: number
  priorProviders: AnswerSource[]
  priorAllowedSlugs: readonly string[]
  priorOperationInput?: Readonly<Record<string, unknown>>
  priorOperationRef?: string
  intent: FollowUpIntent
  interpretation?: AnswerRequestInterpretation
  continuationSource?: AnswerContinuationSource
  pendingDecision?: AnswerPendingDecision
  querySafety?: AnswerRequestPreflightResult
  route?: RuntimeAnswerRoute

  publicOperationCandidates: readonly AnswerOperationCandidate[]
  captured?: AnswerSnapshot | undefined
  errorCopyId?: string | undefined
  errorProblem?: AnswerTurnProblem | undefined
  errorProblemJson?: string | undefined
  operationArtifacts?: AnswerTurnOperationArtifacts
  toolCalls: readonly AnswerToolCallRecord[]
  modelRequests?: readonly HarnessModelRequestRecord[] | undefined
  allowedSlugs: ReadonlySet<string>
  gate?: AnswerRunGateSummary | undefined
  finalGate?: AnswerRunGateSummary | undefined
  finalTurnStatus?: AnswerTurnRecord['status'] | undefined
  assembly?: SnapshotAssemblyPlan | undefined
  assembled: boolean
  persistInput?: PersistAnswerTurnInput | undefined
  persistResult?: PersistAnswerTurnResult | undefined
  finalizationResult?: AnswerHarnessFinalizationResult | undefined
}

export type StreamAnswerTurnInput = {
  sessionId: string
  query: string
  threadId?: string
  requestDigest: string
  admission: Extract<
    AnswerTurnReservationResult,
    { kind: 'reserved' | 'in_progress' | 'replayed' }
  >
  searchContext?: AeSearchContext
  /** Explicit descriptor source for fixture/local-e2e answer turns. */
  keylessExecutableSource?: KeylessExecutableSourcePort
  /** Narrow fixture/evaluator execution dependencies; production omits this. */
  operationExecuteDeps?: Pick<
    OperationExecuteDeps,
    'isPublicTarget' | 'fetchImpl'
  >
  /** Narrow evaluator seam; production uses the structured Answer preflight. */
  querySafetyClassifier?: (
    input: Readonly<{
      query: string
      priorTurns?: readonly AnswerPriorTurnContext[]
      signal?: AbortSignal
    }>,
  ) => Promise<AnswerRequestPreflightResult>
  signal?: AbortSignal
  sourceWriteRequest?: Request
  sourceWriteBody?: string | Uint8Array
  operationInvokeContext?: AnswerOperationInvokeContext
  preloadedPriorTurns?: readonly AnswerTurnRecord[]
}

export type StreamAnswerTurnResult = {
  threadId: string
  turnId: string
  turnSeq: number
}

export async function streamAnswerTurn(
  input: StreamAnswerTurnInput,
  onEvent: (frame: { seq: number; event: AnswerEvent }) => void,
): Promise<StreamAnswerTurnResult | undefined> {
  const query = normalizeAnswerTurnQuery(input.query)
  if (query.length === 0) {
    return undefined
  }

  const { admission } = input
  const threadId = admission.threadId
  const turnId = admission.turnId
  const turnSeq = admission.turnSeq
  const isNewThread = input.threadId === undefined
  const leaseController = new AbortController()
  const executionSignal = input.signal === undefined
    ? leaseController.signal
    : AbortSignal.any([input.signal, leaseController.signal])
  const executionInput: StreamAnswerTurnInput = { ...input, signal: executionSignal }
  let seq = -1
  const send = (event: AnswerEvent) => {
    if (executionSignal.aborted) {
      return
    }
    seq += 1
    onEvent({ seq, event })
  }

  send({ type: 'thread', threadId, turnId, turnSeq })
  const sendFinalizedReplay = async (): Promise<void> => {
    const replay = await readFinalizedAnswerTurn({
      threadId,
      turnId,
      sessionId: input.sessionId,
    })
    send(
      replay.kind === 'complete'
        ? { type: 'complete', answer: replay.answer }
        : { type: 'error', problem: replay.problem },
    )
  }
  const handleLeaseConflict = async (
    reason: AnswerTurnLeaseConflictReason,
  ): Promise<void> => {
    if (reason === 'stopped') {
      send({ type: 'stopped' })
      return
    }
    if (reason === 'settled') {
      await sendFinalizedReplay()
      return
    }
    send({
      type: 'error',
      problem: buildAnswerTurnProblem('answer_turn_persist_failed'),
    })
  }

  let resumeCheckpoint: AnswerTurnCheckpoint | undefined
  if (admission.kind === 'in_progress') {
    send({ type: 'thinking', label: 'This answer is already in progress. Try again shortly.' })
    send({ type: 'pending' })
    return { threadId, turnId, turnSeq }
  }
  if (admission.kind === 'replayed' && admission.state === 'stopped') {
    send({ type: 'stopped' })
    return { threadId, turnId, turnSeq }
  }
  if (admission.kind === 'replayed' && admission.state === 'finalized') {
    await sendFinalizedReplay()
    return { threadId, turnId, turnSeq }
  }
  if (
    admission.kind === 'reserved'
    || (admission.kind === 'replayed' && admission.state === 'reserved')
  ) {
    const checkpointResult = await readAnswerTurnCheckpoint({
      reservationKey: admission.reservationKey,
      requestDigest: input.requestDigest,
      sessionId: input.sessionId,
      threadId,
      turnId,
      turnSeq,
      generation: admission.generation,
      ...(input.sourceWriteRequest === undefined
        ? {}
        : { sourceWriteRequest: input.sourceWriteRequest }),
      ...(input.sourceWriteBody === undefined
        ? {}
        : { sourceWriteBody: input.sourceWriteBody }),
    })
    if (checkpointResult.kind === 'checkpoint') {
      resumeCheckpoint = checkpointResult.checkpoint
    } else if (checkpointResult.kind === 'missing') {
      let leaseResult: RenewAnswerTurnLeaseResult
      try {
        leaseResult = await renewAnswerTurnLease({
          reservationKey: admission.reservationKey,
          requestDigest: input.requestDigest,
          sessionId: input.sessionId,
          threadId,
          turnId,
          turnSeq,
          generation: admission.generation,
          ...(input.sourceWriteRequest === undefined
            ? {}
            : { sourceWriteRequest: input.sourceWriteRequest }),
          ...(input.sourceWriteBody === undefined
            ? {}
            : { sourceWriteBody: input.sourceWriteBody }),
        })
      } catch {
        send({
          type: 'error',
          problem: buildAnswerTurnProblem('answer_turn_persist_failed'),
        })
        return { threadId, turnId, turnSeq }
      }
      if (leaseResult.kind !== 'renewed') {
        await handleLeaseConflict(leaseResult.reason)
        return { threadId, turnId, turnSeq }
      }
    } else {
      await handleLeaseConflict(checkpointResult.reason)
      return { threadId, turnId, turnSeq }
    }
  }
  const stopLeaseHeartbeat = startAnswerTurnLeaseHeartbeat({
    reservationKey: admission.reservationKey,
    requestDigest: input.requestDigest,
    sessionId: input.sessionId,
    threadId,
    turnId,
    turnSeq,
    generation: admission.generation,
    ...(input.sourceWriteRequest === undefined
      ? {}
      : { sourceWriteRequest: input.sourceWriteRequest }),
    ...(input.sourceWriteBody === undefined
      ? {}
      : { sourceWriteBody: input.sourceWriteBody }),
    signal: executionSignal,
    onLost: (loss) => {
      if (leaseController.signal.aborted) return
      switch (loss.kind) {
        case 'fence_conflict':
          if (loss.reason === 'stopped') {
            send({ type: 'stopped' })
          } else {
            send({
              type: 'error',
              problem: buildAnswerTurnProblem('answer_turn_persist_failed'),
            })
          }
          leaseController.abort(new Error(`answer_turn_lease_${loss.reason}`))
          return
        case 'transport':
          send({
            type: 'error',
            problem: buildAnswerTurnProblem('answer_turn_persist_failed'),
          })
          leaseController.abort(new Error('answer_turn_lease_renewal_unavailable'))
          return
        default: {
          const _exhaustive: never = loss
          return _exhaustive
        }
      }
    },
  })
  try {

  const timings = createTurnTimingCollector()
  const stopContextTiming = timings.start('turn.context_parse')
  const harness = createLiveAnswerHarnessOperation({
    runId: turnId,
    sessionId: input.sessionId,
    signal: executionSignal,
  })
  const workLog = createWorkStepEmitter(send)
  const interpretStartedAt = Date.now()
  workLog.emit({
    id: 'interpret.request',
    phase: 'interpret',
    status: 'running',
    title: 'Reading your request',
    summary: 'Checking what you need and whether this is a follow-up.',
    detailRows: [{ label: 'Request', value: safeWorkLogUserText(query) }],
    startedAtMs: interpretStartedAt,
  })

  const createdAt = Date.now()
  const operationArtifacts = readOperationArtifacts(resumeCheckpoint)
  const resumePriorOperationRef =
    resumeCheckpoint?.operationSelection?.operationRef
    ?? resumeCheckpoint?.selectedOperationRef
  const resumePriorOperationInput =
    resumeCheckpoint === undefined
      ? undefined
      : readOperationInputFromToolCalls(
          resumeCheckpoint.toolCalls,
          resumePriorOperationRef,
        )
  const runResult = await harness.loop.run<StreamAnswerTurnRuntimeState>({
    initialState: {
      checkpointDigestRef:
        resumeCheckpoint === undefined
          ? {}
          : { value: canonicalDigest(resumeCheckpoint).toString() },
      query: resumeCheckpoint?.query ?? query,
      threadId,
      turnId,
      turnSeq,
      isNewThread,
      reservationKey: admission.reservationKey,
      requestDigest: input.requestDigest,
      generation: admission.generation,
      createdAt,
      searchContext: input.searchContext,
      ...(resumeCheckpoint === undefined ? {} : { resumeCheckpoint }),
      priorTurns: [],
      priorTurnCount: resumeCheckpoint?.priorTurnCount ?? 0,
      priorProviders: [...(resumeCheckpoint?.priorProviders ?? [])],
      priorAllowedSlugs: [...(resumeCheckpoint?.priorAllowedSlugs ?? [])],
      ...(resumePriorOperationRef === undefined
        ? {}
        : { priorOperationRef: resumePriorOperationRef }),
      ...(resumePriorOperationInput === undefined
        ? {}
        : { priorOperationInput: resumePriorOperationInput }),
      intent:
        resumeCheckpoint?.intent
        ?? 'refine_search',

      ...(resumeCheckpoint?.interpretation === undefined
        ? {}
        : { interpretation: resumeCheckpoint.interpretation }),
      ...(resumeCheckpoint?.continuationSource === undefined
        ? {}
        : { continuationSource: resumeCheckpoint.continuationSource }),
      ...(resumeCheckpoint?.pendingDecision === undefined
        ? {}
        : { pendingDecision: resumeCheckpoint.pendingDecision }),
      ...(operationArtifacts === undefined ? {} : { operationArtifacts }),
      publicOperationCandidates: resumeCheckpoint?.operationCandidates ?? [],
      toolCalls: [],
      modelRequests: resumeCheckpoint?.modelRequests ?? [],
      allowedSlugs: new Set(resumeCheckpoint?.priorAllowedSlugs ?? []),
      assembled: false,
    } satisfies StreamAnswerTurnRuntimeState,
    phases: buildStreamAnswerTurnPhases({
      input: executionInput,
      interpretStartedAt,
      stopContextTiming,
      send,
      timings,
      workLog,
      harness,
      stopLeaseHeartbeat,
    }),
  })
  const finalState = runResult.state
  const persistResult = finalState.persistResult
  const finalizationResult = finalState.finalizationResult

  if (persistResult?.ok !== true) {
    send({
      type: 'error',
      problem: buildAnswerTurnProblem('answer_turn_persist_failed'),
    })
    return { threadId, turnId, turnSeq }
  }
  if (!answerHarnessFinalizationSucceeded(finalizationResult)) {
    if (
      finalizationResult?.status === 'conflict' &&
      finalizationResult.reason === 'stopped'
    ) {
      send({ type: 'stopped' })
    } else {
      send({
        type: 'error',
        problem: buildAnswerTurnProblem('answer_turn_persist_failed'),
      })
    }
    return { threadId, turnId, turnSeq }
  }
  if (finalState.captured !== undefined) {
    send({ type: 'complete', answer: finalState.captured })
  } else {
    send({
      type: 'error',
      problem:
        finalState.errorProblem ?? buildAnswerTurnProblem('answer_turn_failed'),
    })
  }

  return { threadId, turnId, turnSeq }
  } finally {
    stopLeaseHeartbeat()
  }
}

function buildStreamAnswerTurnPhases(input: {
  input: StreamAnswerTurnInput
  interpretStartedAt: number
  stopContextTiming: (
    metadata?: Record<string, string | number | boolean | null>,
  ) => void
  send: (event: AnswerEvent) => void
  timings: TurnTimingCollector
  workLog: WorkStepEmitter
  harness: LiveAnswerHarnessOperation
  stopLeaseHeartbeat: () => void
}): HarnessRunLoopPhaseHandlers<StreamAnswerTurnRuntimeState> {
  return createStreamAnswerTurnPhases({
    ...input,
    turnPathContext: (state, options) =>
      runtimeTurnPathContext(input, state, options),
    runAgentTurn: (ctx, ...args) => agentTurnPath.run(ctx, ...args),
    runBoundaryTurn: (ctx, ...args) => boundaryTurnPath.run(ctx, ...args),
  })
}

function runtimeTurnPathContext(
  input: {
    input: StreamAnswerTurnInput
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    harness: LiveAnswerHarnessOperation
  },
  state: StreamAnswerTurnRuntimeState,
  options: { deferAssembly?: boolean } = {},
): TurnPathContext {
  let parentCheckpointDigest =
    state.resumeCheckpoint === undefined
      ? undefined
      : canonicalDigest(state.resumeCheckpoint).toString()
  const deferAssembly = options.deferAssembly ?? true
  return {
    sessionId: input.input.sessionId,
    threadId: state.threadId,
    turnId: state.turnId,
    reservationKey: state.reservationKey,
    requestDigest: state.requestDigest,
    generation: state.generation,
    sourceWriteRequest: input.input.sourceWriteRequest,
    sourceWriteBody: input.input.sourceWriteBody,
    query: state.query,
    ...(state.registryQuery === undefined
      ? {}
      : { registryQuery: state.registryQuery }),
    intent: state.intent,
    priorTurnsCount: state.priorTurnCount,
    priorProviders: state.priorProviders,
    priorAllowedSlugs: state.priorAllowedSlugs,
    operationCandidates: state.publicOperationCandidates,
    ...(input.input.operationInvokeContext === undefined
      ? {}
      : { operationInvokeContext: input.input.operationInvokeContext }),
    searchContext: state.searchContext,
    signal: input.input.signal,
    ...(state.resumeCheckpoint === undefined
      ? {}
      : { resumeCheckpoint: state.resumeCheckpoint }),
    persistCheckpoint: async (partial) => {
      const toolCallDigests = partial.toolCalls.map((call) => ({
        toolCallId: call.toolCallId,
        inputDigest: canonicalDigest(call.inputJson).toString(),
        resultDigest: call.resultHash,
      }))
      const continuationSource = state.continuationSource
      const pendingDecision = pendingDecisionFor(
        partial.operationOutcome,
        partial.operationSelection,
        partial.toolCalls,
      )
      const selectedInputDigest = selectedInputDigestFor(
        partial.toolCalls,
        partial.operationSelection,
      )

      const checkpoint: AnswerTurnCheckpoint = {
        schemaVersion: 1,
        reservationKey: state.reservationKey,
        requestDigest: state.requestDigest,
        generation: state.generation,
        threadId: state.threadId,
        turnId: state.turnId,
        turnSeq: state.turnSeq,
        stepOrdinal: partial.stepOrdinal,
        ...(parentCheckpointDigest === undefined
          ? {}
          : { parentCheckpointDigest }),
        ...(state.interpretation === undefined
          ? {}
          : {
              interpretation: state.interpretation,
              requestedIntents: state.interpretation.requestedIntents,
            }),
        ...(continuationSource === undefined
          ? {}
          : { continuationSource }),
        ...(pendingDecision === undefined ? {} : { pendingDecision }),

        query: state.query,
        priorTurnCount: state.priorTurnCount,
        ...(state.searchContext === undefined
          ? {}
          : { searchContext: state.searchContext }),
        priorProviders: partial.priorProviders,
        priorAllowedSlugs: partial.priorAllowedSlugs,
        toolCalls: partial.toolCalls,
        toolCallDigests,
        ...(partial.operationCandidates === undefined
          ? {}
          : { operationCandidates: partial.operationCandidates }),
        ...(partial.operationCandidatesDigest === undefined
          ? {}
          : { operationCandidatesDigest: partial.operationCandidatesDigest }),
        ...(partial.operationComparison === undefined
          ? {}
          : { operationComparison: partial.operationComparison }),
        ...(partial.operationOutcome === undefined
          ? {}
          : { operationOutcome: partial.operationOutcome }),
        ...(partial.operationPlan === undefined
          ? {}
          : { operationPlan: partial.operationPlan }),
        ...(partial.operationSelection === undefined
          ? {}
          : {
              operationSelection: partial.operationSelection,
              selectedOperationRef: partial.operationSelection.operationRef,
              selectedToolId: partial.operationSelection.toolId,
              ...(partial.operationSelection.descriptorDigest === undefined
                ? {}
                : {
                    descriptorDigest:
                      partial.operationSelection.descriptorDigest,
                  }),
              ...(partial.operationSelection.resultDigest === undefined
                ? {}
                : { resultDigest: partial.operationSelection.resultDigest }),
            }),
              ...(selectedInputDigest === undefined
                ? {}
                : { selectedInputDigest }),
        modelRequests: partial.modelRequests,
        replayMessagesJson: partial.replayMessagesJson,
      }
      const result = await persistAnswerTurnCheckpoint({
        reservationKey: state.reservationKey,
        requestDigest: state.requestDigest,
        sessionId: input.input.sessionId,
        threadId: state.threadId,
        turnId: state.turnId,
        turnSeq: state.turnSeq,
        generation: state.generation,
        checkpoint,
        ...(input.input.sourceWriteRequest === undefined
          ? {}
          : { sourceWriteRequest: input.input.sourceWriteRequest }),
        ...(input.input.sourceWriteBody === undefined
          ? {}
          : { sourceWriteBody: input.input.sourceWriteBody }),
      })
      if (result.kind === 'conflict') {
        throw new Error(`answer_turn_checkpoint_${result.reason}`)
      }
      parentCheckpointDigest = result.checkpointDigest
      state.checkpointDigestRef.value = result.checkpointDigest
    },
    send: input.send,
    timings: input.timings,
    workLog: input.workLog,
    harness: input.harness,
    deferAssembly,
    emitOrDeferSnapshot: (snapshot, path, metadata = {}) =>
      emitOrDeferSnapshot(
        {
          signal: input.input.signal,
          send: input.send,
          timings: input.timings,
          workLog: input.workLog,
          harness: input.harness,
          deferAssembly,
        },
        snapshot,
        path,
        metadata,
      ),
  }
}

function createWorkStepEmitter(
  send: (event: AnswerEvent) => void,
): WorkStepEmitter {
  const steps: AnswerWorkStep[] = []

  return {
    emit: (incoming) => {
      const step = withWorkStepDuration(incoming)
      const index = steps.findIndex((item) => item.id === step.id)
      if (index === -1) {
        steps.push(step)
      } else {
        steps[index] = withWorkStepDuration({
          ...steps[index],
          ...step,
          ...(step.detailRows === undefined
            ? {}
            : { detailRows: step.detailRows }),
          ...(step.relatedProviderSlugs === undefined
            ? {}
            : { relatedProviderSlugs: step.relatedProviderSlugs }),
        })
      }
      if (!isPublicWorkStep(step)) {
        return
      }
      const currentIndex = index === -1 ? steps.length - 1 : index
      const publicIndex =
        steps.slice(0, currentIndex + 1).filter(isPublicWorkStep).length - 1
      const publicStep = publicWorkLog(steps)[publicIndex]
      if (publicStep !== undefined) {
        send({ type: 'work-step', step: publicStep })
      }
    },
    entries: () => publicWorkLog(steps),
  }
}

export {
  emitTimedSnapshot,
  emitOrDeferSnapshot,
  emitSnapshotWithAssembly,
  snapshotStreamPauseMs,
} from './answer-turn-snapshots'
export { startAnswerTurnLeaseHeartbeat } from './answer-turn-lease'
export {
  buildPersistAnswerTurnInput,
  readFinalizedAnswerTurn,
} from './answer-turn-persist'
export {
  createTurnTimingCollector,
  withWorkStepDuration,
  appendModelRequests,
} from './answer-turn-timing'
