import {
  buildRationaleFollowUpProse,
  classifyAnswerQuerySafety,
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerWorkStep,
  collectAllowedSlugsFromToolResults,
  emitSnapshotEvents,
  extractRequestedLocation,
  resolveKeylessDataAsk,
  type KeylessDataAskResolution,
  type AnswerQuerySafetyResult,
} from '@/modules/answer/public'
import {
  defaultKeylessExecutableSource,
  type KeylessExecutableSourcePort,
  type OperationExecuteDeps,
} from '@/modules/capability-execution'
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
import {
  buildAnswerTurnProblem,
  redactAnswerTurnProblem,
  type AnswerTurnProblem,
} from '@/lib/errors'
import {
  hasAnswerServiceSignal,
  planAnswerTurn,
  type AnswerResponsePlan,
} from './answer-response-planner'
import { isPublicWorkStep, publicWorkLog, safeWorkLogUserText } from './public-worklog'

import type {
  AnswerRunGateSummary,
  AnswerToolCallRecord,
  AnswerTurnRecord,
  AnswerTurnTimingEntry,
  FollowUpIntent,
  FrozenTurnEvidence,
  FrozenTurnProse,
} from '../answer-thread.schema'
import {
  getAnswerThreadWithTurns,
  type AnswerHarnessFinalizationResult,
  type AnswerTurnReservationResult,
} from '../answer-thread.functions'
import { normalizeAnswerTurnQuery } from './turn-digests'
import { resolveIntentRoute, type IntentRoute } from './intent-router'
import { classifyFollowUpIntent, buildThreadTitle } from './follow-up-intent'
import {
  findThreadNeedQuery,
  filterProvidersBySuburb,
  parseNarrowToSuburb,
  resolveFollowUpRegistryQuery,
} from './follow-up-query'
import {
  answerHarnessFinalizationSucceeded,
  collectLatestFrozenAllowedSlugs,
  collectLatestFrozenProviders,
  failPersistedAnswerTurnDurably,
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
import { agentTurnPath } from './turns/agent'
import { boundaryTurnPath } from './turns/boundary'
import { clarificationTurnPath } from './turns/clarification'
import { inquiryHandoffTurnPath } from './turns/inquiry-handoff'
import { retrievalFirstTurnPath } from './turns/retrieval-first'
import { insufficientFrozenTurnPath } from './turns/insufficient-frozen'
import { frozenKnownTurnPath, selectFrozenProviders } from './turns/frozen-known'
import { parseFrozenEvidence } from './public-projection'
import {
  describeProviderCount,
  makeCopyId,
  reindexProviders,
  withFollowUpLayout,
  type SnapshotAssemblyPlan,
  type SnapshotPlanMetadata,
  type TurnPathContext,
  type TurnPathResult,
  type TurnTimingCollector,
  type WorkStepEmitter,
} from './turns/types'

type StreamAnswerRoute = IntentRoute | { kind: 'rationale' } | { kind: 'safety_refusal' }

const EXPLICIT_REFERENCE_DOMAIN_TOKENS: Record<string, true> = {
  encyclopedia: true,
  reference: true,
  references: true,
  wiki: true,
  wikipedia: true,
}

function isExplicitReferenceAsk(normalizedQuery: string): boolean {
  const tokens = normalizedQuery.match(/[a-z0-9]+/g) ?? []
  if (tokens.some((token) => EXPLICIT_REFERENCE_DOMAIN_TOKENS[token] === true)) {
    return true
  }
  return /\b(?:article|page)[-\s]+(?:extract|overview|summary)\b/.test(normalizedQuery)
    || /\b(?:extract|overview|summary)[-\s]+(?:article|page)\b/.test(normalizedQuery)
}

function isExplicitGeneralWebSearch(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim()
  return /\bsearch\s+(?:the\s+)?web\b/.test(normalized)
    || /\bweb\s+search\b/.test(normalized)
    || /\blook\s+up\b.{0,120}\bon\s+(?:the\s+)?web\b/.test(normalized)
    || /\blatest\s+on\s+(?:the\s+)?[a-z0-9]/.test(normalized)
    || isExplicitReferenceAsk(normalized)
}
function isRationaleFollowUpQuery(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim()
  return /\b(?:why|how come|what failed|which constraints?|what constraints?|no matches?|no businesses?|couldn['’]?t find|didn['’]?t find|explain)\b/.test(normalized)
}

function isCorrectiveSearchFollowUp(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim()
  return extractRequestedLocation(query) !== undefined
    || /\b(?:only|just|licensed|registered|budget|under|within|available|tonight|today|tomorrow|this week|radius|km|exclude|must|prefer)\b/.test(normalized)
}

function buildCorrectiveRegistryQuery(
  query: string,
  priorTurns: readonly AnswerTurnRecordLite[],
): string | undefined {
  if (!isCorrectiveSearchFollowUp(query)) {
    return undefined
  }

  const resolved = resolveFollowUpRegistryQuery(query, priorTurns)
  if (hasAnswerServiceSignal(resolved)) {
    return normalizeAnswerTurnQuery(resolved)
  }

  const priorNeed = findThreadNeedQuery(priorTurns)
  if (priorNeed === undefined || resolved.toLowerCase().includes(priorNeed.toLowerCase())) {
    return normalizeAnswerTurnQuery(resolved)
  }
  return normalizeAnswerTurnQuery(`${priorNeed} ${resolved}`)
}

function readPriorSearchContext(
  priorTurns: readonly AnswerTurnRecordLite[],
): AeSearchContext | undefined {
  for (const turn of priorTurns.toSorted((left, right) => right.seq - left.seq)) {
    try {
      const context = parseFrozenEvidence(turn.evidenceJson).searchContext
      if (context !== undefined) {
        return context
      }
    } catch {
      // Ignore malformed historical evidence and keep looking for a valid context.
    }
  }
  return undefined
}

function readDurableFailureEvidence(
  priorTurns: readonly AnswerTurnRecordLite[],
): string | undefined {
  for (const turn of priorTurns.toSorted((left, right) => right.seq - left.seq)) {
    let evidence: FrozenTurnEvidence
    try {
      evidence = parseFrozenEvidence(turn.evidenceJson)
    } catch {
      continue
    }

    const failedStep = evidence.workLog.toReversed().find((step) =>
      step.status === 'error' && isPublicWorkStep(step),
    )
    const summary = failedStep?.summary?.replace(/\s+/g, ' ').trim()
    if (summary !== undefined && summary.length > 0 && !/\b(?:thought|reasoning|prompt|model|tool|capability|internal|raw)\b/i.test(summary)) {
      return summary.slice(0, 240)
    }
  }
  return undefined
}

function buildRationaleEvidence(input: {
  query: string
  priorTurns: readonly AnswerTurnRecordLite[]
  searchContext: AeSearchContext | undefined
}): {
  constraints: string[]
  budget?: string
  failure?: string
} {
  const queries = [...input.priorTurns.map((turn) => turn.query), input.query]
  const constraints = new Set<string>()
  const explicitLocations = queries
    .map((query) => extractRequestedLocation(query))
    .filter((location): location is string => location !== undefined && location.trim().length > 0)
  const location = explicitLocations.at(-1) ?? input.searchContext?.location?.label
  if (location !== undefined) {
    constraints.add(`Location: ${location}`)
  }

  const timing = input.searchContext?.timing === 'date' && input.searchContext.timingDate !== undefined
    ? `Timing: ${input.searchContext.timingDate}`
    : input.searchContext?.timing === undefined
      ? queries.toReversed().find((query) => /\b(?:tonight|tomorrow(?: morning)?|today|this week|urgent)\b/i.test(query))
      : `Timing: ${input.searchContext.timing.replace('_', ' ')}`
  if (timing !== undefined) {
    constraints.add(timing.startsWith('Timing:') ? timing : `Timing: ${timing.match(/\b(?:tonight|tomorrow(?: morning)?|today|this week|urgent)\b/i)?.[0] ?? timing}`)
  }

  if (queries.some((query) => /\blicen[cs]ed\b/i.test(query))) {
    constraints.add('Licensed providers requested')
  }
  const radius = queries
    .map((query) => query.match(/\b(?:within|under|less than|no more than)\s+(\d+)\s*(km|kilomet(?:re|er)s?|mi(?:le)?s?)\b/i))
    .find((match): match is RegExpMatchArray => match !== null)
  if (radius?.[1] !== undefined && radius[2] !== undefined) {
    constraints.add(`Distance: ${radius[1]} ${radius[2]}`)
  }

  const budgets = queries.flatMap((query) => [...query.matchAll(/\b(?:A\$|AUD\s*|\$)\s?\d[\d,]*(?:\.\d{1,2})?\b/gi)].map((match) => match[0].replace(/\s+/g, '')))
  const uniqueBudgets = [...new Set(budgets)]
  const budget = uniqueBudgets.length === 0
    ? 'Budget: no explicit budget was retained'
    : uniqueBudgets.length === 1
      ? `Budget retained: ${uniqueBudgets[0]}`
      : `Budget precedence: ${uniqueBudgets.at(-1)} is the latest stated budget; earlier ${uniqueBudgets.slice(0, -1).join(' and ')} was superseded`
  const failure = readDurableFailureEvidence(input.priorTurns)

  return {
    constraints: [...constraints],
    budget,
    ...(failure === undefined ? {} : { failure }),
  }
}


type StreamAnswerTurnRuntimeState = {
  query: string
  threadId: string
  turnId: string
  turnSeq: number
  isNewThread: boolean
  reservationKey: string
  requestDigest: string
  createdAt: number
  searchContext: AeSearchContext | undefined
  registryQuery?: string
  priorTurns: readonly AnswerTurnRecordLite[]
  priorTurnCount: number
  priorProviders: AnswerSource[]
  priorAllowedSlugs: readonly string[]
  intent: FollowUpIntent
  querySafety?: AnswerQuerySafetyResult | undefined
  route?: StreamAnswerRoute | undefined
  responsePlan?: AnswerResponsePlan | undefined
  keylessDataAsk?: KeylessDataAskResolution | undefined
  webSearchUnavailable?: boolean | undefined
  retrievalFirst?: TurnPathResult | undefined
  narrowSuburb?: string | undefined
  captured?: AnswerSnapshot | undefined
  errorCopyId?: string | undefined
  errorProblem?: AnswerTurnProblem | undefined
  errorProblemJson?: string | undefined
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
  admission: Extract<AnswerTurnReservationResult, { kind: 'reserved' | 'replayed' }>
  searchContext?: AeSearchContext
  /** Explicit descriptor source for fixture/local-e2e answer turns. */
  keylessExecutableSource?: KeylessExecutableSourcePort
  /** Narrow fixture/evaluator execution dependencies; production omits this. */
  operationExecuteDeps?: Pick<OperationExecuteDeps, 'isPublicTarget' | 'fetchImpl'>
  /** Narrow evaluator seam; production always uses the OpenRouter safety classifier. */
  querySafetyClassifier?: (input: Readonly<{
    query: string
    signal?: AbortSignal
  }>) => Promise<AnswerQuerySafetyResult>
  signal?: AbortSignal
  sourceWriteRequest?: Request
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
  const projection = await getAnswerThreadWithTurns(input.threadId, input.sessionId, { numItems: 25, cursor: null })
  const turn = projection?.turns.page.find((candidate) => candidate.turnId === input.turnId)
  if (turn === undefined) {
    return { kind: 'error', problem: buildAnswerTurnProblem('answer_turn_failed') }
  }
  if (turn.status === 'error') {
    if (turn.errorProblemJson !== undefined) {
      try {
        return { kind: 'error', problem: redactAnswerTurnProblem(JSON.parse(turn.errorProblemJson) as unknown) }
      } catch {
        // Fall through to the safe generic problem.
      }
    }
    return { kind: 'error', problem: buildAnswerTurnProblem('answer_turn_failed') }
  }
  if (turn.status !== 'complete') {
    return { kind: 'error', problem: buildAnswerTurnProblem('answer_turn_failed') }
  }
  try {
    const evidence = JSON.parse(turn.evidenceJson) as FrozenTurnEvidence
    const prose = JSON.parse(turn.proseJson) as FrozenTurnProse
    return {
      kind: 'complete',
      answer: {
        query: turn.query,
        oneLine: prose.oneLine,
        providers: evidence.providers,
        ...(evidence.importedClaims === undefined ? {} : { importedClaims: evidence.importedClaims }),
        summary: prose.summary,
        nextStep: prose.nextStep,
        agentJsonUrl: evidence.agentJsonUrl,
        ...(prose.compactLayout === true ? { compactLayout: true } : {}),
        ...(prose.layoutProfile === undefined ? {} : { layoutProfile: prose.layoutProfile }),
      },
    }
  } catch {
    return { kind: 'error', problem: buildAnswerTurnProblem('answer_turn_failed') }
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
  let seq = -1
  const send = (event: AnswerEvent) => {
    if (input.signal?.aborted === true) {
      return
    }
    seq += 1
    onEvent({ seq, event })
  }

  send({ type: 'thread', threadId, turnId, turnSeq })
  if (admission.kind === 'replayed') {
    if (admission.state === 'reserved' || admission.state === 'answer_persisted') {
      send({ type: 'pending' })
      return { threadId, turnId, turnSeq }
    }
    if (admission.state === 'stopped') {
      send({ type: 'stopped' })
      return { threadId, turnId, turnSeq }
    }
    const replay = await readFinalizedAnswerTurn({
      threadId,
      turnId,
      sessionId: input.sessionId,
    })
    send(replay.kind === 'complete'
      ? { type: 'complete', answer: replay.answer }
      : { type: 'error', problem: replay.problem })
    return { threadId, turnId, turnSeq }
  }

  const timings = createTurnTimingCollector()
  const stopContextTiming = timings.start('turn.context_parse')
  const harness = createLiveAnswerHarnessOperation({
    runId: turnId,
    sessionId: input.sessionId,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
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
  const runResult = await harness.loop.run<StreamAnswerTurnRuntimeState>({
    initialState: {
      query,
      threadId,
      turnId,
      turnSeq,
      isNewThread,
      reservationKey: admission.reservationKey,
      requestDigest: input.requestDigest,
      createdAt,
      searchContext: input.searchContext,
      priorTurns: [],
      priorTurnCount: 0,
      priorProviders: [],
      priorAllowedSlugs: [],
      intent: 'refine_search',
      toolCalls: [],
      allowedSlugs: new Set<string>(),
      assembled: false,
    } satisfies StreamAnswerTurnRuntimeState,
    phases: buildStreamAnswerTurnPhases({
      input,
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

  if (persistResult?.ok !== true) {
    send({ type: 'error', problem: buildAnswerTurnProblem('answer_turn_persist_failed') })
    return { threadId, turnId, turnSeq }
  }
  if (persistInput?.sourceWriteRequest !== undefined && !answerHarnessFinalizationSucceeded(finalizationResult)) {
    const persistFailureProblem = buildAnswerTurnProblem('answer_turn_persist_failed')
    const durableFailure = await failPersistedAnswerTurnDurably({
      input: persistInput,
      persistResult,
      errorProblemJson: JSON.stringify(persistFailureProblem),
    })
    if (durableFailure?.kind === 'stopped') {
      send({ type: 'stopped' })
      return { threadId, turnId, turnSeq }
    }
    if (durableFailure?.kind === 'failed' || durableFailure?.kind === 'replayed') {
      const readback = await readFinalizedAnswerTurn({
        threadId,
        turnId,
        sessionId: input.sessionId,
      })
      send(readback.kind === 'complete'
        ? { type: 'complete', answer: readback.answer }
        : { type: 'error', problem: readback.problem })
      return { threadId, turnId, turnSeq }
    }
    send({ type: 'error', problem: persistFailureProblem })
    return { threadId, turnId, turnSeq }
  }
  if (finalState.captured !== undefined) {
    send({ type: 'complete', answer: finalState.captured })
  } else {
    send({
      type: 'error',
      problem: finalState.errorProblem ?? buildAnswerTurnProblem('answer_turn_failed'),
    })
  }

  return { threadId, turnId, turnSeq }
}

function buildStreamAnswerTurnPhases(input: {
  input: StreamAnswerTurnInput
  interpretStartedAt: number
  stopContextTiming: (metadata?: Record<string, string | number | boolean | null>) => void
  send: (event: AnswerEvent) => void
  timings: TurnTimingCollector
  workLog: WorkStepEmitter
  harness: LiveAnswerHarnessOperation
}): HarnessRunLoopPhaseHandlers<StreamAnswerTurnRuntimeState> {
  return {
    context: async ({ state }) => {
      const querySafety = await (input.input.querySafetyClassifier ?? classifyAnswerQuerySafety)({
        query: state.query,
        ...(input.input.signal === undefined ? {} : { signal: input.input.signal }),
      })
      input.harness.recordModelRequest(querySafety.modelRequest)
      input.timings.record('model.answer_query_safety', querySafety.modelRequest.durationMs, {
        decision: querySafety.kind,
        ...(querySafety.kind === 'refused' ? { reason: querySafety.reason } : {}),
      })
      const priorTurns = querySafety.kind === 'refused'
        ? []
        : input.input.preloadedPriorTurns === undefined
          ? await readPriorCompleteTurns(input.input.admission.threadId, input.input.sessionId)
          : input.input.preloadedPriorTurns.filter((turn) => turn.status === 'complete')
      return {
        ...state,
        querySafety,
        modelRequests: [querySafety.modelRequest],
        searchContext: querySafety.kind === 'refused'
          ? undefined
          : input.input.searchContext ?? readPriorSearchContext(priorTurns),
        priorTurns,
        priorTurnCount: priorTurns.length,
      }
    },
    intent: ({ state }) => {
      const intent = classifyFollowUpIntent(state.query, state.priorTurnCount)
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
        summary: state.priorTurnCount > 0
          ? 'Checking the latest answer to see whether this is a follow-up.'
          : 'Starting with this request.',
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
    route: ({ state }) => {
      if (state.querySafety?.kind === 'refused') {
        return { ...state, route: { kind: 'safety_refusal' } }
      }
      const baseRoute = resolveIntentRoute(state.intent)
      const rationaleRoute = state.priorTurnCount > 0
        && state.priorProviders.length === 0
        && isRationaleFollowUpQuery(state.query)
        && baseRoute.kind !== 'boundary_explain'
        && baseRoute.kind !== 'unsupported'
      const restartRoute = state.priorProviders.length === 0
        && isCorrectiveSearchFollowUp(state.query)
        && (baseRoute.kind === 'frozen_filter' || baseRoute.kind === 'frozen_compare')
      const route = rationaleRoute || restartRoute
        ? { kind: rationaleRoute ? 'rationale' : 'tool_search' } as StreamAnswerRoute
        : baseRoute
      const registryQuery = route.kind === 'tool_search' && state.priorProviders.length === 0
        ? buildCorrectiveRegistryQuery(state.query, state.priorTurns)
        : undefined
      return {
        ...state,
        route,
        ...(registryQuery === undefined ? {} : { registryQuery }),
      }
    },
    retrieval: async ({ state }) => {
      if (state.querySafety?.kind === 'refused') {
        return state
      }
      if (state.route?.kind !== 'tool_search') {
        return state
      }
      if (state.registryQuery !== undefined) {
        const previousFailure = readDurableFailureEvidence(state.priorTurns)
        if (previousFailure !== undefined) {
          input.workLog.emit({
            id: 'search.previous_failure',
            phase: 'search',
            status: 'error',
            title: 'Using the earlier search result',
            summary: `The earlier search did not complete: ${previousFailure}`,
            detailRows: [{ label: 'Earlier failure', value: previousFailure }],
            completedAtMs: Date.now(),
          })
        }
      }

      const keylessExecutableSource = input.input.keylessExecutableSource ?? defaultKeylessExecutableSource
      const keylessDataAsk = await resolveKeylessDataAsk(state.query, keylessExecutableSource)
      if (keylessDataAsk.kind === 'resolved' && keylessDataAsk.candidates.length > 0) {
        return {
          ...state,
          keylessDataAsk,
        }
      }
      const resolvedState = {
        ...state,
        keylessDataAsk,
      }
      if (isExplicitGeneralWebSearch(state.query)) {
        return { ...resolvedState, webSearchUnavailable: true }
      }

      const narrowSuburb = parseNarrowToSuburb(state.query)
      if (narrowSuburb !== undefined && state.priorProviders.length > 0) {
        return { ...resolvedState, narrowSuburb }
      }

      const responsePlan = planAnswerTurn({
        query: state.registryQuery ?? state.query,
        priorTurnsCount: state.priorTurnCount,
        searchContext: state.searchContext,
      })
      if (responsePlan.mode === 'clarify') {
        return { ...resolvedState, responsePlan }
      }

      const retrievalFirst = await retrievalFirstTurnPath.run(
        runtimeTurnPathContext(input, resolvedState),
        responsePlan,
      )
      const nextState = {
        ...resolvedState,
        responsePlan,
        retrievalFirst,
      }
      if (retrievalFirst === undefined) {
        return nextState
      }
      if ((retrievalFirst.snapshot?.providers.length ?? 0) > 0) {
        return hasAnswerServiceSignal(state.registryQuery ?? state.query)
          ? applyToolLedResult(nextState, retrievalFirst)
          : nextState
      }
      return applyToolLedResult(nextState, retrievalFirst)
    },
    model: async ({ state }) => {
      if (state.captured !== undefined || state.errorCopyId !== undefined || state.errorProblem !== undefined) {
        return state
      }

      const route = state.route
      if (route === undefined) {
        return state
      }

      const responsePlan = state.responsePlan
      switch (route.kind) {
        case 'safety_refusal':
          return applyToolLedResult(
            state,
            await boundaryTurnPath.run(runtimeTurnPathContext(input, state), 'safety_refusal'),
          )
        case 'rationale': {
          const evidence = buildRationaleEvidence({
            query: state.query,
            priorTurns: state.priorTurns,
            searchContext: state.searchContext,
          })
          const prose = buildRationaleFollowUpProse(evidence)
          const snapshot = withFollowUpLayout(
            {
              query: state.query,
              oneLine: prose.oneLine,
              providers: [],
              summary: prose.summary,
              nextStep: prose.nextStep,
              agentJsonUrl: '',
            },
            state.priorTurnCount,
            'compare_known',
          )
          const allowedSlugs = state.priorAllowedSlugs.length > 0
            ? new Set(state.priorAllowedSlugs)
            : state.allowedSlugs
          const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
          if (!finalized.ok) {
            return applyToolLedResult(state, {
              snapshot: undefined,
              toolCalls: [],
              allowedSlugs,
              errorCopyId: finalized.copyId,
              errorProblem: buildAnswerTurnProblem(finalized.code),
              gate: finalized.gate,
            })
          }
          const assembly = await runtimeTurnPathContext(input, state).emitOrDeferSnapshot(
            finalized.snapshot,
            'frozen_compare',
            { planMode: 'compare' },
          )
          return applyToolLedResult(state, {
            snapshot: finalized.snapshot,
            toolCalls: [],
            allowedSlugs,
            errorCopyId: undefined,
            gate: finalized.gate,
            ...(assembly === undefined ? {} : { assembly }),
          })
        }
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
          if (state.webSearchUnavailable === true) {
            return applyToolLedResult(
              state,
              await boundaryTurnPath.run(runtimeTurnPathContext(input, state), 'web_search_unavailable'),
            )
          }
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
          const retrievedHasProviders = retrieved?.snapshot !== undefined && retrieved.snapshot.providers.length > 0
          const keylessExecutableSource = input.input.keylessExecutableSource ?? defaultKeylessExecutableSource
          const keylessDataAsk: KeylessDataAskResolution = state.keylessDataAsk
            ?? { kind: 'resolved', descriptors: [], candidates: [] }
          const selected = keylessDataAsk.kind === 'resolved' ? keylessDataAsk.selected : undefined
          const result = retrievedHasProviders
            && keylessDataAsk.kind === 'resolved'
            && selected === undefined
            ? await agentTurnPath.run(
                runtimeTurnPathContext(input, state),
                {
                  query: state.query,
                  followUpIntent: state.intent,
                  searchContext: state.searchContext,
                  priorProviders: retrieved!.snapshot!.providers,
                  priorAllowedSlugs: [...retrieved!.allowedSlugs],
                  keylessDataAsk,
                  keylessExecutableSource,
                  ...(input.input.operationExecuteDeps === undefined ? {} : { operationExecuteDeps: input.input.operationExecuteDeps }),
                  disableTools: true,
                },
                retrieved!.toolCalls,
                state.responsePlan?.mode,
                undefined,
              )
            : await agentTurnPath.run(
                runtimeTurnPathContext(input, state),
                {
                  query: state.query,
                  followUpIntent: state.intent,
                  searchContext: state.searchContext,
                  keylessDataAsk,
                  keylessExecutableSource,
                  ...(input.input.operationExecuteDeps === undefined ? {} : { operationExecuteDeps: input.input.operationExecuteDeps }),
                  // Keep surfaced operation providers as grounding when the
                  // selected capability tool is enabled.
                  ...(retrievedHasProviders && selected !== undefined
                    ? {
                        priorProviders: retrieved!.snapshot!.providers,
                        priorAllowedSlugs: [...retrieved!.allowedSlugs],
                      }
                    : {}),
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
      let errorProblem = state.errorProblem
      let gate = state.gate
      const toolCalls = [...state.toolCalls]
      const allowedSlugs = state.allowedSlugs

      if (captured === undefined && errorCopyId === undefined && errorProblem === undefined) {
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
        ...(errorProblem === undefined ? {} : { errorProblem, errorProblemJson: JSON.stringify(errorProblem) }),
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
      const persistInput = buildPersistAnswerTurnInput({
        input: input.input,
        state,
        timings: input.timings,
        workLog: input.workLog,
        harness: input.harness,
      })
      const persistResult = await input.harness.persist(() => persistAnswerTurnWithResult(persistInput))
      return {
        ...state,
        persistInput,
        persistResult,
      }
    },
    report: async ({ state }) => {
      let reportState: StreamAnswerTurnRuntimeState = state
      let persistInput = state.persistInput
      let persistResult = state.persistResult

      if (
        persistInput !== undefined
        && persistResult?.failure === 'unknown'
        && persistInput.sourceWriteRequest !== undefined
        && !answerHarnessRunAborted(input)
      ) {
        const recoveredFinalization = await finalizePersistedAnswerTurnHarnessRun({
          input: persistInput,
          persistResult,
          harnessRun: input.harness.loop.snapshot(harnessStatusForAnswerTurn(
            state.finalTurnStatus ?? persistResult.status,
            state.finalGate ?? persistInput.gate,
          )),
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

      if ((persistInput === undefined || persistResult?.failure === 'unknown') && !answerHarnessRunAborted(input)) {
        const errorProblem = buildAnswerTurnProblem('answer_turn_persist_failed')
        const failedState: StreamAnswerTurnRuntimeState = {
          ...state,
          captured: undefined,
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
        const recoveryPersistResult = await input.harness.persist(
          () => persistAnswerTurnWithResult(recoveryPersistInput),
        )
        reportState = {
          ...failedState,
          persistInput: recoveryPersistInput,
          persistResult: recoveryPersistResult,
        }
        persistInput = recoveryPersistInput
        persistResult = recoveryPersistResult
      }

      if (persistResult?.ok !== true || persistInput === undefined || persistInput.sourceWriteRequest === undefined) {
        return reportState
      }

      const finalizationResult = await finalizePersistedAnswerTurnHarnessRun({
        input: persistInput,
        persistResult,
        harnessRun: input.harness.loop.snapshot(harnessStatusForAnswerTurn(
          reportState.finalTurnStatus ?? persistResult.status,
          reportState.finalGate ?? persistInput.gate,
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
  const finalTurnStatus = input.state.finalTurnStatus
    ?? (input.state.captured === undefined ? 'error' : 'complete')
  const finalGate = input.state.finalGate ?? {
    ok: finalTurnStatus === 'complete',
    source: 'turn_status',
    ...(finalTurnStatus === 'error' ? { code: 'turn_error' } : {}),
  } satisfies AnswerRunGateSummary
  const allowedSlugs = input.state.allowedSlugs
    ?? collectAllowedSlugsFromToolResults(toolCallRecordsToGateInput(input.state.toolCalls))

  input.timings.record('turn.persistence_prepare', 0, {
    status: finalTurnStatus,
    toolCalls: input.state.toolCalls.length,
  })
  return {
    reservationKey: input.state.reservationKey,
    requestDigest: input.state.requestDigest,
    sessionId: input.input.sessionId,
    createdAt: input.state.createdAt,
    threadId: input.state.threadId,
    isNewThread: input.state.isNewThread,
    title: buildThreadTitle(input.state.query),
    turnId: input.state.turnId,
    turnSeq: input.state.turnSeq,
    query: input.state.query,
    intent: input.state.intent,
    captured: input.state.captured,
    errorCopyId: input.state.errorCopyId,
    ...(input.state.errorProblem === undefined ? {} : { errorProblemJson: JSON.stringify(input.state.errorProblem) }),
    toolCalls: input.state.toolCalls,
    ...(input.state.modelRequests === undefined ? {} : { modelRequests: input.state.modelRequests }),
    gate: finalGate,
    searchContext: input.state.searchContext,
    timings: input.timings.entries(),
    workLog: input.workLog.entries(),
    allowedSlugs,
    ...(input.input.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: input.input.sourceWriteRequest }),
    harnessRun: input.harness.loop.snapshot(harnessStatusForAnswerTurn(finalTurnStatus, finalGate)),
    harnessRuntimeEvents: input.harness.events,
  }
}

function answerHarnessRunAborted(input: {
  input: StreamAnswerTurnInput
  harness: LiveAnswerHarnessOperation
}): boolean {
  return input.input.signal?.aborted === true
    || input.harness.loop.snapshot().summary.run.status === 'aborted'
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
    ...(state.registryQuery === undefined ? {} : { registryQuery: state.registryQuery }),
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
    ...(result.errorProblem === undefined ? {} : {
      errorProblem: result.errorProblem,
      errorProblemJson: JSON.stringify(result.errorProblem),
    }),
    toolCalls: result.toolCalls,
    ...(result.modelRequests === undefined
      ? {}
      : { modelRequests: appendModelRequests(state.modelRequests, result.modelRequests) }),
    allowedSlugs: result.allowedSlugs,
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
    detailRows: [{ label: 'Matches', value: String(snapshot.providers.length) }],
    relatedProviderSlugs: snapshot.providers.map((provider) => provider.slug),
    startedAtMs: startedAt,
  })

  await emitTimedSnapshot(input, snapshot, path, metadata)

  input.workLog.emit({
    id: 'assemble.answer',
    phase: 'assemble',
    status: input.signal?.aborted === true ? 'stopped' : 'complete',
    title: 'Putting together the answer',
    summary: input.signal?.aborted === true
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
      if (!isPublicWorkStep(step)) {
        return
      }
      const currentIndex = index === -1 ? steps.length - 1 : index
      const publicIndex = steps.slice(0, currentIndex + 1).filter(isPublicWorkStep).length - 1
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

function describeSearchContext(searchContext: AeSearchContext | undefined): string {
  if (searchContext?.mode === 'whole_catalogue') {
    return 'All available options'
  }
  return aeSearchContextLocationQuery(searchContext) ?? 'Your request'
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
    title: 'Reading the details already found',
    summary: describeProviderCount(providers.length, 'match'),
    detailRows: [{ label: 'From latest answer', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    completedAtMs: completedAt,
  })
  workLog.emit({
    id: 'compare.fit',
    phase: 'compare',
    status: 'complete',
    title: routeKind === 'frozen_compare' ? 'Comparing the matches' : 'Checking the matches',
    summary: routeKind === 'frozen_compare'
      ? 'Comparing the matches already in the answer thread.'
      : 'Checking which matches fit this request.',
    detailRows: [{ label: 'Matches kept', value: String(providers.length) }],
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
