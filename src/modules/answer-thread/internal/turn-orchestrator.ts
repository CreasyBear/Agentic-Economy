import {
  classifyAnswerRequestPreflight,
  keylessDataAskFromCandidates,
  resolveKeylessDataAskFromInterpretation,
  resolveKeylessDataAskSelection,
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerOperationCandidate,
  type AnswerSource,
  type AnswerWorkStep,
  collectAllowedSlugsFromToolResults,
  emitSnapshotEvents,
  type KeylessDataAskResolution,
  type AnswerPriorTurnContext,
  type AnswerRequestPreflightResult,
} from '@/modules/answer/public'
import {
  convexKeylessExecutableSource,
  type KeylessExecutableSourcePort,
  type OperationExecuteDeps,
} from '@/modules/capability-execution'
import type {
  HarnessModelRequestRecord,
  HarnessRunStatus,
  HarnessRunLoopPhaseHandlers,
} from '@/modules/harness/public'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { roundNonNegative2 } from '@/modules/common/round-nonnegative-2'
import {
  aeSearchContextLocationQuery,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import {
  buildAnswerTurnProblem,
  redactAnswerTurnProblem,
  type AnswerTurnProblem,
} from '@/lib/errors'
import {
  planAnswerTurn,
  planPendingOperationClarification,
  type AnswerResponsePlan,
} from './answer-response-planner'
import {
  isPublicWorkStep,
  publicWorkLog,
  safeWorkLogUserText,
} from './public-worklog'
import {
  type AnswerOperationInvokeContext,
  type AnswerPendingDecision,
  type AnswerRequestInterpretation,
  type AnswerRunGateSummary,
  type AnswerToolCallRecord,
  type AnswerTurnCheckpoint,
  type AnswerTurnOperationArtifacts,
  type AnswerTurnRecord,
  type AnswerTurnTimingEntry,
  type AnswerContinuationSource,
  type FollowUpIntent,
  type FrozenTurnProse,
} from '../answer-thread.schema'
import { ANSWER_TURN_EXECUTION_LEASE_MS } from '../answer-thread.schema'

import {
  finalizeReservedAnswerTurnFromSource,
  getAnswerThreadWithTurns,
  persistAnswerTurnCheckpoint,
  readAnswerTurnCheckpoint,
  renewAnswerTurnLease,
  reserveAnswerTurn,
  type AnswerHarnessFinalizationResult,
  type AnswerTurnReservationResult,
  type ReadAnswerTurnCheckpointResult,
  type RenewAnswerTurnLeaseResult,
} from '../answer-thread.functions'
import {
  normalizeAnswerTurnQuery,
  parseAnswerOperationSelectionRecognition,
} from './turn-digests'
import { classifyFollowUpIntent, buildThreadTitle } from './follow-up-intent'
import {
  answerHarnessFinalizationSucceeded,
  collectLatestFrozenAllowedSlugs,
  collectLatestFrozenOperationCandidates,
  collectLatestFrozenSelectedOperationRef,
  collectLatestFrozenProviders,
  finalizePersistedAnswerTurnHarnessRun,
  persistAnswerTurnWithResult,
  readPriorCompleteTurns,
  type AnswerTurnRecordLite,
  type PersistAnswerTurnInput,
  type PersistAnswerTurnResult,
} from './answer-turn-finalization'
import { finalizeAnswerTurnSnapshot } from './answer-turn-safety'
import { toolCallRecordsToGateInput } from './tool-runner'
import {
  createLiveAnswerHarnessOperation,
  type LiveAnswerHarnessOperation,
} from './answer-harness-operation'
import {
  latestPriorOperationPresentation,
  pendingDecisionFor,
  priorTurnOperation,
  priorTurnStatus,
  readOperationInputFromToolCalls,
  readPriorContinuationState,
  readPriorOperationInput,
  readPriorSearchContext,
  selectedInputDigestFor,
} from './answer-continuation-state'
import type { EffectiveAnswerRoute } from './effective-answer-route'
import { agentTurnPath, readOperationArtifacts } from './turns/agent'
import { boundaryTurnPath } from './turns/boundary'
import { parseFrozenEvidence } from './public-projection'
import {
  makeCopyId,
  type SnapshotAssemblyPlan,
  type SnapshotPlanMetadata,
  type TurnPathContext,
  type TurnPathResult,
  type TurnTimingCollector,
  type WorkStepEmitter,
} from './turns/types'

const ANSWER_TURN_EXECUTION_LEASE_RENEW_INTERVAL_MS = Math.min(
  10_000,
  Math.max(1, Math.floor(ANSWER_TURN_EXECUTION_LEASE_MS / 3)),
)
type AnswerTurnLeaseConflictReason =
  | Extract<
      ReadAnswerTurnCheckpointResult,
      { kind: 'conflict' }
    >['reason']
  | Extract<
      RenewAnswerTurnLeaseResult,
      { kind: 'conflict' }
    >['reason']

type AnswerTurnLeaseLoss =
  | {
      kind: 'fence_conflict'
      reason: AnswerTurnLeaseConflictReason
    }
  | { kind: 'transport' }

type RuntimeAnswerRoute =
  | Extract<EffectiveAnswerRoute, { agent: unknown }>
  | Readonly<{ kind: 'safety_refusal' }>

type StreamAnswerTurnRuntimeState = {
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

  responsePlan?: AnswerResponsePlan | undefined
  keylessDataAsk?: KeylessDataAskResolution | undefined
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

type FinalizedAnswerTurnReadback =
  | { kind: 'complete'; answer: AnswerSnapshot }
  | { kind: 'error'; problem: AnswerTurnProblem }

async function readFinalizedAnswerTurn(input: {
  threadId: string
  turnId: string
  sessionId: string
}): Promise<FinalizedAnswerTurnReadback> {
  const projection = await getAnswerThreadWithTurns(
    input.threadId,
    input.sessionId,
    { numItems: 25, cursor: null },
  )
  const turn = projection?.turns.page.find(
    (candidate) => candidate.turnId === input.turnId,
  )
  if (turn === undefined) {
    return {
      kind: 'error',
      problem: buildAnswerTurnProblem('answer_turn_failed'),
    }
  }
  if (turn.status === 'error') {
    if (turn.errorProblemJson !== undefined) {
      try {
        return {
          kind: 'error',
          problem: redactAnswerTurnProblem(
            JSON.parse(turn.errorProblemJson) as unknown,
          ),
        }
      } catch {
        // Fall through to the safe generic problem.
      }
    }
    return {
      kind: 'error',
      problem: buildAnswerTurnProblem('answer_turn_failed'),
    }
  }
  if (turn.status !== 'complete') {
    return {
      kind: 'error',
      problem: buildAnswerTurnProblem('answer_turn_failed'),
    }
  }
  try {
    const evidence = parseFrozenEvidence(turn.evidenceJson)
    const proseValue: unknown = JSON.parse(turn.proseJson)
    if (
      !isRecord(proseValue) ||
      typeof proseValue.oneLine !== 'string' ||
      typeof proseValue.summary !== 'string' ||
      typeof proseValue.nextStep !== 'string'
    ) {
      throw new Error('answer_prose_invalid')
    }
    const prose = proseValue as FrozenTurnProse
    return {
      kind: 'complete',
      answer: {
        query: turn.query,
        oneLine: prose.oneLine,
        providers: evidence.providers,
        ...(evidence.operationCandidates === undefined
          ? {}
          : { operationCandidates: evidence.operationCandidates }),
        ...(evidence.operationCandidatesDigest === undefined
          ? {}
          : { operationCandidatesDigest: evidence.operationCandidatesDigest }),
        ...(evidence.operationOutcome === undefined
          ? {}
          : { operationOutcome: evidence.operationOutcome }),
        ...(evidence.operationSelection === undefined
          ? {}
          : { operationSelection: evidence.operationSelection }),
        summary: prose.summary,
        nextStep: prose.nextStep,
        agentJsonUrl: evidence.agentJsonUrl,
        ...(prose.compactLayout === true ? { compactLayout: true } : {}),
        ...(prose.layoutProfile === undefined
          ? {}
          : { layoutProfile: prose.layoutProfile }),
      },
    }
  } catch {
    return {
      kind: 'error',
      problem: buildAnswerTurnProblem('answer_turn_failed'),
    }
  }
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
      if (loss.kind === 'fence_conflict' && loss.reason === 'stopped') {
        send({ type: 'stopped' })
      } else {
        send({
          type: 'error',
          problem: buildAnswerTurnProblem('answer_turn_persist_failed'),
        })
      }
      leaseController.abort(
        loss.kind === 'fence_conflict'
          ? new Error(`answer_turn_lease_${loss.reason}`)
          : new Error('answer_turn_lease_renewal_unavailable'),
      )
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
      intent: resumeCheckpoint?.intent ?? 'refine_search',
      ...(resumeCheckpoint?.interpretation === undefined
        ? {}
        : { interpretation: resumeCheckpoint.interpretation }),
      ...(resumeCheckpoint?.continuationSource === undefined
        ? {}
        : { continuationSource: resumeCheckpoint.continuationSource }),
      ...(resumeCheckpoint?.pendingDecision === undefined
        ? {}
        : { pendingDecision: resumeCheckpoint.pendingDecision }),
      ...(resumeCheckpoint?.operationCandidates === undefined
        ? {}
        : {
            keylessDataAsk: keylessDataAskFromCandidates(
              resumeCheckpoint.operationCandidates,
            ),
          }),
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
  const persistInput = finalState.persistInput
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
  return {
    context: async ({ state }) => {
      if (state.resumeCheckpoint !== undefined) {
        return state
      }
      const priorTurns =
        input.input.preloadedPriorTurns === undefined
          ? await readPriorCompleteTurns(
              input.input.admission.threadId,
              input.input.sessionId,
            )
          : input.input.preloadedPriorTurns.filter(
              (turn) => turn.status === 'complete',
            )
      const priorContinuation = readPriorContinuationState(priorTurns)
      const priorContext: readonly AnswerPriorTurnContext[] = priorTurns.map(
        (turn) => {
          const operation = priorTurnOperation(turn)
          return {
            seq: turn.seq,
            query: turn.query,
            status: priorTurnStatus(turn),
            ...(operation === undefined ? {} : { operation }),
            ...(priorContinuation.source?.priorTurnId === turn.turnId
              && priorContinuation.pendingDecision !== undefined
              ? {
                  pendingDecision: {
                    kind: priorContinuation.pendingDecision.kind,
                    operationRef: priorContinuation.pendingDecision.operationRef,
                  },
                }
              : {}),
          }
        },
      )
      const querySafety = await (
        input.input.querySafetyClassifier ?? classifyAnswerRequestPreflight
      )({
        query: state.query,
        priorTurns: priorContext,
        ...(input.input.signal === undefined
          ? {}
          : { signal: input.input.signal }),
      })
      input.harness.recordModelRequest(querySafety.modelRequest)
      input.timings.record(
        'model.answer_request_preflight',
        querySafety.modelRequest.durationMs,
        {
          decision: querySafety.kind,
          ...(querySafety.kind === 'refused'
            ? { reason: querySafety.reason }
            : {}),
        },
      )
      const interpretation = querySafety.interpretation
      const priorOperationInput = readPriorOperationInput(priorTurns)
      const canReusePriorOperationInput =
        interpretation?.continuation === 'resolve_pending'
        || (
          interpretation?.route === 'operation'
          && interpretation.continuation === 'refine_prior_operation'
        )
      const priorOperationRef =
        collectLatestFrozenSelectedOperationRef(priorTurns)
      return {
        ...state,
        querySafety,
        ...(interpretation === undefined ? {} : { interpretation }),
        modelRequests: [querySafety.modelRequest],
        searchContext:
          querySafety.kind === 'refused'
            ? undefined
            : (input.input.searchContext ?? readPriorSearchContext(priorTurns)),
        priorTurns,
        priorTurnCount: priorTurns.length,
        ...(canReusePriorOperationInput && priorOperationInput !== undefined
          ? {
              priorOperationInput,
              ...(priorOperationRef === undefined ? {} : { priorOperationRef }),
            }
          : {}),
        ...(interpretation === undefined
          || interpretation.continuation === 'new'
          || priorContinuation.source === undefined
          ? {}
          : { continuationSource: priorContinuation.source }),
        ...(interpretation?.continuation !== 'resolve_pending'
          || priorContinuation.pendingDecision === undefined
          ? {}
          : { pendingDecision: priorContinuation.pendingDecision }),
      }
    },
    intent: ({ state }) => {
      if (state.resumeCheckpoint !== undefined) {
        return state
      }
      const interpretedRoute = state.interpretation?.route
      const intent =
        interpretedRoute === 'boundary'
          ? ('explain_boundary' as const)
          : interpretedRoute === 'business'
            ? classifyFollowUpIntent(state.query, state.priorTurnCount)
            : ('refine_search' as const)
      input.stopContextTiming({
        priorTurns: state.priorTurns.length,
        accessTurnCount: state.priorTurnCount,
        intent,
        isNewThread: input.input.threadId === undefined,
      })
      input.workLog.emit({
        id: 'interpret.request',
        phase: 'interpret',
        status: 'complete',
        title: 'Reading your request',
        summary:
          state.priorTurnCount > 0
            ? 'Checking the latest answer to see whether this is a follow-up.'
            : 'Starting with this request.',
        detailRows: [
          ...(state.interpretation === undefined
            ? []
            : [
                {
                  label: 'Interpretation',
                  value: `${state.interpretation.route}/${state.interpretation.continuation}`,
                },
                {
                  label: 'Requested intents',
                  value: state.interpretation.requestedIntents
                    .map((intent) => intent.phrase)
                    .join(', '),
                },
              ]),
          { label: 'Request', value: safeWorkLogUserText(state.query) },
          { label: 'Earlier answers', value: String(state.priorTurnCount) },
          {
            label: 'Search area',
            value: describeSearchContext(state.searchContext),
          },
        ],
        startedAtMs: input.interpretStartedAt,
        completedAtMs: Date.now(),
      })
      return {
        ...state,
        intent,
        priorProviders: collectLatestFrozenProviders(state.priorTurns),
        priorAllowedSlugs: collectLatestFrozenAllowedSlugs(state.priorTurns),
      }
    },
    route: ({ state }) => {
      const interpretation = state.interpretation
      const lane =
        interpretation?.route === 'operation'
        || interpretation?.route === 'confirmation'
          ? ('operation' as const)
          : ('business' as const)
      const continuation = interpretation?.continuation ?? 'new'
      const route: RuntimeAnswerRoute =
        state.querySafety?.kind === 'refused'
          ? { kind: 'safety_refusal' }
          : {
              kind: 'tool_search',
              shouldRunBusinessRetrievalFirst: false,
              agent: {
                lane,
                continuation,
                allowedReadToolFamily: 'shared',
                exactOperationDetailRequired: lane === 'operation',
                effectAllowed:
                  lane === 'operation'
                  && interpretation?.effectPolicy !== 'candidate_only',
              },
            }
      return {
        ...state,
        route,
      }
    },
    retrieval: async ({ state }) => {
      if (state.resumeCheckpoint !== undefined) {
        return {
          ...state,
          responsePlan: planAnswerTurn({
            query: state.query,
            priorTurnsCount: state.priorTurnCount,
            searchContext: state.searchContext,
          }),
        }
      }
      if (state.route?.kind !== 'tool_search') {
        return state
      }
      const priorOperationCandidates =
        collectLatestFrozenOperationCandidates(state.priorTurns)
      const priorSelectedOperationRef =
        collectLatestFrozenSelectedOperationRef(state.priorTurns)
      const structuredSelection = parseAnswerOperationSelectionRecognition(
        state.query,
      )
      if (
        structuredSelection.kind === 'absent'
        && (
          state.interpretation?.route === 'confirmation'
          || state.interpretation?.continuation === 'resolve_pending'
        )
        && state.pendingDecision === undefined
      ) {
        return {
          ...state,
          responsePlan: planPendingOperationClarification({
            query: state.query,
            hasPendingDecision: state.pendingDecision !== undefined,
          }),
        }
      }
      if (
        structuredSelection.kind === 'invalid' ||
        (structuredSelection.kind === 'valid' &&
          priorOperationCandidates.length === 0)
      ) {
        return {
          ...state,
          keylessDataAsk: keylessDataAskFromCandidates(
            priorOperationCandidates,
            structuredSelection.kind === 'invalid' ? 'changed' : undefined,
          ),
        }
      }
      if (structuredSelection.kind === 'valid') {
        const keylessExecutableSource =
          input.input.keylessExecutableSource ?? convexKeylessExecutableSource
        const selection = await resolveKeylessDataAskSelection(
          state.query,
          priorOperationCandidates,
          keylessExecutableSource,
        )
        if (selection !== undefined) {
          return {
            ...state,
            keylessDataAsk: selection,
          }
        }
      }
      const continuation = state.interpretation?.continuation
      const canReusePriorOperation =
        continuation === 'resolve_pending'
        || (
          state.interpretation?.route === 'operation'
          && continuation === 'refine_prior_operation'
        )
      if (structuredSelection.kind === 'absent' && canReusePriorOperation) {
        const keylessExecutableSource =
          input.input.keylessExecutableSource ?? convexKeylessExecutableSource
        const continuationResolution = await resolveKeylessDataAskFromInterpretation(
          continuation ?? 'new',
          priorOperationCandidates,
          priorSelectedOperationRef,
          keylessExecutableSource,
        )
        if (continuationResolution !== undefined) {
          return {
            ...state,
            keylessDataAsk: continuationResolution,
          }
        }
      }
      const responsePlan = planAnswerTurn({
        query: state.query,
        priorTurnsCount: state.priorTurnCount,
        searchContext: state.searchContext,
      })
      if (responsePlan.mode === 'clarify') {
        return { ...state, responsePlan }
      }
      return { ...state, responsePlan }
    },
    model: async ({ state }) => {
      if (
        state.captured !== undefined
        || state.errorCopyId !== undefined
        || state.errorProblem !== undefined
      ) {
        return state
      }

      const route = state.route
      if (route === undefined) {
        return state
      }
      if (route.kind === 'safety_refusal') {
        return applyToolLedResult(
          state,
          await boundaryTurnPath.run(
            runtimeTurnPathContext(input, state),
            {
              kind: 'safety_refusal',
              safetyReason:
                state.querySafety?.kind === 'refused'
                  ? state.querySafety.reason
                  : 'unsafe_request',
            },
          ),
        )
      }

      const seedToolCalls =
        state.resumeCheckpoint === undefined ? state.toolCalls : []
      const keylessExecutableSource =
        input.input.keylessExecutableSource ?? convexKeylessExecutableSource
      const keylessDataAsk = state.keylessDataAsk
      const priorOperationPresentation = latestPriorOperationPresentation(state.priorTurns)
      const priorProviderEvidenceAllowed =
        state.intent === 'filter_known'
        || state.intent === 'compare_known'
        || state.intent === 'inquiry_handoff'
      const result = await agentTurnPath.run(
        runtimeTurnPathContext(input, state),
        {
          query: state.query,
          followUpIntent: state.intent,
          searchContext: state.searchContext,
          priorProviders: priorProviderEvidenceAllowed ? state.priorProviders : [],
          priorAllowedSlugs: priorProviderEvidenceAllowed ? state.priorAllowedSlugs : [],
          effectiveRoute: route.agent,
          ...(state.interpretation === undefined
            ? {}
            : { requestedIntents: state.interpretation.requestedIntents }),
          ...(state.priorOperationInput === undefined
            ? {}
            : {
                priorOperationInput: state.priorOperationInput,
                ...(state.priorOperationRef === undefined
                  ? {}
                  : { priorOperationRef: state.priorOperationRef }),
              }),
          ...(state.priorOperationRef === undefined
          || priorOperationPresentation === undefined
            ? {}
            : { priorOperationPresentation }),
          keylessExecutableSource,
          ...(input.input.operationExecuteDeps === undefined
            ? {}
            : {
                operationExecuteDeps:
                  input.input.operationExecuteDeps,
              }),
          ...(keylessDataAsk === undefined ? {} : { keylessDataAsk }),
          ...(state.responsePlan?.mode === 'clarify'
          || keylessDataAsk?.kind === 'needs_clarification'
            ? { disableTools: true }
            : {}),
        },
        seedToolCalls,
        undefined,
        keylessDataAsk === undefined
          ? undefined
          : state.responsePlan?.toolPolicy,
      )
      return applyToolLedResult(state, result)
    },
    gate: async ({ state }) => {
      let captured = state.captured
      let errorCopyId = state.errorCopyId
      let errorProblem = state.errorProblem
      let gate = state.gate
      const toolCalls = [...state.toolCalls]
      const allowedSlugs = state.allowedSlugs

      if (
        captured === undefined &&
        errorCopyId === undefined &&
        errorProblem === undefined
      ) {
        const copyId = makeCopyId()
        errorCopyId = copyId
        errorProblem = buildAnswerTurnProblem('answer_turn_failed')
      } else if (captured !== undefined) {
        const finalized = finalizeAnswerTurnSnapshot({
          snapshot: captured,
          allowedSlugs,
        })
        if (!finalized.ok) {
          captured = undefined
          errorCopyId = finalized.copyId
          errorProblem = buildAnswerTurnProblem(finalized.code)
          gate = finalized.gate
        } else {
          captured = finalized.snapshot
          gate = finalized.gate
        }
      }

      const finalTurnStatus = captured === undefined ? 'error' : 'complete'
      const finalGate =
        gate ??
        ({
          ok: finalTurnStatus === 'complete',
          source: 'turn_status',
          ...(finalTurnStatus === 'error' ? { code: 'turn_error' } : {}),
        } satisfies AnswerRunGateSummary)
      await input.harness.evaluateGate(finalGate, finalTurnStatus)

      return {
        ...state,
        captured,
        errorCopyId,
        ...(errorProblem === undefined
          ? {}
          : { errorProblem, errorProblemJson: JSON.stringify(errorProblem) }),
        toolCalls,
        allowedSlugs,
        gate,
        finalGate,
        finalTurnStatus,
      }
    },
    assemble: async ({ state }) => {
      if (
        state.captured === undefined ||
        state.assembly === undefined ||
        state.assembled
      ) {
        return state
      }
      await emitSnapshotWithAssembly(
        {
          signal: input.input.signal,
          send: input.send,
          timings: input.timings,
          workLog: input.workLog,
        },
        state.captured,
        state.assembly.path,
        state.assembly.metadata ?? {},
      )
      return { ...state, assembled: true }
    },
    persist: async ({ state }) => {
      input.timings.record('turn.persistence_prepare', 0)
      const persistInput = buildPersistAnswerTurnInput({
        input: input.input,
        state,
        timings: input.timings,
        workLog: input.workLog,
        harness: input.harness,
      })

      const persistResult = await input.harness.persist(() =>
        persistAnswerTurnWithResult(persistInput),
      )
      return {
        ...state,
        persistInput,
        persistResult,
      }
    },
    report: async ({ state }) => {
      // The turn lease ends at the persistence handoff. A finalizer may take
      // longer than one heartbeat; renewals after it settles would report a
      // false lease conflict and suppress the terminal complete frame.
      input.stopLeaseHeartbeat()
      let reportState: StreamAnswerTurnRuntimeState = state
      let persistInput = state.persistInput
      let persistResult = state.persistResult

      if (
        persistInput !== undefined &&
        persistResult?.failure === 'unknown' &&
        persistInput.sourceWriteRequest !== undefined &&
        persistInput.sourceWriteBody !== undefined &&
        !answerHarnessRunAborted(input)
      ) {
        const recoveredFinalization =
          await finalizePersistedAnswerTurnHarnessRun({
            input: persistInput,
            persistResult,
            harnessRun: input.harness.loop.snapshot(
              harnessStatusForAnswerTurn(
                state.finalTurnStatus ?? persistResult.status,
                state.finalGate ?? persistInput.gate,
              ),
            ),
            runtimeEvents: input.harness.events,
          })
        if (answerHarnessFinalizationSucceeded(recoveredFinalization)) {
          input.harness.loop.emitOperationEvent({
            type: 'answer.harness_finalization',
            status: recoveredFinalization.status,
          })
          return {
            ...state,
            persistResult: { ...persistResult, ok: true },
            finalizationResult: recoveredFinalization,
          }
        }
      }

      if (
        (persistInput === undefined || persistResult?.failure === 'unknown') &&
        !answerHarnessRunAborted(input)
      ) {
        const errorProblem = buildAnswerTurnProblem(
          'answer_turn_persist_failed',
        )
        const operationArtifacts = readOperationArtifacts(
          reportState.captured ?? persistInput?.captured,
        )
        const failedState: StreamAnswerTurnRuntimeState = {
          ...state,
          captured: undefined,
          ...(operationArtifacts === undefined ? {} : { operationArtifacts }),
          errorCopyId: makeCopyId(),
          errorProblem,
          errorProblemJson: JSON.stringify(errorProblem),
          finalGate: { ok: false, source: 'turn_status', code: 'turn_error' },
          finalTurnStatus: 'error',
        }
        const recoveryPersistInput = buildPersistAnswerTurnInput({
          input: input.input,
          state: failedState,
          timings: input.timings,
          workLog: input.workLog,
          harness: input.harness,
        })
        const recoveryPersistResult = await input.harness.persist(() =>
          persistAnswerTurnWithResult(recoveryPersistInput),
        )
        reportState = {
          ...failedState,
          persistInput: recoveryPersistInput,
          persistResult: recoveryPersistResult,
        }
        persistInput = recoveryPersistInput
        persistResult = recoveryPersistResult
      }

      if (
        persistResult?.ok !== true ||
        persistInput === undefined ||
        persistInput.sourceWriteRequest === undefined ||
        persistInput.sourceWriteBody === undefined
      ) {
        return reportState
      }

      const finalizationHarnessRun = input.harness.loop.snapshot(
        harnessStatusForAnswerTurn(
          reportState.finalTurnStatus ?? persistResult.status,
          reportState.finalGate ?? persistInput.gate,
        ),
      )
      const finalizationRuntimeEvents = input.harness.events.slice()
      let finalizationResult: AnswerHarnessFinalizationResult
      try {
        finalizationResult = await finalizePersistedAnswerTurnHarnessRun({
          input: persistInput,
          persistResult,
          harnessRun: finalizationHarnessRun,
          runtimeEvents: finalizationRuntimeEvents,
        })
      } catch (error) {
        finalizationResult = {
          status: 'denied',
          reason: 'source_write_failed',
          message: error instanceof Error ? error.message : String(error),
        }
      }
      input.harness.loop.emitOperationEvent({
        type: 'answer.harness_finalization',
        status: finalizationResult.status,
        ...(finalizationResult.status === 'accepted' ||
        finalizationResult.status === 'replayed'
          ? {}
          : { reason: finalizationResult.reason }),
      })
      if (
        !answerHarnessFinalizationSucceeded(finalizationResult) &&
        !(
          finalizationResult.status === 'conflict' &&
          finalizationResult.reason === 'stopped'
        ) &&
        !answerHarnessRunAborted(input)
      ) {
        let replayProbe: AnswerTurnReservationResult | undefined
        try {
          replayProbe = await reserveAnswerTurn({
            sessionId: persistInput.sessionId,
            ...(persistInput.isNewThread
              ? {}
              : { threadId: persistInput.threadId }),
            query: persistInput.query,
            requestDigest: persistInput.requestDigest,
            reservationKey: persistInput.reservationKey,
            title: persistInput.title,
            sourceWriteRequest: persistInput.sourceWriteRequest,
            sourceWriteBody: persistInput.sourceWriteBody,
          })
        } catch {
          replayProbe = undefined
        }

        if (
          replayProbe?.kind === 'replayed' &&
          replayProbe.state === 'stopped'
        ) {
          return {
            ...reportState,
            finalizationResult: {
              status: 'conflict',
              reason: 'stopped',
              message: 'Answer turn was stopped before finalization retry.',
            },
          }
        }
        if (
          replayProbe?.kind === 'replayed' &&
          replayProbe.state === 'finalized'
        ) {
          let exactRetry: AnswerHarnessFinalizationResult
          try {
            exactRetry = await finalizePersistedAnswerTurnHarnessRun({
              input: persistInput,
              persistResult,
              harnessRun: finalizationHarnessRun,
              runtimeEvents: finalizationRuntimeEvents,
              finalizer: async ({ request, ...args }) =>
                finalizeReservedAnswerTurnFromSource(request, args),
            })
          } catch (error) {
            exactRetry = {
              status: 'denied',
              reason: 'source_write_failed',
              message: error instanceof Error ? error.message : String(error),
            }
          }
          input.harness.loop.emitOperationEvent({
            type: 'answer.harness_finalization',
            status: exactRetry.status,
            ...(exactRetry.status === 'accepted' ||
            exactRetry.status === 'replayed'
              ? {}
              : { reason: exactRetry.reason }),
          })
          return {
            ...reportState,
            finalizationResult: exactRetry,
          }
        }

        const errorProblem = buildAnswerTurnProblem(
          'answer_turn_persist_failed',
        )
        const operationArtifacts = readOperationArtifacts(
          reportState.captured ?? persistInput?.captured,
        )
        const failedState: StreamAnswerTurnRuntimeState = {
          ...reportState,
          captured: undefined,
          ...(operationArtifacts === undefined ? {} : { operationArtifacts }),
          errorCopyId: makeCopyId(),
          errorProblem,
          errorProblemJson: JSON.stringify(errorProblem),
          finalGate: { ok: false, source: 'turn_status', code: 'turn_error' },
          finalTurnStatus: 'error',
        }
        const recoveryPersistInput = buildPersistAnswerTurnInput({
          input: input.input,
          state: failedState,
          timings: input.timings,
          workLog: input.workLog,
          harness: input.harness,
        })
        const recoveryPersistResult = await input.harness.persist(() =>
          persistAnswerTurnWithResult(recoveryPersistInput),
        )
        if (recoveryPersistResult.ok) {
          let recoveryFinalization: AnswerHarnessFinalizationResult
          try {
            recoveryFinalization = await finalizePersistedAnswerTurnHarnessRun({
              input: recoveryPersistInput,
              persistResult: recoveryPersistResult,
              harnessRun: input.harness.loop.snapshot(
                harnessStatusForAnswerTurn('error', failedState.finalGate),
              ),
              runtimeEvents: input.harness.events,
              finalizer: async ({ request, ...args }) =>
                finalizeReservedAnswerTurnFromSource(request, args),
            })
          } catch (error) {
            recoveryFinalization = {
              status: 'denied',
              reason: 'source_write_failed',
              message: error instanceof Error ? error.message : String(error),
            }
          }

          input.harness.loop.emitOperationEvent({
            type: 'answer.harness_finalization',
            status: recoveryFinalization.status,
            ...(recoveryFinalization.status === 'accepted' ||
            recoveryFinalization.status === 'replayed'
              ? {}
              : { reason: recoveryFinalization.reason }),
          })
          if (answerHarnessFinalizationSucceeded(recoveryFinalization)) {
            return {
              ...failedState,
              persistInput: recoveryPersistInput,
              persistResult: recoveryPersistResult,
              finalizationResult: recoveryFinalization,
            }
          }
        }
      }

      return {
        ...reportState,
        finalizationResult,
      }
    },
  }
}

function buildPersistAnswerTurnInput(input: {
  input: StreamAnswerTurnInput
  state: StreamAnswerTurnRuntimeState
  timings: TurnTimingCollector
  workLog: WorkStepEmitter
  harness: LiveAnswerHarnessOperation
}): PersistAnswerTurnInput {
  const finalTurnStatus =
    input.state.finalTurnStatus ??
    (input.state.captured === undefined ? 'error' : 'complete')
  const finalGate =
    input.state.finalGate ??
    ({
      ok: finalTurnStatus === 'complete',
      source: 'turn_status',
      ...(finalTurnStatus === 'error' ? { code: 'turn_error' } : {}),
    } satisfies AnswerRunGateSummary)
  const allowedSlugs =
    input.state.allowedSlugs ??
    collectAllowedSlugsFromToolResults(
      toolCallRecordsToGateInput(input.state.toolCalls),
    )
  const pendingDecision = pendingDecisionFor(
    input.state.operationArtifacts?.operationOutcome,
    input.state.operationArtifacts?.operationSelection,
    input.state.toolCalls,
  )
  const selectedInputDigest = selectedInputDigestFor(
    input.state.toolCalls,
    input.state.operationArtifacts?.operationSelection,
  )
  const interpretation = input.state.interpretation
  const continuationSource = input.state.continuationSource
  const terminalCheckpointDigest = input.state.checkpointDigestRef.value

  return {
    reservationKey: input.state.reservationKey,
    requestDigest: input.state.requestDigest,
    expectedGeneration: input.state.generation,
    sessionId: input.input.sessionId,
    threadId: input.state.threadId,
    isNewThread: input.state.isNewThread,
    createdAt: input.state.createdAt,
    query: input.state.query,
    intent: input.state.intent,
    ...(interpretation === undefined
      ? {}
      : {
          interpretation,
          requestedIntents: interpretation.requestedIntents,
        }),
    ...(continuationSource === undefined ? {} : { continuationSource }),
    ...(pendingDecision === undefined ? {} : { pendingDecision }),
    ...(selectedInputDigest === undefined ? {} : { selectedInputDigest }),
    ...(terminalCheckpointDigest === undefined
      ? {}
      : { terminalCheckpointDigest }),

    title: buildThreadTitle(input.state.query),
    turnId: input.state.turnId,
    turnSeq: input.state.turnSeq,
    ...(input.state.captured === undefined
      ? {}
      : { captured: input.state.captured }),
    ...(input.state.errorCopyId === undefined
      ? {}
      : { errorCopyId: input.state.errorCopyId }),
    ...(input.state.errorProblem === undefined
      ? {}
      : { errorProblemJson: JSON.stringify(input.state.errorProblem) }),
    ...(input.state.operationArtifacts === undefined
      ? {}
      : { operationArtifacts: input.state.operationArtifacts }),
    toolCalls: input.state.toolCalls,
    ...(input.state.modelRequests === undefined
      ? {}
      : { modelRequests: input.state.modelRequests }),
    gate: finalGate,
    searchContext: input.state.searchContext,
    timings: input.timings.entries(),
    workLog: input.workLog.entries(),
    allowedSlugs,
    ...(input.input.sourceWriteRequest === undefined
      ? {}
      : { sourceWriteRequest: input.input.sourceWriteRequest }),
    ...(input.input.sourceWriteBody === undefined
      ? {}
      : { sourceWriteBody: input.input.sourceWriteBody }),
    harnessRun: input.harness.loop.snapshot(
      harnessStatusForAnswerTurn(finalTurnStatus, finalGate),
    ),
    harnessRuntimeEvents: input.harness.events,
  }
}

function answerHarnessRunAborted(input: {
  input: StreamAnswerTurnInput
  harness: LiveAnswerHarnessOperation
}): boolean {
  return (
    input.input.signal?.aborted === true ||
    input.harness.loop.snapshot().summary.run.status === 'aborted'
  )
}
function startAnswerTurnLeaseHeartbeat(input: {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
  sourceWriteRequest?: Request
  sourceWriteBody?: string | Uint8Array
  signal: AbortSignal
  onLost: (loss: AnswerTurnLeaseLoss) => void
}): () => void {
  if (input.signal.aborted) return () => {}
  let stopped = false
  let lost = false
  let inFlight = false
  let transportFailures = 0
  let leaseExpiresAt = Date.now() + ANSWER_TURN_EXECUTION_LEASE_MS
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  const lose = (loss: AnswerTurnLeaseLoss): void => {
    if (stopped || lost) return
    lost = true
    input.onLost(loss)
  }
  const armExpiry = (): void => {
    clearTimeout(expiryTimer)
    expiryTimer = setTimeout(() => lose({ kind: 'transport' }), Math.max(
      1,
      leaseExpiresAt - Date.now() - 1,
    ))
  }
  armExpiry()
  const recordTransportFailure = (): void => {
    const now = Date.now()
    if (
      transportFailures === 0
      && now < leaseExpiresAt - ANSWER_TURN_EXECUTION_LEASE_RENEW_INTERVAL_MS
    ) {
      transportFailures = 1
      return
    }
    lose({ kind: 'transport' })
  }
  const renew = async (): Promise<void> => {
    if (stopped || lost || inFlight || input.signal.aborted) return
    inFlight = true
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        renewAnswerTurnLease({
          reservationKey: input.reservationKey,
          requestDigest: input.requestDigest,
          sessionId: input.sessionId,
          threadId: input.threadId,
          turnId: input.turnId,
          turnSeq: input.turnSeq,
          generation: input.generation,
          ...(input.sourceWriteRequest === undefined
            ? {}
            : { sourceWriteRequest: input.sourceWriteRequest }),
          ...(input.sourceWriteBody === undefined
            ? {}
            : { sourceWriteBody: input.sourceWriteBody }),
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('answer_turn_lease_renewal_timeout'))
          }, ANSWER_TURN_EXECUTION_LEASE_RENEW_INTERVAL_MS)
        }),
      ])
      if (result.kind !== 'renewed') {
        lose({ kind: 'fence_conflict', reason: result.reason })
        return
      }
      transportFailures = 0
      leaseExpiresAt = Date.now() + ANSWER_TURN_EXECUTION_LEASE_MS
      armExpiry()
    } catch {
      recordTransportFailure()
    } finally {
      clearTimeout(timeout)
      inFlight = false
    }
  }
  const timer = setInterval(() => {
    void renew()
  }, ANSWER_TURN_EXECUTION_LEASE_RENEW_INTERVAL_MS)
  return () => {
    stopped = true
    clearInterval(timer)
    clearTimeout(expiryTimer)
  }
}


