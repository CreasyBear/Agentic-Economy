import {
  buildAgentJsonUrl,
  extractRequestedLocation,
  isConfirmedSearchContext,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerWorkStep,
} from '@/modules/answer/public'
import {
  aeSearchContextLocationQuery,
  type AeSearchContext,
} from '@/modules/answer/search-context'


import {
  hasAnswerServiceSignal,
  type AnswerResponsePlan,
} from '../answer-response-planner'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'
import { webDiscoverAction } from '@/modules/storefront/storefront.actions'
import { finalizeAnswerTurnSnapshot } from '../answer-turn-safety'
import { runAnswerToolCall } from '../tool-runner'
import { safeWorkLogUserText } from '../public-worklog'
import {
  describeProviderCount,
  emitReadAndCompareSteps,
  rejectBlockedSnapshot,
  reindexProviders,
  withFollowUpLayout,
  type TurnPath,
  type TurnPathContext,
  type TurnPathResult,
} from './types'

type AnswerPlan = Extract<AnswerResponsePlan, { mode: 'answer' }>

type AnswerRegistrySearchInput = {
  query: string
  limit: number
  mode?: 'near_me' | 'whole_catalogue'
  location?: string
}

export const retrievalFirstTurnPath: TurnPath<[AnswerPlan]> = {
  id: 'retrieval_first',
  async run(ctx, plan) {
    return streamRetrievalFirstTurn(ctx, plan)
  },
}

