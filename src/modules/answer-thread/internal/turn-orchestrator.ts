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
  buildUnsupportedNextStep,
  buildUnsupportedOneLine,
  buildUnsupportedSummary,
} from '@/modules/answer/public'
import {
  buildAgentJsonUrl,
  collectAllowedSlugsFromToolResults,
  computeLayoutProfile,
  emitSnapshotEvents,
  extractRequestedLocation,
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
  hasOverclaim,
  runAnswerToolUseAgent,
} from '@/modules/answer/public'
import type {
  HarnessModelRequestRecord,
  HarnessRunReport,
  HarnessRuntimeEvent,
  HarnessRunStatus,
} from '@/modules/harness/public'
import { buildHarnessRunReport } from '@/modules/harness/public'
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

import { AnswerToolIdValues } from '../answer-thread.schema'
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
  appendAnswerHarnessSessionJournal,
  collectLatestFrozenAllowedSlugs,
  collectLatestFrozenProviders,
  persistAnswerTurnWithResult,
  readPriorCompleteTurns,
  type PersistAnswerTurnInput,
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

const DEFAULT_LIMIT = ANSWER_SEARCH_PROVIDER_LIMIT
const INTERNAL_PUBLIC_TERMS = [
  'source-owned',
  'readback',
  'manifest',
  'capability',
  'gateway',
  'operator',
  'MCP',
  'OpenAPI',
  'callable',
  'autonomous',
  'agent-native',
  'DTO',
  'fixture',
] as const

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
type StreamToolLedTurnResult = {
  snapshot: AnswerSnapshot | undefined
  toolCalls: AnswerToolCallRecord[]
  modelRequests?: readonly HarnessModelRequestRecord[]
  allowedSlugs: ReadonlySet<string>
  errorCopyId: string | undefined
  gate: AnswerRunGateSummary | undefined
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
  harness.start()

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

  const priorTurns = await harness.phase('context', async () =>
    input.preloadedPriorTurns === undefined
      ? await readPriorCompleteTurns(input.threadId)
      : input.preloadedPriorTurns.filter((turn) => turn.status === 'complete'))
  const priorTurnCount = Math.max(priorTurns.length, access.turnCount)
  const intent = await harness.phase('intent', () => classifyFollowUpIntent(query, priorTurnCount))
  stopContextTiming({
    priorTurns: priorTurns.length,
    accessTurnCount: access.turnCount,
    intent,
    isNewThread: input.threadId === undefined,
  })
  workLog.emit({
    id: 'interpret.request',
    phase: 'interpret',
    status: 'complete',
    title: 'Reading your request',
    summary: priorTurnCount > 0
      ? 'Using the latest answer thread to decide whether this is a follow-up.'
      : 'Starting a new search from this request.',
    detailRows: [
      { label: 'Request', value: safeWorkLogUserText(query) },
      { label: 'Earlier answers', value: String(priorTurnCount) },
      { label: 'Search area', value: describeSearchContext(input.searchContext) },
    ],
    startedAtMs: interpretStartedAt,
    completedAtMs: Date.now(),
  })

  const priorFrozen = collectLatestFrozenProviders(priorTurns)
  const priorAllowedSlugs = collectLatestFrozenAllowedSlugs(priorTurns)
  let captured: AnswerSnapshot | undefined
  let errorCopyId: string | undefined
  let bufferedToolCalls: AnswerToolCallRecord[] = []
  let bufferedModelRequests: readonly HarnessModelRequestRecord[] | undefined
  let bufferedAllowedSlugs: ReadonlySet<string> = new Set()

  const toolLed = await streamToolLedTurn({
    query,
    intent,
    priorTurnsCount: priorTurns.length,
    priorProviders: priorFrozen,
    priorAllowedSlugs,
    searchContext: input.searchContext,
    signal: input.signal,
    send,
    timings,
    workLog,
    harness,
  })
  captured = toolLed?.snapshot
  errorCopyId = toolLed?.errorCopyId
  bufferedToolCalls = toolLed?.toolCalls ?? []
  bufferedModelRequests = toolLed?.modelRequests
  bufferedAllowedSlugs = toolLed?.allowedSlugs
    ?? collectAllowedSlugsFromToolResults(toolCallRecordsToGateInput(bufferedToolCalls))
  let gate = toolLed?.gate
  if (captured === undefined && errorCopyId === undefined) {
    const copyId = makeCopyId()
    errorCopyId = copyId
    send({ type: 'error', code: 'answer_turn_failed', copyId })
  } else if (captured !== undefined) {
    const finalized = finalizeAnswerTurnSnapshot({ snapshot: captured, allowedSlugs: bufferedAllowedSlugs })
    if (!finalized.ok) {
      captured = undefined
      errorCopyId = finalized.copyId
      gate = finalized.gate
      send({ type: 'error', code: finalized.code, copyId: finalized.copyId })
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
  await harness.phase('gate', () => harness.evaluateGate(finalGate, finalTurnStatus))

  if (input.signal?.aborted === true) {
    harness.complete('aborted')
    return { threadId, turnId, turnSeq }
  }

  timings.record('turn.persistence_prepare', 0, {
    status: finalTurnStatus,
    toolCalls: bufferedToolCalls.length,
  })
  const persistInput: PersistAnswerTurnInput = {
    sessionId: input.sessionId,
    threadId,
    isNewThread: input.threadId === undefined,
    title: buildThreadTitle(query),
    turnId,
    turnSeq,
    query,
    intent,
    captured,
    errorCopyId,
    toolCalls: bufferedToolCalls,
    ...(bufferedModelRequests === undefined ? {} : { modelRequests: bufferedModelRequests }),
    gate: finalGate,
    searchContext: input.searchContext,
    timings: timings.entries(),
    workLog: workLog.entries(),
    allowedSlugs: bufferedAllowedSlugs,
    ...(input.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: input.sourceWriteRequest }),
    harnessRun: buildPersistableAnswerHarnessReport(harness, harnessStatusForAnswerTurn(finalTurnStatus, finalGate)),
    harnessRuntimeEvents: harness.events,
    skipHarnessSessionJournal: true,
  }
  const persistResult = await harness.persist(() => persistAnswerTurnWithResult(persistInput))
  await harness.phase('report', () => undefined)
  const finalHarnessRun = harness.complete(
    persistResult.ok ? harnessStatusForAnswerTurn(finalTurnStatus, finalGate) : 'error',
  )
  if (persistResult.ok) {
    await appendAnswerHarnessSessionJournal({
      input: persistInput,
      harnessRun: finalHarnessRun,
      snapshotHash: persistResult.snapshotHash,
      status: persistResult.status,
      runtimeEvents: harness.events,
    })
  }

  if (captured !== undefined) {
    if (!persistResult.ok) {
      send({ type: 'error', code: 'answer_turn_persist_failed', copyId: makeCopyId() })
      return { threadId, turnId, turnSeq }
    }
    send({ type: 'complete', answer: captured })
  }

  return { threadId, turnId, turnSeq }
}

async function streamToolLedTurn(input: {
  query: string
  intent: FollowUpIntent
  priorTurnsCount: number
  priorProviders: AnswerSource[]
  priorAllowedSlugs: readonly string[]
  searchContext: AeSearchContext | undefined
  signal: AbortSignal | undefined
  send: (event: AnswerEvent) => void
  timings: TurnTimingCollector
  workLog: WorkStepEmitter
  harness: LiveAnswerHarnessOperation
}): Promise<StreamToolLedTurnResult | undefined> {
  const route = await input.harness.phase('route', () => resolveIntentRoute(input.intent))

  switch (route.kind) {
    case 'boundary_explain':
    case 'unsupported':
      // Boundary-prose intents answer from deterministic copy with no LLM call.
      return streamBoundaryTurn(input, route.kind)
    case 'frozen_filter':
    case 'frozen_compare': {
      // Frozen-evidence intents reuse prior providers with no registry tool call.
      const frozen = selectFrozenProviders(route.kind, input.priorProviders)
      if (input.priorProviders.length === 0 || (route.kind === 'frozen_compare' && frozen.length < 2)) {
        return streamInsufficientFrozenContextTurn(input, route.kind)
      }
      emitFrozenProviderSteps(input.workLog, route.kind, frozen)
      return input.harness.phase('model', () => streamAgentTurn(input, {
        query: input.query,
        priorProviders: frozen,
        priorAllowedSlugs: input.priorAllowedSlugs,
        followUpIntent: input.intent,
        searchContext: input.searchContext,
        disableTools: true,
      }, [], route.kind === 'frozen_compare' ? 'compare' : 'filter'))
    }
    case 'tool_search': {
      // refine_search: the only route that exposes registry tools to the agent.
      const narrowSuburb = parseNarrowToSuburb(input.query)
      if (narrowSuburb !== undefined && input.priorProviders.length > 0) {
        return input.harness.phase('model', () => streamAgentTurn(input, {
          query: input.query,
          priorProviders: reindexProviders(filterProvidersBySuburb(input.priorProviders, narrowSuburb)),
          priorAllowedSlugs: input.priorAllowedSlugs,
          followUpIntent: input.intent,
          searchContext: input.searchContext,
          disableTools: true,
        }, [], 'filter'))
      }
      const responsePlan = planAnswerTurn({
        query: input.query,
        priorTurnsCount: input.priorTurnsCount,
        searchContext: input.searchContext,
      })
      if (responsePlan.mode === 'clarify') {
        return streamClarificationTurn(input, responsePlan)
      }

      const retrievalFirst = await input.harness.phase('retrieval', () => streamRetrievalFirstTurn(input, responsePlan))
      if (retrievalFirst?.snapshot !== undefined || retrievalFirst?.errorCopyId !== undefined) {
        return retrievalFirst
      }
      return input.harness.phase('model', () => streamAgentTurn(input, {
        query: input.query,
        followUpIntent: input.intent,
        searchContext: input.searchContext,
      }, retrievalFirst?.toolCalls ?? []))
    }
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
  await emitSnapshotWithAssembly(input, finalized.snapshot, 'clarification', { plan })
  return { snapshot: finalized.snapshot, toolCalls: [], allowedSlugs, errorCopyId: undefined, gate: finalized.gate }
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
    await emitSnapshotWithAssembly(input, finalized.snapshot, 'retrieval_empty', { planMode: 'empty' })
    return { snapshot: finalized.snapshot, toolCalls: [result.record], allowedSlugs: result.allowedSlugs, errorCopyId: undefined, gate: finalized.gate }
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
  await emitSnapshotWithAssembly(input, finalized.snapshot, 'retrieval_first', { plan })

  return { snapshot: finalized.snapshot, toolCalls: [result.record], allowedSlugs: result.allowedSlugs, errorCopyId: undefined, gate: finalized.gate }
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

function buildPersistableAnswerHarnessReport(
  harness: LiveAnswerHarnessOperation,
  status: HarnessRunStatus,
): HarnessRunReport {
  const at = Date.now()
  const runId = harness.loop.runId
  const runtimeEvents: HarnessRuntimeEvent[] = [
    ...harness.events,
    { type: 'persist.started', runId, at },
    { type: 'persist.completed', runId, at, durationMs: 0 },
    { type: 'phase.started', runId, phase: 'report', at },
    { type: 'phase.completed', runId, phase: 'report', at, durationMs: 0 },
  ]
  const startedAt = harness.events.find((event) => event.type === 'run.started')?.startedAt

  return buildHarnessRunReport({
    availableTools: AnswerToolIdValues,
    runtimeEvents,
    snapshot: {
      runId,
      sessionId: harness.loop.sessionId,
      status,
      ...(startedAt === undefined ? {} : { startedAt }),
      endedAt: at,
    },
  })
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
  await emitSnapshotWithAssembly(input, finalized.snapshot, routeKind, { planMode: routeKind === 'frozen_compare' ? 'compare' : 'filter' })

  return { snapshot: finalized.snapshot, toolCalls: [], allowedSlugs, errorCopyId: undefined, gate: finalized.gate }
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
    await emitSnapshotWithAssembly(input, finalized.snapshot, 'agent', planMode === undefined ? {} : { planMode })
    return {
      snapshot: finalized.snapshot,
      toolCalls,
      modelRequests: result.modelRequests,
      allowedSlugs: result.allowedSlugs,
      errorCopyId: undefined,
      gate: finalized.gate,
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
  await emitSnapshotWithAssembly(input, finalized.snapshot, kind, { planMode: 'boundary' })
  return { snapshot: finalized.snapshot, toolCalls: [], allowedSlugs, errorCopyId: undefined, gate: finalized.gate }
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
  if (path === 'boundary_explain' || path === 'unsupported' || path === 'clarification') {
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
      send({ type: 'work-step', step: steps[index === -1 ? steps.length - 1 : index] as AnswerWorkStep })
    },
    entries: () => steps.map((step) => ({ ...step })),
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
  const queries = toolCalls
    .map((call) => readToolCallQuery(call))
    .filter((value) => value.length > 0)

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

function safeWorkLogUserText(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return 'Request shown above'
  }
  if (
    hasOverclaim(trimmed) ||
    hasEpistemicVocabulary(trimmed) ||
    hasInjectionUpgrade(trimmed) ||
    INTERNAL_PUBLIC_TERMS.some((term) => trimmed.toLowerCase().includes(term.toLowerCase()))
  ) {
    return 'Request shown above'
  }
  return trimmed
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
