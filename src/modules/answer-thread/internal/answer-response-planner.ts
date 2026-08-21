import {
  buildAgentJsonUrl,
  type AnswerArtifact,
  type AnswerLayoutProfile,
  type AnswerSnapshot,
} from '@/modules/answer/public'

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

export type AnswerClarificationReason =
  | 'missing_pending_operation'
  | 'pending_operation_action'

export type AnswerResponsePlan = {
  mode: 'clarify'
  reason: AnswerClarificationReason
  snapshot: AnswerSnapshot
  providerBudget: AnswerProviderBudget
  artifactBudget: AnswerArtifactBudget
  toolPolicy: { kind: 'none' }
}

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

export function defaultArtifactBudgetForMode(mode: AnswerResponseMode): AnswerArtifactBudget {
  const layoutProfile = RESPONSE_MODE_BUDGETS[mode].layoutProfile
  return {
    layoutProfile,
    allowedKinds: ['one-line', 'prose', 'what-to-do-now', 'operation-outcome'],
    maxArtifactCount: 4,
    maxProviderCards: 0,
  }
}

export function planPendingOperationClarification(input: {
  query: string
  hasPendingDecision: boolean
}): AnswerResponsePlan {
  const hasPendingDecision = input.hasPendingDecision
  return {
    mode: 'clarify',
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
    providerBudget: defaultProviderBudgetForMode('clarify'),
    artifactBudget: defaultArtifactBudgetForMode('clarify'),
    toolPolicy: { kind: 'none' },
  }
}
