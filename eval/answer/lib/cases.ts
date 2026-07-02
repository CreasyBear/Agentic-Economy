export type EvalSearchContext = {
  mode: 'near_me' | 'whole_catalogue'
  allowOutsideArea?: boolean
  location?: {
    label: string
    suburb?: string
    stateTerritory?: string
    countryCode: 'AU'
    source: 'default' | 'user_selected' | 'browser_permission' | 'saved'
  }
}

export type EvalPlannedAgent = {
  toolCalls: readonly {
    toolId: 'registry.search' | 'registry.detail'
    input: Record<string, unknown>
  }[]
  prose: {
    oneLine: string
    summary: string
    whatToDoNow: string
  }
}

export const ANSWER_EVAL_COVERAGE_REQUIREMENTS = [
  {
    tag: 'direct-retrieval-fast-path',
    description: 'A high-confidence query returns deterministic registry results without model planning.',
  },
  {
    tag: 'visible-typo-recovery',
    description: 'A misspelled chat query records the literal empty search before any corrected search.',
  },
  {
    tag: 'empty-state',
    description: 'An unmatched service/location query returns a clean empty state.',
  },
  {
    tag: 'near-me-location-guard',
    description: 'Near-me context blocks unrelated catalogue results from another area.',
  },
  {
    tag: 'broad-query-clarification',
    description: 'Broad location-only catalogue browse requests ask for a service before rendering providers.',
  },
  {
    tag: 'unsupported-action-boundary',
    description: 'Booking, payment, dispatch, and fulfillment requests stay inside the AE boundary.',
  },
  {
    tag: 'persisted-tool-evidence',
    description: 'Expected tool inputs are asserted from persisted frozen evidence.',
  },
  {
    tag: 'timing-trace',
    description: 'Expected timing names and total timing budgets are asserted.',
  },
  {
    tag: 'public-copy-boundary',
    description: 'Public answer copy states AE boundary honestly when required.',
  },
  {
    tag: 'public-copy-safety-scan',
    description: 'Public answer copy is scanned for unsafe claims and internal terms.',
  },
  {
    tag: 'agent-json-link',
    description: 'The answer exposes the expected read-only provider JSON link.',
  },
  {
    tag: 'frozen-evidence-follow-up',
    description: 'A follow-up can reuse frozen provider evidence without a new registry search.',
  },
  {
    tag: 'multi-turn-boundary',
    description: 'Unsafe follow-ups after a result still return boundary-safe copy.',
  },
  {
    tag: 'broad-catalog-scale',
    description: 'Retrieval is exercised against a 100-business, multi-industry, multi-locale catalog.',
  },
] as const

export type AnswerEvalCoverageTag = (typeof ANSWER_EVAL_COVERAGE_REQUIREMENTS)[number]['tag']

export type AnswerTurnEvalCase = {
  id: string
  description: string
  covers: readonly AnswerEvalCoverageTag[]
  registrySeed?: 'default' | 'broad'
  query: string
  searchContext?: EvalSearchContext
  plannedAgent?: EvalPlannedAgent
  expected: {
    status: 'complete' | 'error'
    slugs: readonly string[]
    toolQueries?: readonly string[]
    includeTimingNames?: readonly string[]
    excludeTimingNames?: readonly string[]
    summaryIncludes?: readonly string[]
    oneLineIncludes?: readonly string[]
    nextStepIncludes?: readonly string[]
    agentJsonIncludes?: readonly string[]
    includeArtifactKinds?: readonly string[]
    forbidArtifactKinds?: readonly string[]
    maxProviderCount?: number
    requireBoundaryCopy?: boolean
    forbidInternalPublicTerms?: boolean
    forbidUnsafeClaims?: boolean
    maxTotalTimingMs?: number
  }
}

export type AnswerThreadEvalTurn = {
  query: string
  searchContext?: EvalSearchContext
  plannedAgent?: EvalPlannedAgent
  expected: AnswerTurnEvalCase['expected']
}

export type AnswerThreadEvalCase = {
  id: string
  description: string
  covers: readonly AnswerEvalCoverageTag[]
  registrySeed?: 'default' | 'broad'
  turns: readonly AnswerThreadEvalTurn[]
}

