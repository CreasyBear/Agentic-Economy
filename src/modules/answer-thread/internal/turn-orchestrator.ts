import {
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerWorkStep,
} from '@/modules/answer/public'
import {
  buildBoundaryNextStep,
  buildBoundaryOneLine,
  buildBoundarySummary,
  buildInquiryHandoffNextStep,
  buildInquiryHandoffOneLine,
  buildInquiryHandoffSummary,
  buildUnsupportedNextStep,
  buildUnsupportedOneLine,
  buildUnsupportedSummary,
  inquiryHandoffProviders,
  resolveInquiryHandoff,
} from '@/modules/answer/public'
import {
  buildAgentJsonUrl,
  collectAllowedSlugsFromToolResults,
  computeLayoutProfile,
  emitSnapshotEvents,
  extractRequestedLocation,
  runAnswerToolUseAgent,
} from '@/modules/answer/public'
import type {
  HarnessModelRequestRecord,
  HarnessRunStatus,
  HarnessRunLoopPhaseHandlers,
} from '@/modules/harness/public'
import {
  aeSearchContextLocationQuery,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { resolveIntentRoute } from './intent-router'
import {
  ANSWER_SEARCH_PROVIDER_LIMIT,
  hasAnswerServiceSignal,
  planAnswerTurn,
  type AnswerResponsePlan,
} from './answer-response-planner'
import { publicWorkLog, safeWorkLogUserText } from './public-worklog'

import type {
  AnswerRunGateSummary,
  AnswerToolCallRecord,
  AnswerTurnRecord,
  AnswerTurnTimingEntry,
  FollowUpIntent,
} from '../answer-thread.schema'
import { assertAnswerTurnAccess } from './turn-guard'
import type { AnswerTurnAccessDecision } from './turn-guard'
import { runAnswerToolCall, toolCallRecordsToGateInput } from './tool-runner'
import { classifyFollowUpIntent, buildThreadTitle } from './follow-up-intent'
import { filterProvidersBySuburb, parseNarrowToSuburb } from './follow-up-query'
import {
  answerHarnessFinalizationSucceeded,
  collectLatestFrozenAllowedSlugs,
  collectLatestFrozenProviders,
  finalizePersistedAnswerTurnHarnessRun,
  persistAnswerTurnWithResult,
  readPriorCompleteTurns,
  type AnswerTurnRecordLite,
  type PersistAnswerTurnInput,
  type PersistAnswerTurnResult,
} from './answer-turn-finalization'
import {
  answerRunGateFromAnswerGate,
  finalizeAnswerTurnSnapshot,
  type FinalizeAnswerTurnSnapshotResult,
} from './answer-turn-safety'
import {
  createLiveAnswerHarnessOperation,
  type LiveAnswerHarnessOperation,
} from './answer-harness-operation'
import type { AnswerHarnessFinalizationResult } from '../answer-thread.functions'

const DEFAULT_LIMIT = ANSWER_SEARCH_PROVIDER_LIMIT

type AnswerRegistrySearchInput = {
  query: string
  limit: number
  mode?: 'near_me' | 'whole_catalogue'
  location?: string
}

type StreamPlanEvent = Extract<AnswerEvent, { type: 'plan' }>
type StreamPlanMode = StreamPlanEvent['mode']
type SnapshotPlanInput = Pick<StreamPlanEvent, 'mode' | 'providerBudget' | 'artifactBudget'>
type SnapshotPlanMetadata = {
  plan?: SnapshotPlanInput
  planMode?: StreamPlanMode
}
type SnapshotAssemblyPlan = {
  path: string
  metadata?: SnapshotPlanMetadata
}
type StreamToolLedTurnResult = {
  snapshot: AnswerSnapshot | undefined
  toolCalls: AnswerToolCallRecord[]
  modelRequests?: readonly HarnessModelRequestRecord[]
  allowedSlugs: ReadonlySet<string>
  errorCopyId: string | undefined
  gate: AnswerRunGateSummary | undefined
  assembly?: SnapshotAssemblyPlan
}

type StreamAnswerRoute = ReturnType<typeof resolveIntentRoute>

type StreamAnswerTurnRuntimeState = {
  query: string
  threadId: string
  turnId: string
  turnSeq: number
  isNewThread: boolean
  searchContext: AeSearchContext | undefined
  priorTurns: readonly AnswerTurnRecordLite[]
  priorTurnCount: number
  priorProviders: AnswerSource[]
  priorAllowedSlugs: readonly string[]
  intent: FollowUpIntent
  route?: StreamAnswerRoute | undefined
  responsePlan?: AnswerResponsePlan | undefined
  retrievalFirst?: StreamToolLedTurnResult | undefined
  narrowSuburb?: string | undefined
  captured?: AnswerSnapshot | undefined
  errorCopyId?: string | undefined
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
  threadId?: string
  query: string
  searchContext?: AeSearchContext
  signal?: AbortSignal
  sourceWriteRequest?: Request
  precheckedAccess?: Extract<AnswerTurnAccessDecision, { kind: 'allowed' }>
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
  const query = input.query.trim().slice(0, 200)
  if (query.length === 0) {
    return undefined
  }

  const timings = createTurnTimingCollector()
  const stopContextTiming = timings.start('turn.context_parse')
  const access = input.precheckedAccess ?? await assertAnswerTurnAccess({
    sessionId: input.sessionId,
    ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
  })

  const threadId = input.threadId ?? crypto.randomUUID()
  const turnId = crypto.randomUUID()
  const turnSeq = access.kind === 'allowed' ? access.turnCount + 1 : 1
  const harness = createLiveAnswerHarnessOperation({
    runId: turnId,
    sessionId: input.sessionId,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })

  let seq = -1
  const send = (event: AnswerEvent) => {
    if (input.signal?.aborted === true) {
      return
    }
    seq += 1
    onEvent({ seq, event })
  }
  const workLog = createWorkStepEmitter(send)

  if (access.kind === 'denied') {
    send({ type: 'error', code: access.code, copyId: makeCopyId() })
    return undefined
  }

  send({ type: 'thread', threadId, turnId, turnSeq })
  const interpretStartedAt = Date.now()
  workLog.emit({
    id: 'interpret.request',
    phase: 'interpret',
    status: 'running',
    title: 'Reading your request',
    summary: 'Checking the need, place, and whether this is a follow-up.',
    detailRows: [{ label: 'Request', value: safeWorkLogUserText(query) }],
    startedAtMs: interpretStartedAt,
  })

  const runResult = await harness.loop.run({
    initialState: {
      query,
      threadId,
      turnId,
      turnSeq,
      isNewThread: input.threadId === undefined,
      searchContext: input.searchContext,
      priorTurns: [],
      priorTurnCount: 0,
      priorProviders: [],
      priorAllowedSlugs: [],
      intent: 'refine_search',
      toolCalls: [],
      allowedSlugs: new Set(),
      assembled: false,
    } satisfies StreamAnswerTurnRuntimeState,
    phases: buildStreamAnswerTurnPhases({
      input,
      accessTurnCount: access.turnCount,
      interpretStartedAt,
      stopContextTiming,
      send,
      timings,
      workLog,
      harness,
    }),
  })
  const finalState = runResult.state
  const persistInput = finalState.persistInput
  const persistResult = finalState.persistResult
  const finalizationResult = finalState.finalizationResult

  if (finalState.captured !== undefined) {
    if (persistResult?.ok !== true) {
      send({ type: 'error', code: 'answer_turn_persist_failed', copyId: makeCopyId() })
      return { threadId, turnId, turnSeq }
    }
    if (persistInput?.sourceWriteRequest !== undefined && !answerHarnessFinalizationSucceeded(finalizationResult)) {
      send({ type: 'error', code: 'answer_turn_persist_failed', copyId: makeCopyId() })
      return { threadId, turnId, turnSeq }
    }
    send({ type: 'complete', answer: finalState.captured })
  }

  return { threadId, turnId, turnSeq }
}

function buildStreamAnswerTurnPhases(input: {
  input: StreamAnswerTurnInput
  accessTurnCount: number
  interpretStartedAt: number
  stopContextTiming: (metadata?: Record<string, string | number | boolean | null>) => void
  send: (event: AnswerEvent) => void
  timings: TurnTimingCollector
  workLog: WorkStepEmitter
  harness: LiveAnswerHarnessOperation
}): HarnessRunLoopPhaseHandlers<StreamAnswerTurnRuntimeState> {
  return {
    context: async ({ state }) => {
      const priorTurns = input.input.preloadedPriorTurns === undefined
        ? await readPriorCompleteTurns(input.input.threadId)
        : input.input.preloadedPriorTurns.filter((turn) => turn.status === 'complete')
      return {
        ...state,
        priorTurns,
        priorTurnCount: Math.max(priorTurns.length, input.accessTurnCount),
      }
    },
    intent: ({ state }) => {
      const intent = classifyFollowUpIntent(state.query, state.priorTurnCount)
      input.stopContextTiming({
        priorTurns: state.priorTurns.length,
        accessTurnCount: input.accessTurnCount,
        intent,
        isNewThread: input.input.threadId === undefined,
      })
      input.workLog.emit({
        id: 'interpret.request',
        phase: 'interpret',
        status: 'complete',
        title: 'Reading your request',
        summary: state.priorTurnCount > 0
          ? 'Using the latest answer thread to decide whether this is a follow-up.'
          : 'Starting a new search from this request.',
        detailRows: [
          { label: 'Request', value: safeWorkLogUserText(state.query) },
          { label: 'Earlier answers', value: String(state.priorTurnCount) },
          { label: 'Search area', value: describeSearchContext(state.searchContext) },
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
    route: ({ state }) => ({
      ...state,
      route: resolveIntentRoute(state.intent),
    }),
    retrieval: async ({ state }) => {
      if (state.route?.kind !== 'tool_search') {
        return state
      }

      const narrowSuburb = parseNarrowToSuburb(state.query)
      if (narrowSuburb !== undefined && state.priorProviders.length > 0) {
        return { ...state, narrowSuburb }
      }

      const responsePlan = planAnswerTurn({
        query: state.query,
        priorTurnsCount: state.priorTurnCount,
        searchContext: state.searchContext,
      })
      if (responsePlan.mode === 'clarify') {
        return { ...state, responsePlan }
      }

      const retrievalFirst = await streamRetrievalFirstTurn(runtimeStreamInput(input, state), responsePlan)
      const nextState = {
        ...state,
        responsePlan,
        retrievalFirst,
      }
      if (retrievalFirst?.snapshot !== undefined || retrievalFirst?.errorCopyId !== undefined) {
        return applyToolLedResult(nextState, retrievalFirst)
      }
      return nextState
    },
    model: async ({ state }) => {
      if (state.captured !== undefined || state.errorCopyId !== undefined) {
        return state
      }

      const route = state.route
      if (route === undefined) {
        return state
      }

      switch (route.kind) {
        case 'boundary_explain':
        case 'unsupported':
          return applyToolLedResult(
            state,
            await streamBoundaryTurn(runtimeStreamInput(input, state), route.kind),
          )
        case 'inquiry_handoff':
          return applyToolLedResult(
            state,
            await streamInquiryHandoffTurn(runtimeStreamInput(input, state)),
          )
        case 'frozen_filter':
        case 'frozen_compare': {
          const frozen = selectFrozenProviders(route.kind, state.priorProviders)
          if (state.priorProviders.length === 0 || (route.kind === 'frozen_compare' && frozen.length < 2)) {
            return applyToolLedResult(
              state,
              await streamInsufficientFrozenContextTurn(runtimeStreamInput(input, state), route.kind),
            )
          }
          emitFrozenProviderSteps(input.workLog, route.kind, frozen)
          const result = await streamAgentTurn(runtimeStreamInput(input, state), {
            query: state.query,
            priorProviders: frozen,
            priorAllowedSlugs: state.priorAllowedSlugs,
            followUpIntent: state.intent,
            searchContext: state.searchContext,
            disableTools: true,
          }, [], route.kind === 'frozen_compare' ? 'compare' : 'filter')
          return applyToolLedResult(state, result)
        }
        case 'tool_search': {
          if (state.narrowSuburb !== undefined) {
            const result = await streamAgentTurn(runtimeStreamInput(input, state), {
              query: state.query,
              priorProviders: reindexProviders(filterProvidersBySuburb(state.priorProviders, state.narrowSuburb)),
              priorAllowedSlugs: state.priorAllowedSlugs,
              followUpIntent: state.intent,
              searchContext: state.searchContext,
              disableTools: true,
            }, [], 'filter')
            return applyToolLedResult(state, result)
          }
          if (state.responsePlan?.mode === 'clarify') {
            return applyToolLedResult(
              state,
              await streamClarificationTurn(runtimeStreamInput(input, state), state.responsePlan),
            )
          }
          const result = await streamAgentTurn(runtimeStreamInput(input, state), {
            query: state.query,
            followUpIntent: state.intent,
            searchContext: state.searchContext,
          }, state.retrievalFirst?.toolCalls ?? [])
          return applyToolLedResult(state, result)
        }
      }
    },
    gate: async ({ state }) => {
      let captured = state.captured
      let errorCopyId = state.errorCopyId
      let gate = state.gate
      const toolCalls = [...state.toolCalls]
      const allowedSlugs = state.allowedSlugs

      if (captured === undefined && errorCopyId === undefined) {
        const copyId = makeCopyId()
        errorCopyId = copyId
        input.send({ type: 'error', code: 'answer_turn_failed', copyId })
      } else if (captured !== undefined) {
        const finalized = finalizeAnswerTurnSnapshot({ snapshot: captured, allowedSlugs })
        if (!finalized.ok) {
          captured = undefined
          errorCopyId = finalized.copyId
          gate = finalized.gate
          input.send({ type: 'error', code: finalized.code, copyId: finalized.copyId })
        } else {
          captured = finalized.snapshot
          gate = finalized.gate
        }
      }

      const finalTurnStatus = captured === undefined ? 'error' : 'complete'
      const finalGate = gate ?? {
        ok: finalTurnStatus === 'complete',
        source: 'turn_status',
        ...(finalTurnStatus === 'error' ? { code: 'turn_error' } : {}),
      } satisfies AnswerRunGateSummary
      await input.harness.evaluateGate(finalGate, finalTurnStatus)

      return {
        ...state,
        captured,
        errorCopyId,
        toolCalls,
        allowedSlugs,
        gate,
        finalGate,
        finalTurnStatus,
      }
    },
    assemble: async ({ state }) => {
      if (state.captured === undefined || state.assembly === undefined || state.assembled) {
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
      const finalTurnStatus = state.finalTurnStatus ?? (state.captured === undefined ? 'error' : 'complete')
      const finalGate = state.finalGate ?? {
        ok: finalTurnStatus === 'complete',
        source: 'turn_status',
        ...(finalTurnStatus === 'error' ? { code: 'turn_error' } : {}),
      } satisfies AnswerRunGateSummary
      const allowedSlugs = state.allowedSlugs
        ?? collectAllowedSlugsFromToolResults(toolCallRecordsToGateInput(state.toolCalls))

      input.timings.record('turn.persistence_prepare', 0, {
        status: finalTurnStatus,
        toolCalls: state.toolCalls.length,
      })
      const persistInput: PersistAnswerTurnInput = {
        sessionId: input.input.sessionId,
        threadId: state.threadId,
        isNewThread: state.isNewThread,
        title: buildThreadTitle(state.query),
        turnId: state.turnId,
        turnSeq: state.turnSeq,
        query: state.query,
        intent: state.intent,
        captured: state.captured,
        errorCopyId: state.errorCopyId,
        toolCalls: state.toolCalls,
        ...(state.modelRequests === undefined ? {} : { modelRequests: state.modelRequests }),
        gate: finalGate,
        searchContext: state.searchContext,
        timings: input.timings.entries(),
        workLog: input.workLog.entries(),
        allowedSlugs,
        ...(input.input.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: input.input.sourceWriteRequest }),
        harnessRun: input.harness.loop.snapshot(harnessStatusForAnswerTurn(finalTurnStatus, finalGate)),
        harnessRuntimeEvents: input.harness.events,
        skipHarnessSessionJournal: true,
      }
      const persistResult = await input.harness.persist(() => persistAnswerTurnWithResult(persistInput))
      return {
        ...state,
        persistInput,
        persistResult,
      }
    },
    report: async ({ state }) => {
      const persistInput = state.persistInput
      const persistResult = state.persistResult
      if (persistResult?.ok !== true || persistInput === undefined || persistInput.sourceWriteRequest === undefined) {
        return state
      }

      const finalizationResult = await finalizePersistedAnswerTurnHarnessRun({
        input: persistInput,
        persistResult,
        harnessRun: input.harness.loop.snapshot(harnessStatusForAnswerTurn(
          state.finalTurnStatus ?? persistResult.status,
          state.finalGate ?? persistInput.gate,
        )),
        runtimeEvents: input.harness.events,
      })
      input.harness.loop.emitOperationEvent({
        type: 'answer.harness_finalization',
        status: finalizationResult.status,
        ...(finalizationResult.status === 'accepted' || finalizationResult.status === 'replayed'
          ? {}
          : { reason: finalizationResult.reason }),
      })

      if (!answerHarnessFinalizationSucceeded(finalizationResult)) {
        throw new AnswerHarnessFinalizationError(finalizationResult)
      }

      return {
        ...state,
        finalizationResult,
      }
    },
  }
}

class AnswerHarnessFinalizationError extends Error {
  readonly code = 'answer_harness_finalization_failed'

  constructor(readonly result: AnswerHarnessFinalizationResult) {
    super(`Answer harness finalization failed with ${result.status}`)
    this.name = 'AnswerHarnessFinalizationError'
  }
}

function runtimeStreamInput(
  input: {
    input: StreamAnswerTurnInput
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    harness: LiveAnswerHarnessOperation
  },
  state: StreamAnswerTurnRuntimeState,
  options: { deferAssembly?: boolean } = {},
) {
  return {
    query: state.query,
    intent: state.intent,
    priorTurnsCount: state.priorTurnCount,
    priorProviders: state.priorProviders,
    priorAllowedSlugs: state.priorAllowedSlugs,
    searchContext: state.searchContext,
    signal: input.input.signal,
    send: input.send,
    timings: input.timings,
    workLog: input.workLog,
    harness: input.harness,
    deferAssembly: options.deferAssembly ?? true,
  }
}

function applyToolLedResult(
  state: StreamAnswerTurnRuntimeState,
  result: StreamToolLedTurnResult | undefined,
): StreamAnswerTurnRuntimeState {
  if (result === undefined) {
    return state
  }

  return {
    ...state,
    captured: result.snapshot,
    errorCopyId: result.errorCopyId,
    toolCalls: result.toolCalls,
    ...(result.modelRequests === undefined ? {} : { modelRequests: result.modelRequests }),
    allowedSlugs: result.allowedSlugs,
    gate: result.gate,
    ...(result.assembly === undefined ? {} : { assembly: result.assembly }),
  }
}

async function streamClarificationTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    deferAssembly?: boolean
  },
  plan: Extract<AnswerResponsePlan, { mode: 'clarify' }>,
): Promise<StreamToolLedTurnResult> {
  const startedAt = Date.now()
  input.workLog.emit({
    id: 'route.clarify',
    phase: 'route',
    status: 'running',
    title: 'Choosing a useful next question',
    summary: 'The request needs one more detail before showing listed businesses.',
    detailRows: [{ label: 'Missing detail', value: plan.reason === 'missing_service' ? 'Service type' : 'Search area' }],
    startedAtMs: startedAt,
  })
  input.workLog.emit({
    id: 'route.clarify',
    phase: 'route',
    status: input.signal?.aborted === true ? 'stopped' : 'complete',
    title: 'Choosing a useful next question',
    summary: 'Asking for the missing detail before showing provider cards.',
    detailRows: [{ label: 'Missing detail', value: plan.reason === 'missing_service' ? 'Service type' : 'Search area' }],
    startedAtMs: startedAt,
    completedAtMs: Date.now(),
  })

  const allowedSlugs = new Set<string>()
  const finalized = finalizeAnswerTurnSnapshot({ snapshot: plan.snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot(input, [], allowedSlugs, finalized)
  }
  const assembly = await emitOrDeferSnapshot(input, finalized.snapshot, 'clarification', { plan })
  return {
    snapshot: finalized.snapshot,
    toolCalls: [],
    allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}

async function streamRetrievalFirstTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    searchContext: AeSearchContext | undefined
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    harness: LiveAnswerHarnessOperation
    deferAssembly?: boolean
  },
  plan: Extract<AnswerResponsePlan, { mode: 'answer' }>,
): Promise<StreamToolLedTurnResult | undefined> {
  if (isSignalAborted(input.signal)) {
    return undefined
  }

  const searchInput = buildInitialRegistrySearchInput(input.query, input.searchContext, plan.providerBudget.searchLimit)
  const searchStartedAt = Date.now()
  input.workLog.emit({
    id: 'search.registry.initial',
    phase: 'search',
    status: 'running',
    title: 'Searching listed businesses',
    summary: 'Looking for listed businesses that match the request.',
    detailRows: buildSearchWorkStepDetailRows(searchInput),
    startedAtMs: searchStartedAt,
  })
  const stopSearchTiming = input.timings.start('retrieval.initial_search', {
    mode: searchInput.mode ?? 'query',
    hasLocation: searchInput.location !== undefined,
  })
  const result = await runAnswerToolCall({
    toolId: 'registry.search',
    input: searchInput,
    turnId: 'pending',
    seq: 0,
    harnessLoop: input.harness.loop,
  })
  stopSearchTiming({
    status: result.record.status,
    providerCount: result.providers.length,
  })
  input.workLog.emit({
    id: 'search.registry.initial',
    phase: 'search',
    status: result.record.status === 'complete' ? 'complete' : 'error',
    title: 'Searching listed businesses',
    summary: result.record.status === 'complete'
      ? describeProviderCount(result.providers.length, 'listed business')
      : 'The listed-business search did not complete.',
    detailRows: [
      ...buildSearchWorkStepDetailRows(searchInput),
      { label: 'Results', value: String(result.providers.length) },
    ],
    relatedProviderSlugs: result.providers.map((provider) => provider.slug),
    startedAtMs: searchStartedAt,
    completedAtMs: Date.now(),
  })
  input.timings.add(result.timings, {
    phase: 'initial_search',
    toolId: result.record.toolId,
    toolSeq: result.record.seq,
  })

  if (isSignalAborted(input.signal)) {
    return { snapshot: undefined, toolCalls: [result.record], allowedSlugs: result.allowedSlugs, errorCopyId: undefined, gate: undefined }
  }

  if (result.record.status !== 'complete') {
    return { snapshot: undefined, toolCalls: [result.record], allowedSlugs: result.allowedSlugs, errorCopyId: undefined, gate: undefined }
  }

  emitReadAndCompareSteps(input.workLog, result.providers)

  if (result.providers.length === 0) {
    if (!shouldReturnDeterministicEmptyState(input.query, searchInput)) {
      return { snapshot: undefined, toolCalls: [result.record], allowedSlugs: result.allowedSlugs, errorCopyId: undefined, gate: undefined }
    }

    const snapshot = withFollowUpLayout(
      buildDeterministicEmptySnapshot({
        query: input.query,
        searchInput,
        searchContext: input.searchContext,
      }),
      input.priorTurnsCount,
      input.intent,
    )

    const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs: result.allowedSlugs })
    if (!finalized.ok) {
      return rejectBlockedSnapshot(input, [result.record], result.allowedSlugs, finalized)
    }
    const assembly = await emitOrDeferSnapshot(input, finalized.snapshot, 'retrieval_empty', { planMode: 'empty' })
    return {
      snapshot: finalized.snapshot,
      toolCalls: [result.record],
      allowedSlugs: result.allowedSlugs,
      errorCopyId: undefined,
      gate: finalized.gate,
      ...(assembly === undefined ? {} : { assembly }),
    }
  }

  const snapshot = withFollowUpLayout(
    buildRetrievalFirstSnapshot({
      query: input.query,
      providers: result.providers,
      visibleLimit: plan.providerBudget.visibleLimit,
      searchInput,
      searchContext: input.searchContext,
    }),
    input.priorTurnsCount,
    input.intent,
  )

  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs: result.allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot(input, [result.record], result.allowedSlugs, finalized)
  }
  const assembly = await emitOrDeferSnapshot(input, finalized.snapshot, 'retrieval_first', { plan })

  return {
    snapshot: finalized.snapshot,
    toolCalls: [result.record],
    allowedSlugs: result.allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}

function buildInitialRegistrySearchInput(
  query: string,
  searchContext: AeSearchContext | undefined,
  searchLimit: number,
): AnswerRegistrySearchInput {
  const input: AnswerRegistrySearchInput = {
    query,
    limit: searchLimit,
  }

  if (searchContext?.mode === 'whole_catalogue') {
    return { ...input, mode: 'whole_catalogue' }
  }

  const contextLocation = aeSearchContextLocationQuery(searchContext)
  const userNamedLocation = extractRequestedLocation(query)
  if (contextLocation !== undefined && userNamedLocation === undefined) {
    return { ...input, mode: 'near_me', location: contextLocation }
  }

  return input
}

function buildRetrievalFirstSnapshot(input: {
  query: string
  providers: readonly AnswerSource[]
  visibleLimit: number
  searchInput: AnswerRegistrySearchInput
  searchContext: AeSearchContext | undefined
}): AnswerSnapshot {
  const providers = reindexProviders(input.providers.slice(0, input.visibleLimit))
  const count = providers.length
  const names = providerNameList(providers)
  const place = input.searchInput.location ?? extractRequestedLocation(input.query)
  const placeSuffix = place === undefined ? '' : ` for ${place}`

  return {
    query: input.query,
    oneLine: count === 1
      ? `1 listed business matches${placeSuffix}.`
      : `${count} listed businesses match${placeSuffix}.`,
    providers,
    summary: count === 1
      ? `${names} publishes service coverage${placeSuffix}. Agentic Economy does not book or take payment on this page.`
      : `${names} publish service coverage${placeSuffix}. Agentic Economy does not book or take payment on this page.`,
    nextStep: 'Open a listed provider page and send an inquiry when that option is published. Agentic Economy does not book or take payment on this page.',
    agentJsonUrl: buildAgentJsonUrl(
      buildAgentJsonQuery(input.query, input.searchInput),
      input.searchInput.limit,
      buildAgentJsonScope(input.searchInput, input.searchContext),
    ),
  }
}

function buildDeterministicEmptySnapshot(input: {
  query: string
  searchInput: AnswerRegistrySearchInput
  searchContext: AeSearchContext | undefined
}): AnswerSnapshot {
  const place = input.searchInput.location ?? extractRequestedLocation(input.query)
  const placeSuffix = place === undefined ? '' : ` for ${place}`

  return {
    query: input.query,
    oneLine: `No listed businesses match "${input.query}" yet.`,
    providers: [],
    summary: place === undefined
      ? 'No listed providers publish matching coverage yet.'
      : `No listed providers publish coverage${placeSuffix} yet.`,
    nextStep: 'Try a nearby suburb, browse the registry, or list a business that should appear here.',
    agentJsonUrl: buildAgentJsonUrl(
      buildAgentJsonQuery(input.query, input.searchInput),
      input.searchInput.limit,
      buildAgentJsonScope(input.searchInput, input.searchContext),
    ),
  }
}

function shouldReturnDeterministicEmptyState(
  query: string,
  searchInput: AnswerRegistrySearchInput,
): boolean {
  const requestedLocation = searchInput.location ?? extractRequestedLocation(query)
  return requestedLocation !== undefined && hasAnswerServiceSignal(query)
}

function providerNameList(providers: readonly AnswerSource[]): string {
  const names = providers.map((provider) => provider.name)
  if (names.length <= 2) {
    return names.join(' and ')
  }
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

function buildAgentJsonQuery(
  query: string,
  searchInput: AnswerRegistrySearchInput,
): string {
  if (searchInput.location === undefined || extractRequestedLocation(query) !== undefined) {
    return query
  }
  return `${query} near ${searchInput.location}`
}

function buildAgentJsonScope(
  searchInput: AnswerRegistrySearchInput,
  searchContext: AeSearchContext | undefined,
): { mode?: 'near_me' | 'whole_catalogue'; location?: string } | undefined {
  if (searchInput.mode === 'whole_catalogue') {
    return { mode: 'whole_catalogue' }
  }

  const location = searchInput.location ?? aeSearchContextLocationQuery(searchContext)
  return location === undefined ? undefined : { mode: 'near_me', location }
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
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

function rejectBlockedSnapshot(
  input: { send: (event: AnswerEvent) => void },
  toolCalls: readonly AnswerToolCallRecord[],
  allowedSlugs: ReadonlySet<string>,
  blocked: Extract<FinalizeAnswerTurnSnapshotResult, { ok: false }>,
): StreamToolLedTurnResult {
  input.send({ type: 'error', code: blocked.code, copyId: blocked.copyId })
  return {
    snapshot: undefined,
    toolCalls: [...toolCalls],
    allowedSlugs,
    errorCopyId: blocked.copyId,
    gate: blocked.gate,
  }
}

async function streamInsufficientFrozenContextTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    harness: LiveAnswerHarnessOperation
    deferAssembly?: boolean
  },
  routeKind: 'frozen_filter' | 'frozen_compare',
): Promise<StreamToolLedTurnResult> {
  const isCompare = routeKind === 'frozen_compare'
  const snapshot = withFollowUpLayout(
    {
      query: input.query,
      oneLine: isCompare ? 'No two listed businesses to compare yet.' : 'No listed businesses to filter yet.',
      providers: [],
      summary: isCompare
        ? 'There are not enough listed providers in the latest answer to compare.'
        : 'There are no listed providers in the latest answer to filter.',
      nextStep: 'Ask for a need and place, then compare or filter the listed businesses that appear.',
      agentJsonUrl: buildAgentJsonUrl(input.query, DEFAULT_LIMIT),
    },
    input.priorTurnsCount,
    input.intent,
  )

  input.workLog.emit({
    id: 'read.providers',
    phase: 'read',
    status: 'skipped',
    title: 'Using previous listed businesses',
    summary: 'There were not enough listed businesses in the latest answer for this follow-up.',
    detailRows: [{ label: 'Available from latest answer', value: '0' }],
    completedAtMs: Date.now(),
  })

  const allowedSlugs = new Set<string>()

  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot(input, [], allowedSlugs, finalized)
  }
  const assembly = await emitOrDeferSnapshot(
    input,
    finalized.snapshot,
    routeKind,
    { planMode: routeKind === 'frozen_compare' ? 'compare' : 'filter' },
  )

  return {
    snapshot: finalized.snapshot,
    toolCalls: [],
    allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}

function selectFrozenProviders(
  routeKind: 'frozen_filter' | 'frozen_compare',
  priorProviders: readonly AnswerSource[],
): AnswerSource[] {
  if (routeKind === 'frozen_filter') {
    return reindexProviders(priorProviders.filter((provider) => provider.inquiryUrl !== undefined))
  }
  return reindexProviders(priorProviders.slice(0, 2))
}

async function streamAgentTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    harness: LiveAnswerHarnessOperation
    deferAssembly?: boolean
  },
  agentInput: Parameters<typeof runAnswerToolUseAgent>[0],
  seedToolCalls: readonly AnswerToolCallRecord[] = [],
  planMode?: StreamPlanMode,
): Promise<StreamToolLedTurnResult | undefined> {
  const recoveryStartedAt = Date.now()
  if (agentInput.disableTools === true) {
    input.workLog.emit({
      id: 'search.registry.recovery',
      phase: 'search',
      status: 'skipped',
      title: 'Using listed businesses already in view',
      summary: 'No extra listed-business search is needed for this follow-up.',
      completedAtMs: recoveryStartedAt,
    })
  } else {
    input.workLog.emit({
      id: 'search.registry.recovery',
      phase: 'search',
      status: 'running',
      title: 'Trying another listed-business search',
      summary: 'The first search did not settle the answer, so AE is checking another listed-business search.',
      startedAtMs: recoveryStartedAt,
    })
  }
  input.send({ type: 'thinking', step: 'search', label: 'Searching listed businesses…' })

  const stopModelTiming = input.timings.start('model.agent_total', {
    toolsEnabled: agentInput.disableTools !== true,
    seedToolCalls: seedToolCalls.length,
  })
  try {
    const result = await runAnswerToolUseAgent({
      ...agentInput,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      harnessLoop: input.harness.loop,
    })
    stopModelTiming({
      providerCount: result.providers.length,
      toolCalls: result.toolCalls.length,
      gateOk: result.gate.ok,
    })
    input.timings.add(result.timings, { phase: 'agent' })
    if (agentInput.disableTools !== true) {
      input.workLog.emit({
        id: 'search.registry.recovery',
        phase: 'search',
        status: result.toolCalls.length === 0 ? 'skipped' : 'complete',
        title: result.toolCalls.length === 0
          ? 'Using the first search result'
          : 'Trying another listed-business search',
        summary: result.toolCalls.length === 0
          ? 'No extra listed-business search was needed.'
          : describeProviderCount(result.providers.length, 'listed business'),
        detailRows: buildRecoveryWorkStepDetailRows(result.toolCalls, result.providers.length),
        relatedProviderSlugs: result.providers.map((provider) => provider.slug),
        startedAtMs: recoveryStartedAt,
        completedAtMs: Date.now(),
      })
    }
    const toolCalls = [
      ...seedToolCalls,
      ...resequenceToolCalls(result.toolCalls, seedToolCalls.length),
    ]
    const gate = answerRunGateFromAnswerGate(result.gate)
    if (!result.gate.ok) {
      const copyId = result.gate.copyId
      input.send({ type: 'error', code: result.gate.code, copyId })
      return {
        snapshot: undefined,
        toolCalls,
        modelRequests: result.modelRequests,
        allowedSlugs: result.allowedSlugs,
        errorCopyId: copyId,
        gate,
      }
    }

    emitReadAndCompareSteps(input.workLog, result.providers)
    const snapshot = withFollowUpLayout(result.snapshot, input.priorTurnsCount, input.intent)
    const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs: result.allowedSlugs })
    if (!finalized.ok) {
      return {
        ...rejectBlockedSnapshot(input, toolCalls, result.allowedSlugs, finalized),
        modelRequests: result.modelRequests,
      }
    }
    const assembly = await emitOrDeferSnapshot(
      input,
      finalized.snapshot,
      'agent',
      planMode === undefined ? {} : { planMode },
    )
    return {
      snapshot: finalized.snapshot,
      toolCalls,
      modelRequests: result.modelRequests,
      allowedSlugs: result.allowedSlugs,
      errorCopyId: undefined,
      gate: finalized.gate,
      ...(assembly === undefined ? {} : { assembly }),
    }
  } catch {
    stopModelTiming({ error: true })
    input.workLog.emit({
      id: 'search.registry.recovery',
      phase: 'search',
      status: 'error',
      title: 'Trying another listed-business search',
      summary: 'The extra listed-business search did not complete.',
      startedAtMs: recoveryStartedAt,
      completedAtMs: Date.now(),
    })
    const copyId = makeCopyId()
    input.send({ type: 'error', code: 'answer_turn_failed', copyId })
    return {
      snapshot: undefined,
      toolCalls: [...seedToolCalls],
      allowedSlugs: collectAllowedSlugsFromToolResults(toolCallRecordsToGateInput(seedToolCalls)),
      errorCopyId: copyId,
      gate: undefined,
    }
  }
}