async function streamRetrievalFirstTurn(
  ctx: TurnPathContext,
  plan: AnswerPlan,
): Promise<TurnPathResult | undefined> {
  if (isSignalAborted(ctx.signal)) {
    return undefined
  }

  const registryQuery = ctx.registryQuery ?? ctx.query
  const searchInput = buildInitialRegistrySearchInput(registryQuery, ctx.searchContext, plan.providerBudget.searchLimit)
  const searchStartedAt = Date.now()
  ctx.workLog.emit({
    id: 'search.registry.initial',
    phase: 'search',
    status: 'running',
    title: 'Searching for matches',
    summary: 'Looking for businesses that can help.',
    detailRows: buildSearchWorkStepDetailRows(searchInput),
    startedAtMs: searchStartedAt,
  })
  const stopSearchTiming = ctx.timings.start('retrieval.initial_search', {
    mode: searchInput.mode ?? 'query',
    hasLocation: searchInput.location !== undefined,
  })
  const result = await runAnswerToolCall({
    toolId: 'registry.search',
    input: searchInput,
    turnId: ctx.turnId,
    seq: 0,
    harnessLoop: ctx.harness.loop,
  })
  stopSearchTiming({
    status: result.record.status,
    providerCount: result.providers.length,
  })
  ctx.workLog.emit({
    id: 'search.registry.initial',
    phase: 'search',
    status: result.record.status === 'complete' ? 'complete' : 'error',
    title: 'Searching for matches',
    summary: result.record.status === 'complete'
      ? describeProviderCount(result.providers.length, 'match')
      : 'The search did not complete.',
    detailRows: [
      ...buildSearchWorkStepDetailRows(searchInput),
      { label: 'Results', value: String(result.providers.length) },
    ],
    relatedProviderSlugs: result.providers.map((provider) => provider.slug),
    startedAtMs: searchStartedAt,
    completedAtMs: Date.now(),
  })
  ctx.timings.add(result.timings, {
    phase: 'initial_search',
    toolId: result.record.toolId,
    toolSeq: result.record.seq,
  })

  if (isSignalAborted(ctx.signal)) {
    return { snapshot: undefined, toolCalls: [result.record], allowedSlugs: result.allowedSlugs, errorCopyId: undefined, gate: undefined }
  }

  if (result.record.status !== 'complete') {
    return { snapshot: undefined, toolCalls: [result.record], allowedSlugs: result.allowedSlugs, errorCopyId: undefined, gate: undefined }
  }

  emitReadAndCompareSteps(ctx.workLog, result.providers)
  if (result.providers.length === 0) {
    const toolCalls = [result.record]
    const allowedSlugs = result.allowedSlugs

    if (!shouldReturnDeterministicEmptyState(searchInput.query, searchInput)) {
      return { snapshot: undefined, toolCalls, allowedSlugs, errorCopyId: undefined, gate: undefined }
    }

    const discovery = await discoverImportedClaims(ctx, searchInput)
    const emptyToolCalls = [...toolCalls, discovery.record]
    if (discovery.status === 'error') {
      return {
        snapshot: undefined,
        toolCalls: emptyToolCalls,
        allowedSlugs,
        errorCopyId: undefined,
        gate: undefined,
      }
    }
    const snapshot = withFollowUpLayout(
      buildDeterministicEmptySnapshot({
        query: ctx.query,
        searchInput,
        searchContext: ctx.searchContext,
        ...(discovery.claims.length === 0 ? {} : { importedClaims: discovery.claims }),
      }),
      ctx.priorTurnsCount,
      ctx.intent,
    )

    const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
    if (!finalized.ok) {
      return rejectBlockedSnapshot(emptyToolCalls, allowedSlugs, finalized)
    }
    const assembly = await ctx.emitOrDeferSnapshot(finalized.snapshot, 'retrieval_empty', { planMode: 'empty' })
    return {
      snapshot: finalized.snapshot,
      toolCalls: emptyToolCalls,
      allowedSlugs,
      errorCopyId: undefined,
      gate: finalized.gate,
      ...(assembly === undefined ? {} : { assembly }),
    }
  }

  const snapshot = withFollowUpLayout(
    buildRetrievalFirstSnapshot({
      query: ctx.query,
      providers: result.providers,
      visibleLimit: plan.providerBudget.visibleLimit,
      searchInput,
      searchContext: ctx.searchContext,
    }),
    ctx.priorTurnsCount,
    ctx.intent,
  )

  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs: result.allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot([result.record], result.allowedSlugs, finalized)
  }
  const assembly = await ctx.emitOrDeferSnapshot(finalized.snapshot, 'retrieval_first', { plan })

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

  const contextLocation = isConfirmedSearchContext(searchContext)
    ? aeSearchContextLocationQuery(searchContext)
    : undefined

  const userNamedLocation = extractRequestedLocation(query)
  if (userNamedLocation !== undefined) {
    return { ...input, mode: 'near_me', location: userNamedLocation }
  }

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
  const place = input.searchInput.location ?? extractRequestedLocation(input.query)
  const placeSuffix = place === undefined ? '' : ` in ${place}`
  const subject = count === 1 ? 'This business' : `These ${count} businesses`
  const offer = count === 1 ? 'offers' : 'offer'

  return {
    query: input.query,
    oneLine: `${subject} may fit what you need${placeSuffix}.`,
    providers,
    summary: `${subject} ${offer} something that matches what you need. What they offer, price, and current availability still need confirmation.`,
    nextStep: `Open a business, then ask whether it handles "${input.query}", what it costs, and when it is available.`,
    agentJsonUrl: buildAgentJsonUrl(
      buildAgentJsonQuery(input.searchInput.query, input.searchInput),
      input.searchInput.limit,
      buildAgentJsonScope(input.searchInput, input.searchContext),
    ),
  }
}