export const ANSWER_TURN_EVAL_CASES = [
  {
    id: 'turn-direct-parramatta-fast-path',
    description: 'Direct Parramatta search returns the listed provider without model planning.',
    covers: [
      'direct-retrieval-fast-path',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
      'agent-json-link',
    ],
    query: 'emergency plumber parramatta',
    expected: {
      status: 'complete',
      slugs: ['parramatta-emergency-plumbing'],
      toolQueries: ['emergency plumber parramatta'],
      includeTimingNames: [
        'turn.context_parse',
        'retrieval.initial_search',
        'registry.search.convex',
        'tool.run',
        'sse.emit_snapshot',
        'turn.persistence_prepare',
      ],
      excludeTimingNames: ['model.agent_total'],
      summaryIncludes: ['publishes service coverage'],
      agentJsonIncludes: ['q=emergency+plumber+parramatta'],
      requireBoundaryCopy: true,
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-paramata-visible-recovery',
    description: 'Misspelled Paramata query preserves the literal empty search before planned recovery.',
    covers: [
      'visible-typo-recovery',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
      'agent-json-link',
    ],
    query: 'paramata',
    plannedAgent: {
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair in Parramatta. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow:
          'Open the provider page and send an inquiry when that option is published. Agentic Economy does not book or take payment on this page.',
      },
    },
    expected: {
      status: 'complete',
      slugs: ['parramatta-emergency-plumbing'],
      toolQueries: ['paramata', 'parramatta'],
      includeTimingNames: [
        'retrieval.initial_search',
        'model.agent_total',
        'registry.search.convex',
        'tool.run',
        'sse.emit_snapshot',
      ],
      summaryIncludes: ['does not book or take payment'],
      nextStepIncludes: ['does not book or take payment'],
      agentJsonIncludes: ['q=parramatta'],
      requireBoundaryCopy: true,
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-brunswick-empty-state',
    description: 'Brunswick search returns a clean empty state when no listed provider matches.',
    covers: [
      'empty-state',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-safety-scan',
    ],
    query: 'Emergency plumber Brunswick',
    expected: {
      status: 'complete',
      slugs: [],
      toolQueries: ['Emergency plumber Brunswick'],
      includeTimingNames: [
        'retrieval.initial_search',
        'registry.search.convex',
        'sse.emit_snapshot',
      ],
      excludeTimingNames: ['model.agent_total'],
      oneLineIncludes: ['No listed businesses match'],
      summaryIncludes: ['No listed providers publish'],
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-broad-perth-businesses-clarifies',
    description: 'Broad Perth business browsing asks what service is needed instead of dumping listings.',
    covers: [
      'broad-query-clarification',
      'timing-trace',
      'public-copy-safety-scan',
      'agent-json-link',
    ],
    registrySeed: 'broad',
    query: 'businesses in Perth',
    expected: {
      status: 'complete',
      slugs: [],
      toolQueries: [],
      includeTimingNames: [
        'turn.context_parse',
        'sse.emit_snapshot',
        'turn.persistence_prepare',
      ],
      excludeTimingNames: ['registry.search.convex', 'model.agent_total'],
      oneLineIncludes: ['What kind of service do you need in Perth'],
      summaryIncludes: ['once I know the service type'],
      nextStepIncludes: ['service and place'],
      agentJsonIncludes: ['q=businesses+in+Perth'],
      includeArtifactKinds: ['one-line', 'prose', 'what-to-do-now'],
      forbidArtifactKinds: ['provider-cards', 'provider-compare-table', 'location-map', 'recovery-prompts'],
      maxProviderCount: 0,
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-perth-context-blocks-parramatta',
    description: 'Perth near-me context does not leak a Parramatta provider for a service-only query.',
    covers: [
      'near-me-location-guard',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-safety-scan',
      'agent-json-link',
    ],
    query: 'emergency plumber',
    searchContext: {
      mode: 'near_me',
      allowOutsideArea: false,
      location: {
        label: 'Perth, WA',
        suburb: 'Perth',
        stateTerritory: 'WA',
        countryCode: 'AU',
        source: 'default',
      },
    },
    expected: {
      status: 'complete',
      slugs: [],
      toolQueries: ['emergency plumber'],
      includeTimingNames: [
        'retrieval.initial_search',
        'registry.search.convex',
        'sse.emit_snapshot',
      ],
      excludeTimingNames: ['model.agent_total'],
      agentJsonIncludes: ['location=Perth'],
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-unsupported-booking-boundary',
    description: 'Booking/payment boundary question stays inside the safe AE boundary.',
    covers: [
      'unsupported-action-boundary',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
    ],
    query: 'can you book a plumber for me',
    expected: {
      status: 'complete',
      slugs: [],
      toolQueries: [],
      includeTimingNames: ['turn.context_parse', 'sse.emit_snapshot', 'turn.persistence_prepare'],
      excludeTimingNames: ['model.agent_total', 'retrieval.initial_search'],
      oneLineIncludes: ['does not book'],
      summaryIncludes: ['does not book or take payment'],
      nextStepIncludes: ['does not book or take payment'],
      requireBoundaryCopy: true,
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-broad-coburg-dentist',
    description: 'Broad catalog retrieval finds the right industry and suburb among 100 businesses.',
    covers: [
      'broad-catalog-scale',
      'direct-retrieval-fast-path',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
      'agent-json-link',
    ],
    registrySeed: 'broad',
    query: 'dentist coburg',
    expected: {
      status: 'complete',
      slugs: ['coburg-dental-clinic'],
      toolQueries: ['dentist coburg'],
      includeTimingNames: [
        'turn.context_parse',
        'retrieval.initial_search',
        'registry.search.convex',
        'tool.run',
        'sse.emit_snapshot',
        'turn.persistence_prepare',
      ],
      excludeTimingNames: ['model.agent_total'],
      summaryIncludes: ['publishes service coverage'],
      agentJsonIncludes: ['q=dentist+coburg'],
      requireBoundaryCopy: true,
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-broad-perth-near-me-plumber',
    description: 'Broad catalog near-me retrieval returns the Perth plumber without leaking other cities.',
    covers: [
      'broad-catalog-scale',
      'near-me-location-guard',
      'direct-retrieval-fast-path',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
      'agent-json-link',
    ],
    registrySeed: 'broad',
    query: 'emergency plumber',
    searchContext: {
      mode: 'near_me',
      allowOutsideArea: false,
      location: {
        label: 'Perth, WA',
        suburb: 'Perth',
        stateTerritory: 'WA',
        countryCode: 'AU',
        source: 'default',
      },
    },
    expected: {
      status: 'complete',
      slugs: ['perth-emergency-plumbing'],
      toolQueries: ['emergency plumber'],
      includeTimingNames: [
        'turn.context_parse',
        'retrieval.initial_search',
        'registry.search.convex',
        'tool.run',
        'sse.emit_snapshot',
        'turn.persistence_prepare',
      ],
      excludeTimingNames: ['model.agent_total'],
      summaryIncludes: ['publishes service coverage'],
      agentJsonIncludes: ['location=Perth'],
      requireBoundaryCopy: true,
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-broad-parramatta-family-lawyer',
    description: 'Broad catalog retrieval separates a Parramatta lawyer from same-suburb service neighbors.',
    covers: [
      'broad-catalog-scale',
      'direct-retrieval-fast-path',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
      'agent-json-link',
    ],
    registrySeed: 'broad',
    query: 'family lawyer in Parramatta',
    expected: {
      status: 'complete',
      slugs: ['parramatta-family-law'],
      toolQueries: ['family lawyer in Parramatta'],
      includeTimingNames: [
        'turn.context_parse',
        'retrieval.initial_search',
        'registry.search.convex',
        'tool.run',
        'sse.emit_snapshot',
        'turn.persistence_prepare',
      ],
      excludeTimingNames: ['model.agent_total'],
      summaryIncludes: ['publishes service coverage'],
      agentJsonIncludes: ['q=family+lawyer+in+Parramatta'],
      requireBoundaryCopy: true,
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-broad-geelong-locksmith',
    description: 'Broad catalog retrieval finds a local locksmith without cross-industry matches.',
    covers: [
      'broad-catalog-scale',
      'direct-retrieval-fast-path',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
      'agent-json-link',
    ],
    registrySeed: 'broad',
    query: 'locksmith near Geelong',
    expected: {
      status: 'complete',
      slugs: ['geelong-locksmith'],
      toolQueries: ['locksmith near Geelong'],
      includeTimingNames: [
        'turn.context_parse',
        'retrieval.initial_search',
        'registry.search.convex',
        'tool.run',
        'sse.emit_snapshot',
        'turn.persistence_prepare',
      ],
      excludeTimingNames: ['model.agent_total'],
      summaryIncludes: ['publishes service coverage'],
      agentJsonIncludes: ['q=locksmith+near+Geelong'],
      requireBoundaryCopy: true,
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
] as const satisfies readonly AnswerTurnEvalCase[]

export const ANSWER_THREAD_EVAL_CASES = [
  {
    id: 'thread-filter-uses-frozen-evidence',
    description: 'A filter follow-up reuses frozen provider evidence without a new registry search.',
    covers: [
      'frozen-evidence-follow-up',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
    ],
    turns: [
      {
        query: 'emergency plumber parramatta',
        expected: {
          status: 'complete',
          slugs: ['parramatta-emergency-plumbing'],
          toolQueries: ['emergency plumber parramatta'],
          includeTimingNames: ['retrieval.initial_search', 'sse.emit_snapshot'],
          excludeTimingNames: ['model.agent_total'],
          requireBoundaryCopy: true,
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
      {
        query: 'which take inquiries?',
        plannedAgent: {
          toolCalls: [],
          prose: {
            oneLine: 'No listed provider in this result publishes an inquiry option.',
            summary:
              'No listed provider in the current result publishes a qualified inquiry option. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
            whatToDoNow:
              'Open the provider page for published details, or try another search. Agentic Economy does not book or take payment on this page.',
          },
        },
        expected: {
          status: 'complete',
          slugs: [],
          toolQueries: [],
          includeTimingNames: ['model.agent_total', 'sse.emit_snapshot'],
          excludeTimingNames: ['retrieval.initial_search'],
          oneLineIncludes: ['No listed provider'],
          summaryIncludes: ['does not book or take payment'],
          nextStepIncludes: ['does not book or take payment'],
          requireBoundaryCopy: true,
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
    ],
  },
  {
    id: 'thread-unsupported-follow-up-keeps-boundary',
    description: 'An unsafe follow-up after a provider result returns boundary copy without tools or model calls.',
    covers: [
      'multi-turn-boundary',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
    ],
    turns: [
      {
        query: 'emergency plumber parramatta',
        expected: {
          status: 'complete',
          slugs: ['parramatta-emergency-plumbing'],
          toolQueries: ['emergency plumber parramatta'],
          includeTimingNames: ['retrieval.initial_search', 'sse.emit_snapshot'],
          excludeTimingNames: ['model.agent_total'],
          requireBoundaryCopy: true,
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
      {
        query: 'book the first one and pay now',
        expected: {
          status: 'complete',
          slugs: ['parramatta-emergency-plumbing'],
          toolQueries: [],
          includeTimingNames: ['turn.context_parse', 'sse.emit_snapshot', 'turn.persistence_prepare'],
          excludeTimingNames: ['model.agent_total', 'retrieval.initial_search'],
          oneLineIncludes: ['cannot book'],
          summaryIncludes: ['does not book'],
          nextStepIncludes: ['does not book or take payment'],
          requireBoundaryCopy: true,
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
    ],
  },
] as const satisfies readonly AnswerThreadEvalCase[]

export function findAnswerTurnEvalCase(caseId: string): AnswerTurnEvalCase | undefined {
  return ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === caseId)
}

export function findAnswerThreadEvalCase(caseId: string): AnswerThreadEvalCase | undefined {
  return ANSWER_THREAD_EVAL_CASES.find((testCase) => testCase.id === caseId)
}
