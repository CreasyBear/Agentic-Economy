import { stableHash } from '@/modules/common/stable-hash'
import {
  buildArtifactsFromSnapshot,
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
  computeLayoutProfile,
  emitSnapshotEvents,
  extractRequestedLocation,
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
  hasOverclaim,
  runAnswerToolUseAgent,
  type AnswerGateResult,
} from '@/modules/answer/public'
import {
  aeSearchContextLocationQuery,
  stableAeSearchContextKey,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { resolveIntentRoute } from './intent-router'
import {
  ANSWER_SEARCH_PROVIDER_LIMIT,
  hasAnswerServiceSignal,
  planAnswerTurn,
  type AnswerResponsePlan,
} from './answer-response-planner'

import type {
  AnswerRunGateSummary,
  AnswerToolCallRecord,
  AnswerTurnTimingEntry,
  AnswerTurnRecord,
  FollowUpIntent,
  FrozenTurnEvidence,
  FrozenTurnProse,
} from '../answer-thread.schema'
import {
  appendAnswerTurnWithToolCalls,
  appendAnswerTurnWithThreadAndToolCalls,
  getThreadTurns,
} from '../answer-thread.functions'
import { assertAnswerTurnAccess } from './turn-guard'
import type { AnswerTurnAccessDecision } from './turn-guard'
import { runAnswerToolCall } from './tool-runner'
import { buildAnswerRunReport, buildHarnessRunReportForAnswer } from './answer-run-summary'
import { classifyFollowUpIntent, buildThreadTitle } from './follow-up-intent'
import { filterProvidersBySuburb, parseNarrowToSuburb } from './follow-up-query'
import { parseFrozenEvidence } from './public-projection'

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
  errorCopyId: string | undefined
  gate: AnswerRunGateSummary | undefined
}

