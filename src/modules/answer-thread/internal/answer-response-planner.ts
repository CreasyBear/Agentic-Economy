import {
  buildAgentJsonUrl,
  extractRequestedLocation,
  getDefaultArtifactBudgetForLayoutProfile,
  isConfirmedSearchContext,
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

export type AnswerResponseMode = 'clarify' | 'answer' | 'compare' | 'filter' | 'empty' | 'boundary' | 'unsupported' | 'error'

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

export type AnswerClarificationReason =
  | 'missing_service'
  | 'missing_place'
  | 'missing_pending_operation'
  | 'pending_operation_action'

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
  unsupported: {
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
  const confirmedContext = isConfirmedSearchContext(input.searchContext)
  const hasUsableLocation = requestedLocation !== undefined || (
    confirmedContext && contextLocation !== undefined
  )
  const isVagueHelpRequest = /^(?:can\s+you\s+)?help\s+me[.!?]?$|^i\s+need\s+(?:a\s+)?service[.!?]?$|^(?:i\s+)?need\s+help[.!?]?$/i.test(query)

  if (!serviceSignal && (
    isBroadLocalBrowseQuery(query)
    || isLocatorOnlyBrowseQuery(query)
    || isVagueHelpRequest
  )) {
    const locationLabel = isVagueHelpRequest
      ? (confirmedContext ? aeSearchContextLocationLabel(input.searchContext) : undefined)
      : requestedLocation ?? (confirmedContext ? aeSearchContextLocationLabel(input.searchContext) : undefined)

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
    const proposedLocationLabel = aeSearchContextLocationLabel(input.searchContext)

    return buildClarifyResponsePlan({
      reason: 'missing_place',
      snapshot: buildClarificationSnapshot({
        query,
        reason: 'missing_place',
        ...(proposedLocationLabel === undefined ? {} : { locationLabel: proposedLocationLabel }),
      }),
    })
  }

  return buildAnswerResponsePlan()
}

export function planPendingOperationClarification(input: {
  query: string
  hasPendingDecision: boolean
}): Extract<AnswerResponsePlan, { mode: 'clarify' }> {
  const hasPendingDecision = input.hasPendingDecision
  return buildClarifyResponsePlan({
    reason: hasPendingDecision
      ? 'pending_operation_action'
      : 'missing_pending_operation',
    snapshot: {
      query: input.query,
      oneLine: hasPendingDecision
        ? 'What should I do with the pending operation?'
        : 'What should I execute?',
      providers: [],
      summary: hasPendingDecision
        ? 'Choose the recorded approval or recovery action, or start a new operation.'
        : 'Name the operation and result you want before I run anything.',
      nextStep: hasPendingDecision
        ? 'Choose the approval or reconciliation action, or ask for a new operation.'
        : 'Name the operation and result you want.',
      agentJsonUrl: buildAgentJsonUrl(input.query, ANSWER_SEARCH_PROVIDER_LIMIT),
      layoutProfile: 'clarification',
    },
  })
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


function buildClarificationSnapshot(input: {
  query: string
  reason: 'missing_service' | 'missing_place'
  locationLabel?: string
}): AnswerSnapshot {
  if (input.reason === 'missing_service') {
    const place = input.locationLabel
    return {
      query: input.query,
      oneLine: place === undefined ? 'What are you trying to get done?' : `What do you need done in ${place}?`,
      providers: [],
      summary: place === undefined
        ? 'Tell me what you need done, and I’ll look for businesses that can help.'
        : `I can look for businesses that can help in ${place} once I know what you need.`,
      nextStep: place === undefined
        ? 'Reply with what you need; I’ll look in your area.'
        : `Reply with what you need; I’ll keep ${place} in the search.`,
      agentJsonUrl: buildAgentJsonUrl(input.query, ANSWER_SEARCH_PROVIDER_LIMIT),
      layoutProfile: 'clarification',
    }
  }

  const proposedPlace = input.locationLabel
  return {
    query: input.query,
    oneLine: proposedPlace === undefined ? 'Where should I look?' : `Should I look in ${proposedPlace}?`,
    providers: [],
    summary: proposedPlace === undefined
      ? 'I can look for businesses that can help once I know the area.'
      : `Your configured context proposes ${proposedPlace}, but I need you to confirm that area before I search.`,
    nextStep: proposedPlace === undefined
      ? 'Add a suburb or city, for example “emergency plumber in Perth”.'
      : `Confirm ${proposedPlace}, or add a different suburb or city before I search.`,
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