function resequenceToolCalls(
  records: readonly AnswerToolCallRecord[],
  startSeq: number,
): AnswerToolCallRecord[] {
  return records.map((record, index) => ({
    ...record,
    seq: startSeq + index,
  }))
}

async function streamInquiryHandoffTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    priorProviders: AnswerSource[]
    priorAllowedSlugs: readonly string[]
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    deferAssembly?: boolean
  },
): Promise<StreamToolLedTurnResult> {
  const priorProviders = reindexProviders(input.priorProviders)
  const resolution = resolveInquiryHandoff({ query: input.query, providers: priorProviders })
  const providers = reindexProviders(inquiryHandoffProviders(resolution))
  const selectedProvider =
    resolution.kind === 'resolved' || resolution.kind === 'provider_unavailable'
      ? resolution.provider
      : undefined
  const routeStartedAt = Date.now()

  input.workLog.emit({
    id: 'route.resolve_provider',
    phase: 'route',
    status: 'running',
    title: 'Resolving provider',
    summary: 'Matching the follow-up to a listed business already in this thread.',
    detailRows: [{ label: 'Listed businesses in thread', value: String(priorProviders.length) }],
    relatedProviderSlugs: priorProviders.map((provider) => provider.slug),
    startedAtMs: routeStartedAt,
  })
  input.workLog.emit({
    id: 'route.resolve_provider',
    phase: 'route',
    status: selectedProvider === undefined && resolution.kind !== 'choose_provider' ? 'skipped' : 'complete',
    title: 'Resolving provider',
    summary: describeInquiryHandoffResolution(resolution),
    detailRows: [
      { label: 'Listed businesses in thread', value: String(priorProviders.length) },
      { label: 'Selected provider', value: selectedProvider?.name ?? 'Needs selection' },
    ],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: routeStartedAt,
    completedAtMs: Date.now(),
  })

  const pathStartedAt = Date.now()
  input.workLog.emit({
    id: 'route.inquiry_path',
    phase: 'route',
    status: 'running',
    title: 'Checking inquiry path',
    summary: 'Checking whether the selected listing publishes a qualified inquiry form.',
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: pathStartedAt,
  })
  input.workLog.emit({
    id: 'route.inquiry_path',
    phase: 'route',
    status: resolution.kind === 'resolved' ? 'complete' : 'skipped',
    title: 'Checking inquiry path',
    summary: describeInquiryPath(resolution),
    detailRows: [{ label: 'Inquiry path', value: inquiryPathLabel(resolution) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: pathStartedAt,
    completedAtMs: Date.now(),
  })

  const boundaryStartedAt = Date.now()
  input.workLog.emit({
    id: 'route.safe_boundary',
    phase: 'route',
    status: 'complete',
    title: 'Checking safe-action boundary',
    summary: 'AE can route a qualified inquiry for owner review; it does not book, charge, or dispatch.',
    detailRows: [{ label: 'Allowed next step', value: 'Qualified inquiry for owner review' }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: boundaryStartedAt,
    completedAtMs: Date.now(),
  })

  const snapshot = withFollowUpLayout(
    {
      query: input.query,
      oneLine: buildInquiryHandoffOneLine(resolution),
      providers,
      summary: buildInquiryHandoffSummary(resolution),
      nextStep: buildInquiryHandoffNextStep(resolution),
      agentJsonUrl: buildAgentJsonUrl(input.query, DEFAULT_LIMIT),
    },
    input.priorTurnsCount,
    input.intent,
  )

  const allowedSlugs = new Set(input.priorAllowedSlugs)
  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot(input, [], allowedSlugs, finalized)
  }
  const assembly = await emitOrDeferSnapshot(input, finalized.snapshot, 'inquiry_handoff', { planMode: 'boundary' })
  return {
    snapshot: finalized.snapshot,
    toolCalls: [],
    allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}

async function streamBoundaryTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    priorProviders: AnswerSource[]
    priorAllowedSlugs: readonly string[]
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    deferAssembly?: boolean
  },
  kind: 'boundary_explain' | 'unsupported',
): Promise<StreamToolLedTurnResult> {
  const providers = reindexProviders(input.priorProviders)
  const oneLine = kind === 'boundary_explain' ? buildBoundaryOneLine() : buildUnsupportedOneLine()
  const summary =
    kind === 'boundary_explain'
      ? buildBoundarySummary(providers)
      : buildUnsupportedSummary(providers)
  const nextStep =
    kind === 'boundary_explain'
      ? buildBoundaryNextStep(providers)
      : buildUnsupportedNextStep(providers)
  const routeStartedAt = Date.now()
  input.workLog.emit({
    id: 'route.next_step',
    phase: 'route',
    status: 'running',
    title: 'Preparing the next step',
    summary: 'Separating listed facts from actions this page does not handle.',
    startedAtMs: routeStartedAt,
  })
  input.workLog.emit({
    id: 'route.next_step',
    phase: 'route',
    status: 'complete',
    title: 'Preparing the next step',
    summary: 'This page can help read, compare, and route to a listed business page. It does not book, take payment, or dispatch work.',
    detailRows: [{ label: 'Listed businesses carried forward', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: routeStartedAt,
    completedAtMs: Date.now(),
  })

  const snapshot = withFollowUpLayout(
    {
      query: input.query,
      oneLine,
      providers,
      summary,
      nextStep,
      agentJsonUrl: buildAgentJsonUrl(input.query, DEFAULT_LIMIT),
    },
    input.priorTurnsCount,
    input.intent,
  )

  const allowedSlugs = new Set(input.priorAllowedSlugs)
  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot(input, [], allowedSlugs, finalized)
  }
  const assembly = await emitOrDeferSnapshot(input, finalized.snapshot, kind, { planMode: 'boundary' })
  return {
    snapshot: finalized.snapshot,
    toolCalls: [],
    allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}

function describeInquiryHandoffResolution(resolution: ReturnType<typeof resolveInquiryHandoff>): string {
  switch (resolution.kind) {
    case 'resolved':
      return `${resolution.provider.name} was selected from the latest listed businesses.`
    case 'provider_unavailable':
      return `${resolution.provider.name} was selected, but it does not publish an AE inquiry form yet.`
    case 'choose_provider':
      return 'More than one listed business could match; the user needs to choose one.'
    case 'no_provider':
      return 'No listed business is available in the latest answer thread.'
  }
}

function describeInquiryPath(resolution: ReturnType<typeof resolveInquiryHandoff>): string {
  switch (resolution.kind) {
    case 'resolved':
      return `${resolution.provider.name} publishes a qualified inquiry path.`
    case 'provider_unavailable':
      return `${resolution.provider.name} does not publish an AE inquiry form yet.`
    case 'choose_provider':
      return 'Choose a provider before opening an inquiry path.'
    case 'no_provider':
      return 'Find a listed provider before opening an inquiry path.'
  }
}

function inquiryPathLabel(resolution: ReturnType<typeof resolveInquiryHandoff>): string {
  switch (resolution.kind) {
    case 'resolved':
      return 'Available'
    case 'provider_unavailable':
      return 'Not published'
    case 'choose_provider':
      return 'Needs provider selection'
    case 'no_provider':
      return 'Needs listed provider'
  }
}

function withFollowUpLayout(
  snapshot: AnswerSnapshot,
  priorTurnsCount: number,
  intent: FollowUpIntent,
): AnswerSnapshot {
  const compactLayout = priorTurnsCount > 0
  const layoutProfile = computeLayoutProfile({
    providerCount: snapshot.providers.length,
    ...(compactLayout ? { compactLayout: true } : {}),
    followUpIntent: intent,
  })
  return {
    ...snapshot,
    ...(compactLayout ? { compactLayout: true } : {}),
    layoutProfile,
  }
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
      ...(metadata.planMode === undefined ? {} : { responseMode: metadata.planMode }),
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
  if (path === 'boundary_explain' || path === 'unsupported' || path === 'inquiry_handoff' || path === 'clarification') {
    return 0
  }
  if (
    path === 'retrieval_first' ||
    path === 'retrieval_empty' ||
    path === 'frozen_filter' ||
    path === 'frozen_compare'
  ) {
    return 20
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
    title: 'Preparing the answer',
    summary: 'Building the visible answer from listed details.',
    detailRows: [{ label: 'Listed businesses', value: String(snapshot.providers.length) }],
    relatedProviderSlugs: snapshot.providers.map((provider) => provider.slug),
    startedAtMs: startedAt,
  })

  await emitTimedSnapshot(input, snapshot, path, metadata)

  input.workLog.emit({
    id: 'assemble.answer',
    phase: 'assemble',
    status: input.signal?.aborted === true ? 'stopped' : 'complete',
    title: 'Preparing the answer',
    summary: input.signal?.aborted === true
      ? 'The answer stopped before it finished.'
      : 'The answer is ready to inspect.',
    detailRows: [
      { label: 'Listed businesses', value: String(snapshot.providers.length) },
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

type WorkStepEmitter = {
  emit: (step: AnswerWorkStep) => void
  entries: () => AnswerWorkStep[]
}

function createWorkStepEmitter(send: (event: AnswerEvent) => void): WorkStepEmitter {
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
          ...(step.detailRows === undefined ? {} : { detailRows: step.detailRows }),
          ...(step.relatedProviderSlugs === undefined ? {} : { relatedProviderSlugs: step.relatedProviderSlugs }),
        })
      }
      const publicSteps = publicWorkLog(steps)
      send({ type: 'work-step', step: publicSteps[index === -1 ? publicSteps.length - 1 : index] as AnswerWorkStep })
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

function describeSearchContext(searchContext: AeSearchContext | undefined): string {
  if (searchContext?.mode === 'whole_catalogue') {
    return 'Whole catalogue'
  }
  return aeSearchContextLocationQuery(searchContext) ?? 'Request only'
}

function buildSearchWorkStepDetailRows(
  searchInput: AnswerRegistrySearchInput,
): NonNullable<AnswerWorkStep['detailRows']> {
  return [
    { label: 'Search words', value: safeWorkLogUserText(searchInput.query) },
    { label: 'Area', value: describeSearchInputArea(searchInput) },
    { label: 'Limit', value: String(searchInput.limit) },
  ]
}

function describeSearchInputArea(searchInput: AnswerRegistrySearchInput): string {
  if (searchInput.mode === 'whole_catalogue') {
    return 'Whole catalogue'
  }
  return searchInput.location ?? 'Request only'
}

function describeProviderCount(count: number, noun: string): string {
  if (count === 0) {
    return `No ${noun}es found.`
  }
  if (count === 1) {
    return `1 ${noun} found.`
  }
  return `${count} ${noun}es found.`
}

function emitReadAndCompareSteps(
  workLog: WorkStepEmitter,
  providers: readonly AnswerSource[],
): void {
  const completedAt = Date.now()
  workLog.emit({
    id: 'read.providers',
    phase: 'read',
    status: 'complete',
    title: 'Reading listed businesses',
    summary: providers.length === 0
      ? 'No listed businesses were returned for this search.'
      : describeProviderCount(providers.length, 'listed business'),
    detailRows: [{ label: 'Listed businesses', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    completedAtMs: completedAt,
  })

  workLog.emit({
    id: 'compare.fit',
    phase: 'compare',
    status: 'complete',
    title: 'Checking fit',
    summary: providers.length === 0
      ? 'No listed businesses fit this request yet.'
      : 'Keeping listed businesses whose published details fit this request.',
    detailRows: [{ label: 'Kept for answer', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    completedAtMs: completedAt,
  })
}

function emitFrozenProviderSteps(
  workLog: WorkStepEmitter,
  routeKind: 'frozen_filter' | 'frozen_compare',
  providers: readonly AnswerSource[],
): void {
  const completedAt = Date.now()
  workLog.emit({
    id: 'read.providers',
    phase: 'read',
    status: 'complete',
    title: 'Using previous listed businesses',
    summary: describeProviderCount(providers.length, 'listed business'),
    detailRows: [{ label: 'From latest answer', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    completedAtMs: completedAt,
  })
  workLog.emit({
    id: 'compare.fit',
    phase: 'compare',
    status: 'complete',
    title: routeKind === 'frozen_compare' ? 'Comparing listed options' : 'Checking fit',
    summary: routeKind === 'frozen_compare'
      ? 'Comparing the listed businesses already in the answer thread.'
      : 'Filtering the latest listed businesses against the follow-up.',
    detailRows: [{ label: 'Kept for answer', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    completedAtMs: completedAt,
  })
}

function buildRecoveryWorkStepDetailRows(
  toolCalls: readonly AnswerToolCallRecord[],
  providerCount: number,
): NonNullable<AnswerWorkStep['detailRows']> {
  const queries: string[] = []
  for (const call of toolCalls) {
    const query = readToolCallQuery(call)
    if (query.length > 0) {
      queries.push(query)
    }
  }

  return [
    ...(queries.length === 0 ? [] : [{ label: 'Searches tried', value: queries.map(safeWorkLogUserText).join(' -> ') }]),
    { label: 'Results', value: String(providerCount) },
  ]
}

function readToolCallQuery(call: AnswerToolCallRecord): string {
  try {
    const parsed = JSON.parse(call.inputJson) as { query?: unknown }
    return typeof parsed.query === 'string' ? parsed.query : ''
  } catch {
    return ''
  }
}

type TurnTimingCollector = {
  start: (
    name: string,
    metadata?: Record<string, string | number | boolean | null>,
  ) => (metadata?: Record<string, string | number | boolean | null>) => void
  record: (
    name: string,
    durationMs: number,
    metadata?: Record<string, string | number | boolean | null>,
  ) => void
  add: (
    entries: readonly AnswerTurnTimingEntry[],
    metadata?: Record<string, string | number | boolean | null>,
  ) => void
  entries: () => readonly AnswerTurnTimingEntry[]
}

function createTurnTimingCollector(): TurnTimingCollector {
  const entries: AnswerTurnTimingEntry[] = []
  const record: TurnTimingCollector['record'] = (name, durationMs, metadata) => {
    entries.push({
      name,
      durationMs: Math.max(0, Math.round(durationMs * 100) / 100),
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


function reindexProviders(providers: readonly AnswerSource[]): AnswerSource[] {
  return providers.map((provider, index) => ({
    ...provider,
    citationIndex: index + 1,
  }))
}


function makeCopyId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