export type StreamAnswerTurnInput = {
  sessionId: string
  threadId?: string
  query: string
  searchContext?: AeSearchContext
  signal?: AbortSignal
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

  const priorTurns = input.preloadedPriorTurns === undefined
    ? await readPriorCompleteTurns(input.threadId)
    : input.preloadedPriorTurns.filter((turn) => turn.status === 'complete')
  const priorTurnCount = Math.max(priorTurns.length, access.turnCount)
  const intent = classifyFollowUpIntent(query, priorTurnCount)
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
  })
  captured = toolLed?.snapshot
  errorCopyId = toolLed?.errorCopyId
  bufferedToolCalls = toolLed?.toolCalls ?? []
  if (captured === undefined && errorCopyId === undefined) {
    const copyId = makeCopyId()
    errorCopyId = copyId
    send({ type: 'error', code: 'answer_turn_failed', copyId })
  }

  if (input.signal?.aborted === true) {
    return { threadId, turnId, turnSeq }
  }

  timings.record('turn.persistence_prepare', 0, {
    status: captured === undefined ? 'error' : 'complete',
    toolCalls: bufferedToolCalls.length,
  })
  const persisted = await persistTurn({
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
    gate: toolLed?.gate,
    searchContext: input.searchContext,
    timings: timings.entries(),
    workLog: workLog.entries(),
  })

  if (captured !== undefined) {
    if (!persisted) {
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
}): Promise<StreamToolLedTurnResult | undefined> {
  const route = resolveIntentRoute(input.intent)

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
      return streamAgentTurn(input, {
        query: input.query,
        priorProviders: frozen,
        priorAllowedSlugs: input.priorAllowedSlugs,
        followUpIntent: input.intent,
        searchContext: input.searchContext,
        disableTools: true,
      }, [], route.kind === 'frozen_compare' ? 'compare' : 'filter')
    }
    case 'tool_search': {
      // refine_search: the only route that exposes registry tools to the agent.
      const narrowSuburb = parseNarrowToSuburb(input.query)
      if (narrowSuburb !== undefined && input.priorProviders.length > 0) {
        return streamAgentTurn(input, {
          query: input.query,
          priorProviders: reindexProviders(filterProvidersBySuburb(input.priorProviders, narrowSuburb)),
          priorAllowedSlugs: input.priorAllowedSlugs,
          followUpIntent: input.intent,
          searchContext: input.searchContext,
          disableTools: true,
        }, [], 'filter')
      }
      const responsePlan = planAnswerTurn({
        query: input.query,
        priorTurnsCount: input.priorTurnsCount,
        searchContext: input.searchContext,
      })
      if (responsePlan.mode === 'clarify') {
        return streamClarificationTurn(input, responsePlan)
      }

      const retrievalFirst = await streamRetrievalFirstTurn(input, responsePlan)
      if (retrievalFirst?.snapshot !== undefined || retrievalFirst?.errorCopyId !== undefined) {
        return retrievalFirst
      }
      return streamAgentTurn(input, {
        query: input.query,
        followUpIntent: input.intent,
        searchContext: input.searchContext,
      }, retrievalFirst?.toolCalls ?? [])
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

  await emitSnapshotWithAssembly(input, plan.snapshot, 'clarification', { plan })
  return { snapshot: plan.snapshot, toolCalls: [], errorCopyId: undefined, gate: undefined }
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
    return { snapshot: undefined, toolCalls: [result.record], errorCopyId: undefined, gate: undefined }
  }

  if (result.record.status !== 'complete') {
    return { snapshot: undefined, toolCalls: [result.record], errorCopyId: undefined, gate: undefined }
  }

  emitReadAndCompareSteps(input.workLog, result.providers)

  if (result.providers.length === 0) {
    if (!shouldReturnDeterministicEmptyState(input.query, searchInput)) {
      return { snapshot: undefined, toolCalls: [result.record], errorCopyId: undefined, gate: undefined }
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

    await emitSnapshotWithAssembly(input, snapshot, 'retrieval_empty', { planMode: 'empty' })
    return { snapshot, toolCalls: [result.record], errorCopyId: undefined, gate: undefined }
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

  await emitSnapshotWithAssembly(input, snapshot, 'retrieval_first', { plan })

  return { snapshot, toolCalls: [result.record], errorCopyId: undefined, gate: undefined }
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

async function streamInsufficientFrozenContextTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
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

  await emitSnapshotWithAssembly(input, snapshot, routeKind, { planMode: routeKind === 'frozen_compare' ? 'compare' : 'filter' })

  return { snapshot, toolCalls: [], errorCopyId: undefined, gate: undefined }
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
    const result = await runAnswerToolUseAgent(agentInput)
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
      return { snapshot: undefined, toolCalls, errorCopyId: copyId, gate }
    }

    emitReadAndCompareSteps(input.workLog, result.providers)
    const snapshot = withFollowUpLayout(result.snapshot, input.priorTurnsCount, input.intent)
    await emitSnapshotWithAssembly(input, snapshot, 'agent', planMode === undefined ? {} : { planMode })
    return { snapshot, toolCalls, errorCopyId: undefined, gate }
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
    return { snapshot: undefined, toolCalls: [...seedToolCalls], errorCopyId: copyId, gate: undefined }
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

function answerRunGateFromAnswerGate(gate: AnswerGateResult): AnswerRunGateSummary {
  if (gate.ok) {
    return {
      ok: true,
      source: 'answer_gate',
    }
  }

  return {
    ok: false,
    source: 'answer_gate',
    code: gate.code,
  }
}

async function streamBoundaryTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    priorProviders: AnswerSource[]
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

  await emitSnapshotWithAssembly(input, snapshot, kind, { planMode: 'boundary' })
  return { snapshot, toolCalls: [], errorCopyId: undefined, gate: undefined }
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
  },
  snapshot: AnswerSnapshot,
  path: string,
  metadata: SnapshotPlanMetadata = {},
): Promise<void> {
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

async function readPriorCompleteTurns(threadId: string | undefined) {
  if (threadId === undefined) {
    return [] as AnswerTurnRecordLite[]
  }

  try {
    return (await getThreadTurns(threadId)).turns.filter((turn) => turn.status === 'complete')
  } catch {
    return []
  }
}

type AnswerTurnRecordLite = Pick<AnswerTurnRecord, 'evidenceJson' | 'query' | 'seq' | 'status'>

async function persistTurn(input: {
  sessionId: string
  threadId: string
  isNewThread: boolean
  title: string
  turnId: string
  turnSeq: number
  query: string
  intent: FollowUpIntent
  captured: AnswerSnapshot | undefined
  errorCopyId: string | undefined
  toolCalls: readonly AnswerToolCallRecord[]
  gate: AnswerRunGateSummary | undefined
  searchContext: AeSearchContext | undefined
  timings: readonly AnswerTurnTimingEntry[]
  workLog: readonly AnswerWorkStep[]
}): Promise<boolean> {
  const status = input.captured !== undefined ? 'complete' : 'error'
  const baseEvidence = input.captured !== undefined
    ? buildFrozenEvidence(input.captured, input.toolCalls, input.searchContext, input.timings, input.workLog)
    : emptyEvidence(input.searchContext, input.timings, input.workLog)
  const prose = input.captured !== undefined ? buildFrozenProse(input.captured) : emptyProse()
  const snapshotHash = stableHash({
    query: input.query,
    intent: input.intent,
    ...(input.searchContext === undefined ? {} : { searchContext: stableAeSearchContextKey(input.searchContext) }),
    providers: baseEvidence.providers.map((provider) => provider.slug),
    prose,
    ...(input.toolCalls.length === 0 ? {} : { toolCalls: input.toolCalls.map((call) => call.resultHash) }),
  }).toString()
  const evidenceForSummary: FrozenTurnEvidence =
    baseEvidence.toolCalls !== undefined || input.toolCalls.length === 0
      ? baseEvidence
      : { ...baseEvidence, toolCalls: input.toolCalls }
  const answerRun = buildAnswerRunReport({
    intent: input.intent,
    status,
    snapshotHash,
    evidence: evidenceForSummary,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
  })
  const harnessRun = buildHarnessRunReportForAnswer({
    runId: input.turnId,
    intent: input.intent,
    status,
    snapshotHash,
    evidence: evidenceForSummary,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
  })
  const evidence: FrozenTurnEvidence = {
    ...evidenceForSummary,
    answerRun,
    harnessRun,
  }

  try {
    if (input.isNewThread) {
      await appendAnswerTurnWithThreadAndToolCalls({
        turnId: input.turnId,
        threadId: input.threadId,
        pseudonymousSessionId: input.sessionId,
        title: input.title,
        seq: input.turnSeq,
        query: input.query,
        intent: input.intent,
        evidenceJson: JSON.stringify(evidence),
        snapshotHash,
        proseJson: JSON.stringify(prose),
        artifactKindsJson: JSON.stringify(
          input.captured === undefined ? [] : buildArtifactsFromSnapshot(input.captured).map((artifact) => artifact.kind),
        ),
        status,
        ...(input.errorCopyId === undefined ? {} : { errorCopyId: input.errorCopyId }),
        toolCalls: input.toolCalls.map((call) => ({
          toolCallId: call.toolCallId,
          seq: call.seq,
          toolId: call.toolId,
          inputJson: call.inputJson,
          resultSummaryJson: call.resultSummaryJson,
          resultHash: call.resultHash,
          status: call.status,
        })),
      })
      return true
    }

    await appendAnswerTurnWithToolCalls({
      turnId: input.turnId,
      threadId: input.threadId,
      pseudonymousSessionId: input.sessionId,
      seq: input.turnSeq,
      query: input.query,
      intent: input.intent,
      evidenceJson: JSON.stringify(evidence),
      snapshotHash,
      proseJson: JSON.stringify(prose),
      artifactKindsJson: JSON.stringify(
        input.captured === undefined ? [] : buildArtifactsFromSnapshot(input.captured).map((artifact) => artifact.kind),
      ),
      status,
      ...(input.errorCopyId === undefined ? {} : { errorCopyId: input.errorCopyId }),
      toolCalls: input.toolCalls.map((call) => ({
        toolCallId: call.toolCallId,
        seq: call.seq,
        toolId: call.toolId,
        inputJson: call.inputJson,
        resultSummaryJson: call.resultSummaryJson,
        resultHash: call.resultHash,
        status: call.status,
      })),
    })
    return true
  } catch {
    return false
  }
}

function collectLatestFrozenProviders(priorTurns: readonly AnswerTurnRecordLite[]): AnswerSource[] {
  return readLatestFrozenEvidence(priorTurns)?.providers.slice() ?? []
}

function collectLatestFrozenAllowedSlugs(priorTurns: readonly AnswerTurnRecordLite[]): string[] {
  return [...(readLatestFrozenEvidence(priorTurns)?.allowedSlugs ?? [])]
}

function readLatestFrozenEvidence(priorTurns: readonly AnswerTurnRecordLite[]): FrozenTurnEvidence | undefined {
  const sorted = priorTurns.slice().sort((left, right) => right.seq - left.seq)
  for (const turn of sorted) {
    try {
      return parseFrozenEvidence(turn.evidenceJson)
    } catch {
      // Skip malformed legacy evidence and keep looking for the latest usable turn.
    }
  }
  return undefined
}

function reindexProviders(providers: readonly AnswerSource[]): AnswerSource[] {
  return providers.map((provider, index) => ({
    ...provider,
    citationIndex: index + 1,
  }))
}

function buildFrozenEvidence(
  snapshot: AnswerSnapshot,
  toolCalls: readonly AnswerToolCallRecord[],
  searchContext: AeSearchContext | undefined,
  timings: readonly AnswerTurnTimingEntry[],
  workLog: readonly AnswerWorkStep[],
): FrozenTurnEvidence {
  return {
    providers: snapshot.providers,
    allowedSlugs: snapshot.providers.map((provider) => provider.slug),
    agentJsonUrl: snapshot.agentJsonUrl,
    ...(searchContext === undefined ? {} : { searchContext }),
    ...(toolCalls.length === 0 ? {} : { toolCalls }),
    ...(timings.length === 0 ? {} : { timings }),
    ...(workLog.length === 0 ? {} : { workLog }),
  }
}

function buildFrozenProse(snapshot: AnswerSnapshot): FrozenTurnProse {
  return {
    oneLine: snapshot.oneLine,
    summary: snapshot.summary,
    nextStep: snapshot.nextStep,
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
  }
}

function emptyEvidence(
  searchContext?: AeSearchContext,
  timings: readonly AnswerTurnTimingEntry[] = [],
  workLog: readonly AnswerWorkStep[] = [],
): FrozenTurnEvidence {
  return {
    providers: [],
    allowedSlugs: [],
    agentJsonUrl: '',
    ...(searchContext === undefined ? {} : { searchContext }),
    ...(timings.length === 0 ? {} : { timings }),
    ...(workLog.length === 0 ? {} : { workLog }),
  }
}

function emptyProse(): FrozenTurnProse {
  return { oneLine: '', summary: '', nextStep: '' }
}

function makeCopyId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