function checkpointRouteFor(
  route: EffectiveAnswerRoute | undefined,
): AnswerTurnCheckpoint['route'] {
  switch (route?.kind) {
    case 'frozen_filter':
    case 'frozen_compare':
    case 'inquiry_handoff':
    case 'boundary_explain':
    case 'unsupported':
    case 'tool_search':
      return route.kind
    case 'rationale':
      return 'rationale'
    case 'safety_refusal':
      return 'safety_refusal'
    default:
      return undefined
  }
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

      const checkpointRoute = checkpointRouteFor(state.route)
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
        ...(checkpointRoute === undefined ? {} : { route: checkpointRoute }),
        intent: state.intent,
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

function applyToolLedResult(
  state: StreamAnswerTurnRuntimeState,
  result: TurnPathResult | undefined,
): StreamAnswerTurnRuntimeState {
  if (result === undefined) {
    return state
  }

  return {
    ...state,
    captured: result.snapshot,
    errorCopyId: result.errorCopyId,
    ...(result.errorProblem === undefined
      ? {}
      : {
          errorProblem: result.errorProblem,
          errorProblemJson: JSON.stringify(result.errorProblem),
        }),
    toolCalls: result.toolCalls,
    ...(result.modelRequests === undefined
      ? {}
      : {
          modelRequests: appendModelRequests(
            state.modelRequests,
            result.modelRequests,
          ),
        }),
    allowedSlugs: result.allowedSlugs,
    ...(result.operationArtifacts === undefined
      ? {}
      : { operationArtifacts: result.operationArtifacts }),
    gate: result.gate,
    ...(result.assembly === undefined ? {} : { assembly: result.assembly }),
  }
}

function appendModelRequests(
  prior: readonly HarnessModelRequestRecord[] | undefined,
  incoming: readonly HarnessModelRequestRecord[],
): readonly HarnessModelRequestRecord[] {
  const priorRequests = prior ?? []
  const offset = priorRequests.length
  return [
    ...priorRequests,
    ...incoming.map((request, index) => ({
      ...request,
      seq: offset + (request.seq ?? index),
    })),
  ]
}

function harnessStatusForAnswerTurn(
  status: AnswerTurnRecord['status'],
  gate: AnswerRunGateSummary | undefined,
): HarnessRunStatus {
  if (gate !== undefined && !gate.ok) {
    return 'blocked'
  }
  return status === 'complete' ? 'ok' : 'error'
}

async function emitTimedSnapshot(
  input: {
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
  },
  snapshot: AnswerSnapshot,
  path: string,
  metadata: SnapshotPlanMetadata = {},
): Promise<void> {
  const stopSseTiming = input.timings.start('sse.emit_snapshot', {
    path,
    providerCount: snapshot.providers.length,
  })
  let eventCount = 0
  try {
    for await (const event of emitSnapshotEvents(snapshot, {
      emitThinking: true,
      emitComplete: false,
      pauseMs: snapshotStreamPauseMs(path),
      ...(metadata.plan === undefined ? {} : { plan: metadata.plan }),
      ...(metadata.planMode === undefined
        ? {}
        : { responseMode: metadata.planMode }),
    })) {
      if (input.signal?.aborted === true) {
        break
      }
      eventCount += 1
      input.send(event)
    }
  } finally {
    stopSseTiming({ eventCount })
  }
}

function snapshotStreamPauseMs(path: string): number {
  if (
    path === 'boundary_explain' ||
    path === 'unsupported' ||
    path === 'inquiry_handoff' ||
    path === 'clarification'
  ) {
    return 250
  }
  if (
    path === 'retrieval_first' ||
    path === 'retrieval_empty' ||
    path === 'frozen_filter' ||
    path === 'frozen_compare'
  ) {
    return 140
  }
  return 140
}

async function emitOrDeferSnapshot(
  input: {
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    harness?: LiveAnswerHarnessOperation
    deferAssembly?: boolean
  },
  snapshot: AnswerSnapshot,
  path: string,
  metadata: SnapshotPlanMetadata = {},
): Promise<SnapshotAssemblyPlan | undefined> {
  if (input.deferAssembly === true) {
    return { path, metadata }
  }
  await emitSnapshotWithAssembly(input, snapshot, path, metadata)
  return undefined
}

async function emitSnapshotWithAssembly(
  input: {
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    harness?: LiveAnswerHarnessOperation
  },
  snapshot: AnswerSnapshot,
  path: string,
  metadata: SnapshotPlanMetadata = {},
): Promise<void> {
  const assemble = async (): Promise<void> => {
    const startedAt = Date.now()
    input.workLog.emit({
      id: 'assemble.answer',
      phase: 'assemble',
      status: 'running',
      title: 'Putting together the answer',
      summary: 'Putting the answer together from the details.',
      detailRows: [
        { label: 'Matches', value: String(snapshot.providers.length) },
      ],
      relatedProviderSlugs: snapshot.providers.map((provider) => provider.slug),
      startedAtMs: startedAt,
    })

    await emitTimedSnapshot(input, snapshot, path, metadata)

    input.workLog.emit({
      id: 'assemble.answer',
      phase: 'assemble',
      status: input.signal?.aborted === true ? 'stopped' : 'complete',
      title: 'Putting together the answer',
      summary:
        input.signal?.aborted === true
          ? 'The answer stopped before it finished.'
          : 'The answer is ready.',
      detailRows: [
        { label: 'Matches', value: String(snapshot.providers.length) },
        { label: 'Next step', value: snapshot.nextStep },
      ],
      relatedProviderSlugs: snapshot.providers.map((provider) => provider.slug),
      startedAtMs: startedAt,
      completedAtMs: Date.now(),
    })
  }

  if (input.harness === undefined) {
    await assemble()
    return
  }
  await input.harness.phase('assemble', assemble)
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

function withWorkStepDuration(step: AnswerWorkStep): AnswerWorkStep {
  if (
    step.durationMs !== undefined ||
    step.startedAtMs === undefined ||
    step.completedAtMs === undefined
  ) {
    return step
  }

  return {
    ...step,
    durationMs: Math.max(0, step.completedAtMs - step.startedAtMs),
  }
}

function describeSearchContext(
  searchContext: AeSearchContext | undefined,
): string {
  if (searchContext?.mode === 'whole_catalogue') {
    return 'All available options'
  }
  return aeSearchContextLocationQuery(searchContext) ?? 'Your request'
}

function createTurnTimingCollector(): TurnTimingCollector {
  const entries: AnswerTurnTimingEntry[] = []
  const record: TurnTimingCollector['record'] = (
    name,
    durationMs,
    metadata,
  ) => {
    entries.push({
      name,
      durationMs: roundNonNegative2(durationMs),
      atMs: Date.now(),
      ...(metadata === undefined ? {} : { metadata }),
    })
  }

  return {
    start: (name, metadata) => {
      const started = Date.now()
      return (endMetadata) => {
        record(name, Date.now() - started, {
          ...(metadata ?? {}),
          ...(endMetadata ?? {}),
        })
      }
    },
    record,
    add: (incoming, metadata) => {
      for (const entry of incoming) {
        entries.push({
          ...entry,
          ...(metadata === undefined
            ? {}
            : {
                metadata: {
                  ...(entry.metadata ?? {}),
                  ...metadata,
                },
              }),
        })
      }
    },
    entries: () => [...entries],
  }
}
