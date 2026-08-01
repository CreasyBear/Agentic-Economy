import {
  buildAgentJsonUrl,
  extractRequestedLocation,
  getDefaultArtifactBudgetForLayoutProfile,
  type AnswerArtifact,
  type AnswerLayoutProfile,
  type AnswerSnapshot,
} from '@/modules/answer/public'
import {
  aeSearchContextLocationLabel,
  aeSearchContextLocationQuery,
  type AeSearchContext,
} from '@/modules/answer/search-context'

export const ANSWER_SEARCH_PROVIDER_LIMIT = 3

export type AnswerResponseMode = 'clarify' | 'answer' | 'compare' | 'filter' | 'empty' | 'boundary' | 'error'

export type AnswerProviderBudget = {
  searchLimit: number
  visibleLimit: number
}

export type AnswerArtifactBudget = {
  layoutProfile: AnswerLayoutProfile
  allowedKinds: readonly AnswerArtifact['kind'][]
  maxArtifactCount: number
  maxProviderCards: number
}

export type AnswerToolPolicy =
  | { kind: 'none' }
  | { kind: 'registry.search'; maxCalls: 1 }
  | { kind: 'registry.detail'; maxCalls: 1; slug?: string }
  | { kind: 'frozen'; allowedSlugs: readonly string[] }

export type AnswerClarificationReason = 'missing_service' | 'missing_place'

type AnswerResponsePlanBase<Mode extends AnswerResponseMode, Tool extends AnswerToolPolicy> = {
  mode: Mode
  providerBudget: AnswerProviderBudget
  artifactBudget: AnswerArtifactBudget
  toolPolicy: Tool
}

export type AnswerResponsePlan =
  | (AnswerResponsePlanBase<'clarify', { kind: 'none' }> & {
      reason: AnswerClarificationReason
      snapshot: AnswerSnapshot
    })
  | AnswerResponsePlanBase<'answer', { kind: 'registry.search'; maxCalls: 1 }>
  | AnswerResponsePlanBase<'compare', { kind: 'frozen'; allowedSlugs: readonly string[] }>
  | AnswerResponsePlanBase<'filter', { kind: 'frozen'; allowedSlugs: readonly string[] }>
  | AnswerResponsePlanBase<'empty', { kind: 'none' }>
  | AnswerResponsePlanBase<'boundary', { kind: 'none' }>
  | AnswerResponsePlanBase<'error', { kind: 'none' }>

export type AnswerTurnResponsePlan = Extract<AnswerResponsePlan, { mode: 'clarify' | 'answer' }>

const RESPONSE_MODE_BUDGETS = {
  clarify: {
    providerBudget: { searchLimit: 0, visibleLimit: 0 },
    layoutProfile: 'clarification',
  },
  answer: {
    providerBudget: { searchLimit: ANSWER_SEARCH_PROVIDER_LIMIT, visibleLimit: ANSWER_SEARCH_PROVIDER_LIMIT },
    layoutProfile: 'discovery_full',
  },
  compare: {
    providerBudget: { searchLimit: 0, visibleLimit: 2 },
    layoutProfile: 'compare_pair',
  },
  filter: {
    providerBudget: { searchLimit: 0, visibleLimit: ANSWER_SEARCH_PROVIDER_LIMIT },
    layoutProfile: 'refinement_compact',
  },
  empty: {
    providerBudget: { searchLimit: ANSWER_SEARCH_PROVIDER_LIMIT, visibleLimit: 0 },
    layoutProfile: 'empty_state',
  },
  boundary: {
    providerBudget: { searchLimit: 0, visibleLimit: 0 },
    layoutProfile: 'boundary_explain',
  },
  error: {
    providerBudget: { searchLimit: 0, visibleLimit: 0 },
    layoutProfile: 'boundary_explain',
  },
} satisfies Record<AnswerResponseMode, { providerBudget: AnswerProviderBudget; layoutProfile: AnswerLayoutProfile }>

export function defaultProviderBudgetForMode(mode: AnswerResponseMode): AnswerProviderBudget {
  return { ...RESPONSE_MODE_BUDGETS[mode].providerBudget }
}

// Single artifact-budget source of truth: the layout profile owns the budget
// (getDefaultArtifactBudgetForLayoutProfile in snapshot-artifacts). This module
// only maps response mode -> layout profile; it never re-declares budgets.
export function defaultArtifactBudgetForMode(mode: AnswerResponseMode): AnswerArtifactBudget {
  return getDefaultArtifactBudgetForLayoutProfile(RESPONSE_MODE_BUDGETS[mode].layoutProfile)
}


