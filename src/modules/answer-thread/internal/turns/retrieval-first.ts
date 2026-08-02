import {
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerWorkStep,
  buildAgentJsonUrl,
  buildProviderDecisionOneLine,
  extractRequestedLocation,
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
  providerNameList,
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

  const searchInput = buildInitialRegistrySearchInput(ctx.query, ctx.searchContext, plan.providerBudget.searchLimit)
  const searchStartedAt = Date.now()
  ctx.workLog.emit({
    id: 'search.registry.initial',
    phase: 'search',
    status: 'running',
    title: 'Searching listed businesses',
    summary: 'Looking for listed businesses that match the request.',
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
    turnId: 'pending',
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
    if (!shouldReturnDeterministicEmptyState(ctx.query, searchInput)) {
      return { snapshot: undefined, toolCalls: [result.record], allowedSlugs: result.allowedSlugs, errorCopyId: undefined, gate: undefined }
    }

    const discovery = await discoverImportedClaims(ctx, searchInput)
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

    const toolCalls = [result.record, discovery.record]
    const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs: result.allowedSlugs })
    if (!finalized.ok) {
      return rejectBlockedSnapshot(ctx, toolCalls, result.allowedSlugs, finalized)
    }
    const assembly = await ctx.emitOrDeferSnapshot(finalized.snapshot, 'retrieval_empty', { planMode: 'empty' })
    return {
      snapshot: finalized.snapshot,
      toolCalls,
      allowedSlugs: result.allowedSlugs,
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
    return rejectBlockedSnapshot(ctx, [result.record], result.allowedSlugs, finalized)
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
    oneLine: count === 1 && providers[0] !== undefined
      ? buildProviderDecisionOneLine(providers[0])
      : `${count} listed businesses match${placeSuffix}.`,
    providers,
    summary: count === 1
      ? `${names} publishes service coverage${placeSuffix}. The business confirms timing, price, availability, and the work.`
      : `${names} publish service coverage${placeSuffix}. The businesses confirm timing, price, availability, and the work.`,
    nextStep: 'Open a listed business page and send an inquiry when that option is published.',
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
  importedClaims?: readonly WebDiscoveryClaim[]
}): AnswerSnapshot {
  const place = input.searchInput.location ?? extractRequestedLocation(input.query)
  const placeSuffix = place === undefined ? '' : ` for ${place}`

  return {
    query: input.query,
    oneLine: `No listed businesses match "${input.query}" yet.`,
    providers: [],
    ...(input.importedClaims === undefined ? {} : { importedClaims: input.importedClaims }),
    summary: place === undefined
      ? 'No listed businesses publish matching coverage yet.'
      : `No listed businesses publish coverage${placeSuffix} yet.`,
    nextStep: 'Try a nearby suburb, browse the registry, or list a business that should appear here.',
    agentJsonUrl: buildAgentJsonUrl(
      buildAgentJsonQuery(input.query, input.searchInput),
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
}> {
  const startedAt = Date.now()
  ctx.workLog.emit({
    id: 'search.web.discovery',
    phase: 'search',
    status: 'running',
    title: 'Checking the web for unlisted businesses',
    summary: 'AE has no listed match, so it is checking one web source for real local providers.',
    detailRows: [{ label: 'Search words', value: safeWorkLogUserText(ctx.query) }],
    startedAtMs: startedAt,
  })
  const result = await runAnswerToolCall({
    toolId: 'web.discover',
    input: {
      query: ctx.query,
      ...(searchInput.location === undefined ? {} : { location: searchInput.location }),
    },
    turnId: ctx.turnId,
    seq: 1,
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
  ctx.workLog.emit({
    id: 'search.web.discovery',
    phase: 'search',
    status: result.record.status === 'complete' ? 'complete' : 'error',
    title: 'Checking the web for unlisted businesses',
    summary: result.record.status !== 'complete'
      ? 'The web discovery check did not complete.'
      : claims.length === 0
        ? 'No additional web businesses were found for this request.'
        : `${claims.length} real business${claims.length === 1 ? '' : 'es'} found on the web, separate from AE listings.`,
    detailRows: [{ label: 'Imported claims', value: String(claims.length) }],
    startedAtMs: startedAt,
    completedAtMs: Date.now(),
  })
  return { claims, record: result.record }
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

  const location = searchInput.location ?? aeSearchContextLocationQuery(searchContext)
  return location === undefined ? undefined : { mode: 'near_me', location }
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
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