function buildDeterministicEmptySnapshot(input: {
  query: string
  searchInput: AnswerRegistrySearchInput
  searchContext: AeSearchContext | undefined
  importedClaims?: readonly WebDiscoveryClaim[]
}): AnswerSnapshot {
  const place = input.searchInput.location ?? extractRequestedLocation(input.query)
  const placeSuffix = place === undefined ? '' : ` for ${place}`

  return {
    query: input.query,
    oneLine: `No businesses match "${input.query}" yet.`,
    providers: [],
    ...(input.importedClaims === undefined ? {} : { importedClaims: input.importedClaims }),
    summary: place === undefined
      ? 'No matches found yet.'
      : `No matches found in ${place} yet.`,
    nextStep: 'Try a nearby suburb, see other options, or add a business that should appear here.',
    agentJsonUrl: buildAgentJsonUrl(
      buildAgentJsonQuery(input.searchInput.query, input.searchInput),
      input.searchInput.limit,
      buildAgentJsonScope(input.searchInput, input.searchContext),
    ),
  }
}
async function discoverImportedClaims(
  ctx: TurnPathContext,
  searchInput: AnswerRegistrySearchInput,
): Promise<{
  claims: readonly WebDiscoveryClaim[]
  record: Awaited<ReturnType<typeof runAnswerToolCall>>['record']
  status: 'complete' | 'skipped' | 'error'
}> {
  const startedAt = Date.now()
  ctx.workLog.emit({
    id: 'search.web.discovery',
    phase: 'search',
    status: 'running',
    title: 'Checking the web for more businesses',
    summary: 'No match was found in the businesses here, so one web source is being checked for more businesses.',
    detailRows: [{ label: 'Search words', value: safeWorkLogUserText(searchInput.query) }],
    startedAtMs: startedAt,
  })
  const result = await runAnswerToolCall({
    toolId: 'web.discover',
    input: {
      query: searchInput.query,
      ...(searchInput.location === undefined ? {} : { location: searchInput.location }),
    },
    turnId: ctx.turnId,
    seq: 2,
    harnessLoop: ctx.harness.loop,
  })
  ctx.timings.add(result.timings, {
    phase: 'web_discovery',
    toolId: result.record.toolId,
    toolSeq: result.record.seq,
  })
  const parsed = webDiscoverAction.outputSchema.safeParse(JSON.parse(result.resultJson))
  const claims = result.record.status === 'complete' && parsed.success && parsed.data.kind === 'found'
    ? parsed.data.claims
    : []
  const discoveryStatus = parsed.success && parsed.data.kind === 'unavailable'
    ? 'skipped'
    : result.record.status !== 'complete' || !parsed.success || parsed.data.kind === 'error'
      ? 'error'
      : 'complete'
  ctx.workLog.emit({
    id: 'search.web.discovery',
    phase: 'search',
    status: discoveryStatus,
    title: 'Checking the web for more businesses',
    summary: discoveryStatus === 'error'
      ? 'The web check did not complete.'
      : discoveryStatus === 'skipped'
        ? 'Web search is not set up for this request.'
        : claims.length === 0
          ? 'No other businesses were found on the web for this request.'
          : `${claims.length} ${claims.length === 1 ? 'business' : 'businesses'} appeared in a web search. These details come from the web and have not been verified.`,
    detailRows: [{ label: 'Web results', value: String(claims.length) }],
    startedAtMs: startedAt,
    completedAtMs: Date.now(),
  })
  return { claims, record: result.record, status: discoveryStatus }
}



function shouldReturnDeterministicEmptyState(
  query: string,
  searchInput: AnswerRegistrySearchInput,
): boolean {
  const requestedLocation = searchInput.location ?? extractRequestedLocation(query)
  return requestedLocation !== undefined && hasAnswerServiceSignal(query)
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

  const location = searchInput.location ?? (
    isConfirmedSearchContext(searchContext)
      ? aeSearchContextLocationQuery(searchContext)
      : undefined
  )
  return location === undefined ? undefined : { mode: 'near_me', location }
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function buildSearchWorkStepDetailRows(
  searchInput: AnswerRegistrySearchInput,
): NonNullable<AnswerWorkStep['detailRows']> {
  return [
    { label: 'What you need', value: safeWorkLogUserText(searchInput.query) },
    { label: 'Area', value: describeSearchInputArea(searchInput) },
    { label: 'Search limit', value: String(searchInput.limit) },
  ]
}

function describeSearchInputArea(searchInput: AnswerRegistrySearchInput): string {
  if (searchInput.mode === 'whole_catalogue') {
    return 'All businesses'
  }
  return searchInput.location ?? 'As written'
}