export function planAnswerTurn(input: {
  query: string
  priorTurnsCount: number
  searchContext: AeSearchContext | undefined
}): AnswerTurnResponsePlan {
  const query = input.query.trim()
  const serviceSignal = hasAnswerServiceSignal(query)
  const requestedLocation = extractAnswerRequestedLocation(query)
  const contextLocation = aeSearchContextLocationQuery(input.searchContext)
  const hasUsableLocation = requestedLocation !== undefined || contextLocation !== undefined

  if (!serviceSignal && (
    isBroadLocalBrowseQuery(query)
    || isLocatorOnlyBrowseQuery(query)
    || /^(?:can\s+you\s+)?help\s+me[.!?]?$|^i\s+need\s+(?:a\s+)?service[.!?]?$|^(?:i\s+)?need\s+help[.!?]?$/i.test(query)
  )) {
    const locationLabel = requestedLocation ?? aeSearchContextLocationLabel(input.searchContext)
    return buildClarifyResponsePlan({
      reason: 'missing_service',
      snapshot: buildClarificationSnapshot({
        query,
        reason: 'missing_service',
        ...(locationLabel === undefined ? {} : { locationLabel }),
      }),
    })
  }

  if (
    serviceSignal &&
    !hasUsableLocation &&
    input.searchContext?.mode !== 'whole_catalogue' &&
    input.priorTurnsCount === 0
  ) {
    return buildClarifyResponsePlan({
      reason: 'missing_place',
      snapshot: buildClarificationSnapshot({
        query,
        reason: 'missing_place',
      }),
    })
  }

  return buildAnswerResponsePlan()
}

function buildClarifyResponsePlan(input: {
  reason: AnswerClarificationReason
  snapshot: AnswerSnapshot
}): Extract<AnswerResponsePlan, { mode: 'clarify' }> {
  return {
    mode: 'clarify',
    reason: input.reason,
    snapshot: input.snapshot,
    providerBudget: defaultProviderBudgetForMode('clarify'),
    artifactBudget: defaultArtifactBudgetForMode('clarify'),
    toolPolicy: { kind: 'none' },
  }
}

function buildAnswerResponsePlan(): Extract<AnswerResponsePlan, { mode: 'answer' }> {
  return {
    mode: 'answer',
    providerBudget: defaultProviderBudgetForMode('answer'),
    artifactBudget: defaultArtifactBudgetForMode('answer'),
    toolPolicy: { kind: 'registry.search', maxCalls: 1 },
  }
}

export function hasAnswerServiceSignal(query: string): boolean {
  return /\b(?:accountant|accounting|aged care|cleaner|cleaning|dentist|dental|electrician|electrical|family lawyer|hvac|lawyer|locksmith|math tutor|photographer|plumber|plumbing|repair|repairs|tutor|tutoring)\b/i.test(query)
}

export function isDeterministicExactSearch(input: {
  query: string
  priorTurnsCount: number
  searchContext: AeSearchContext | undefined
}, responsePlan: AnswerResponsePlan): boolean {
  if (responsePlan.mode !== 'answer' || input.priorTurnsCount !== 0 || !hasAnswerServiceSignal(input.query)) {
    return false
  }
  return extractAnswerRequestedLocation(input.query) !== undefined
    || aeSearchContextLocationQuery(input.searchContext) !== undefined
}

function buildClarificationSnapshot(input: {
  query: string
  reason: 'missing_service' | 'missing_place'
  locationLabel?: string
}): AnswerSnapshot {
  if (input.reason === 'missing_service') {
    const place = input.locationLabel === undefined ? 'your area' : input.locationLabel
    return {
      query: input.query,
      oneLine: 'What do you need help with?',
      providers: [],
      summary: 'Tell me the service or task you want to get done, and I’ll search listed businesses.',
      nextStep: `Reply with the service or task; I’ll keep ${place} in the search.`,
      agentJsonUrl: buildAgentJsonUrl(input.query, ANSWER_SEARCH_PROVIDER_LIMIT),
      layoutProfile: 'clarification',
    }
  }

  return {
    query: input.query,
    oneLine: 'Which area should I search?',
    providers: [],
    summary: 'I can compare listed businesses once I know where the service is needed.',
    nextStep: 'Search with a suburb or city, for example “emergency plumber in Perth”.',
    agentJsonUrl: buildAgentJsonUrl(input.query, ANSWER_SEARCH_PROVIDER_LIMIT),
    layoutProfile: 'clarification',
  }
}

function extractAnswerRequestedLocation(query: string): string | undefined {
  const location = extractRequestedLocation(query)
  if (location === undefined) {
    return undefined
  }

  const normalized = location.trim().toLowerCase()
  if (
    normalized.length === 0 ||
    normalized === 'i' ||
    normalized === 'me' ||
    normalized === 'my' ||
    normalized === 'we' ||
    normalized === 'our' ||
    normalized === 'here' ||
    normalized === 'there'
  ) {
    return undefined
  }

  if (normalized === 'paramatta' || normalized === 'paramata') {
    return 'Parramatta'
  }

  return location
}

function isBroadLocalBrowseQuery(query: string): boolean {
  const normalized = query.toLowerCase()
  if (!/\b(?:business(?:es)?|providers?|services?|listings?|catalog(?:ue)?|companies|trades?)\b/.test(normalized)) {
    return false
  }
  return /\b(?:near|around|in|local|near me|around me|all|show|find|browse)\b/.test(normalized)
}

function isLocatorOnlyBrowseQuery(query: string): boolean {
  const normalized = query.toLowerCase()
  return /\b(?:near me|around here|around me|nearby|local|everything|anything|stuff|what'?s available|whats available|who'?s available|whos available)\b/.test(normalized)
}
