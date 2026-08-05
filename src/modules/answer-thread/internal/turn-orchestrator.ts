import {
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerWorkStep,
  collectAllowedSlugsFromToolResults,
  emitSnapshotEvents,
} from '@/modules/answer/public'
import type {
  HarnessModelRequestRecord,
  HarnessRunStatus,
  HarnessRunLoopPhaseHandlers,
} from '@/modules/harness/public'
import { roundNonNegative2 } from '@/modules/common/round-nonnegative-2'
import {
  aeSearchContextLocationQuery,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { resolveIntentRoute } from './intent-router'
import {
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
import { toolCallRecordsToGateInput } from './tool-runner'
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
import { finalizeAnswerTurnSnapshot } from './answer-turn-safety'
import {
  createLiveAnswerHarnessOperation,
  type LiveAnswerHarnessOperation,
} from './answer-harness-operation'
import type { AnswerHarnessFinalizationResult } from '../answer-thread.functions'
import { agentTurnPath } from './turns/agent'
import { boundaryTurnPath } from './turns/boundary'
import { clarificationTurnPath } from './turns/clarification'
import { retrievalFirstTurnPath } from './turns/retrieval-first'
import { insufficientFrozenTurnPath } from './turns/insufficient-frozen'
import { frozenKnownTurnPath, selectFrozenProviders } from './turns/frozen-known'
import { inquiryHandoffTurnPath } from './turns/inquiry-handoff'
import {
  describeProviderCount,
  makeCopyId,
  reindexProviders,
  type SnapshotAssemblyPlan,
  type SnapshotPlanMetadata,
  type TurnPathContext,
  type TurnPathResult,
  type TurnTimingCollector,
  type WorkStepEmitter,
} from './turns/types'

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
  retrievalFirst?: TurnPathResult | undefined
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
        ? await readPriorCompleteTurns(input.input.threadId, input.input.sessionId)
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

      const retrievalFirst = await retrievalFirstTurnPath.run(
        runtimeTurnPathContext(input, state),
        responsePlan,
      )
      const nextState = {
        ...state,
        responsePlan,
        retrievalFirst,
      }
      if (retrievalFirst === undefined) {
        return nextState
      }
      if ((retrievalFirst.snapshot?.providers.length ?? 0) > 0) {
        return nextState
      }
      return applyToolLedResult(nextState, retrievalFirst)
    },
    model: async ({ state }) => {
      if (state.captured !== undefined || state.errorCopyId !== undefined) {
        return state
      }

      const route = state.route
      if (route === undefined) {
        return state
      }

      const responsePlan = state.responsePlan
      switch (route.kind) {
        case 'boundary_explain':
        case 'unsupported':
          return applyToolLedResult(
            state,
            await boundaryTurnPath.run(runtimeTurnPathContext(input, state), route.kind),
          )
        case 'inquiry_handoff':
          return applyToolLedResult(
            state,
            await inquiryHandoffTurnPath.run(runtimeTurnPathContext(input, state)),
          )
        case 'frozen_filter':
        case 'frozen_compare': {
          const frozen = selectFrozenProviders(route.kind, state.priorProviders)
          if (state.priorProviders.length === 0 || (route.kind === 'frozen_compare' && frozen.length < 2)) {
            return applyToolLedResult(
              state,
              await insufficientFrozenTurnPath.run(runtimeTurnPathContext(input, state), route.kind),
            )
          }
          emitFrozenProviderSteps(input.workLog, route.kind, frozen)
          const result = await frozenKnownTurnPath.run(
            runtimeTurnPathContext(input, state),
            frozen,
            route.kind,
          )
          return applyToolLedResult(state, result)
        }
        case 'tool_search': {
          if (state.narrowSuburb !== undefined) {
            const narrowed = reindexProviders(filterProvidersBySuburb(state.priorProviders, state.narrowSuburb))
            const result = await frozenKnownTurnPath.run(
              runtimeTurnPathContext(input, state),
              narrowed,
              'frozen_filter',
            )
            return applyToolLedResult(state, result)
          }
          if (state.responsePlan?.mode === 'clarify') {
            return applyToolLedResult(
              state,
              await clarificationTurnPath.run(runtimeTurnPathContext(input, state), state.responsePlan),
            )
          }
          const retrieved = state.retrievalFirst
          const result = retrieved?.snapshot !== undefined && retrieved.snapshot.providers.length > 0
            ? await agentTurnPath.run(
                runtimeTurnPathContext(input, state),
                {
                  query: state.query,
                  followUpIntent: state.intent,
                  searchContext: state.searchContext,
                  priorProviders: retrieved.snapshot.providers,
                  priorAllowedSlugs: [...retrieved.allowedSlugs],
                  disableTools: true,
                },
                retrieved.toolCalls,
                state.responsePlan?.mode,
                undefined,
              )
            : await agentTurnPath.run(
                runtimeTurnPathContext(input, state),
                {
                  query: state.query,
                  followUpIntent: state.intent,
                  searchContext: state.searchContext,
                },
                state.toolCalls,
                undefined,
                state.responsePlan?.toolPolicy,
              )
          return applyToolLedResult(state, result)
        }
        default: {
          const _exhaustive: never = route
          return _exhaustive
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
  const deferAssembly = options.deferAssembly ?? true
  return {
    sessionId: input.input.sessionId,
    threadId: state.threadId,
    turnId: state.turnId,
    sourceWriteRequest: input.input.sourceWriteRequest,
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
    deferAssembly,
    emitOrDeferSnapshot: (snapshot, path, metadata = {}) => emitOrDeferSnapshot(
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
    toolCalls: result.toolCalls,
    ...(result.modelRequests === undefined ? {} : { modelRequests: result.modelRequests }),
    allowedSlugs: result.allowedSlugs,
    gate: result.gate,
    ...(result.assembly === undefined ? {} : { assembly: result.assembly }),
  }
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

function createTurnTimingCollector(): TurnTimingCollector {
  const entries: AnswerTurnTimingEntry[] = []
  const record: TurnTimingCollector['record'] = (name, durationMs, metadata) => {
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
