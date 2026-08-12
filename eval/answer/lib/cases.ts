/** Seed-only/test-only capability fixture; no live provider claim. */
export const SEED_ONLY_CAPABILITY_OPERATION_REF =
  'operation:v1:3e80c2a3a9b09f6a53b90856f1e077e173b2a151c6bc2530fe3478b76b2d8b31'
export const SEED_ONLY_CAPABILITY_TOOL_ID = `capability.${SEED_ONLY_CAPABILITY_OPERATION_REF}`

export const SEED_ONLY_CAPABILITY_OUTPUT = {
  bitcoin: { usd: 94_213 },
} as const

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

export type EvalOpenRouterToolUse = {
  toolCalls: readonly {
    // Per-operation capability tools expose only the operation's strict input
    // schema; the closure binds its operation reference and persists evidence
    // under the operation.execute tool id.
    toolId: string
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
  {
    tag: 'capability-tool-execution',
    description: 'A direct-data query executes against a seed-only test fixture and grounds the answer in returned contract-valid JSON rather than catalog prose.',
  },
] as const

export type AnswerEvalCoverageTag = (typeof ANSWER_EVAL_COVERAGE_REQUIREMENTS)[number]['tag']

export const ANSWER_HARNESS_EVAL_REQUIREMENTS = [
  {
    tag: 'persisted-harness-run',
    description: 'Complete and error turns persist private harnessRun evidence with a terminal report.',
  },
  {
    tag: 'live-phase-tool-evidence',
    description: 'Harness reports expose phase/tool coverage derived from runtime evidence.',
  },
  {
    tag: 'blocked-refused-tools',
    description: 'Tool policy gates distinguish blocked prompt/write cases from refused deny/exec cases.',
  },
  {
    tag: 'invalid-output',
    description: 'Invalid tool output is represented as harness error evidence instead of public prose.',
  },
  {
    tag: 'stale-replay',
    description: 'Replay projections mark off-path terminal entries stale while keeping public replay sanitized.',
  },
  {
    tag: 'public-leakage',
    description: 'Public answer projections do not expose harnessRun, raw tool inputs, outputs, or hashes.',
  },
  {
    tag: 'public-contract-refusal',
    description: 'Booking, payment, dispatch, and autonomous fulfillment requests stay inside the AE boundary.',
  },
] as const

export type AnswerHarnessEvalTag = (typeof ANSWER_HARNESS_EVAL_REQUIREMENTS)[number]['tag']

export const ANSWER_HARNESS_EVAL_ASSERTIONS = [
  'requires-persisted-harness-run',
  'requires-live-phase-tool-evidence',
  'requires-model-accounting',
  'requires-blocked-tool',
  'requires-refused-tool',
  'requires-invalid-output',
  'requires-stale-replay',
  'forbids-public-harness-leakage',
  'requires-public-contract-refusal',
] as const

export type AnswerHarnessEvalAssertion = (typeof ANSWER_HARNESS_EVAL_ASSERTIONS)[number]

export type EvalHarnessRunStatus =
  | 'ok'
  | 'error'
  | 'refused'
  | 'blocked'
  | 'timeout'
  | 'aborted'
  | 'skipped'

export type AnswerHarnessEvalCase = {
  id: string
  description: string
  covers: readonly AnswerHarnessEvalTag[]
  source:
    | { kind: 'answer-turn'; caseId: string }
    | { kind: 'answer-thread'; caseId: string }
    | { kind: 'unit-test' | 'integration-test'; file: string }
  assertions: readonly AnswerHarnessEvalAssertion[]
}

export type AnswerTurnEvalCase = {
  id: string
  description: string
  covers: readonly AnswerEvalCoverageTag[]
  registrySeed?: 'default' | 'broad'
  query: string
  searchContext?: EvalSearchContext
  openRouterAgent?: EvalOpenRouterToolUse
  /** Test-only response override for the seed-only capability harness. */
  capabilityOutput?: unknown
  expected: {
    status: 'complete' | 'error'
    slugs: readonly string[]
    toolQueries?: readonly string[]
    toolIds?: readonly string[]
    toolStatuses?: readonly string[]
    includeTimingNames?: readonly string[]
    excludeTimingNames?: readonly string[]
    summaryIncludes?: readonly string[]
    oneLineIncludes?: readonly string[]
    nextStepIncludes?: readonly string[]
    agentJsonIncludes?: readonly string[]
    forbidCatalogProse?: boolean
    includeArtifactKinds?: readonly string[]
    forbidArtifactKinds?: readonly string[]
    maxProviderCount?: number
    forbidInternalPublicTerms?: boolean
    forbidUnsafeClaims?: boolean
    requireHarnessRun?: boolean
    harnessStatus?: EvalHarnessRunStatus
    harnessToolsInvoked?: readonly string[]
    harnessPhases?: readonly string[]
    maxTotalTimingMs?: number
    expectedModelRequests?: number
    expectedModelToolRuns?: number
    maxModelRequests?: number
    maxModelToolRuns?: number
    maxToolRuns?: number
    capabilityEvidence?: {
      operationRef: string
      input: Record<string, unknown>
      output: unknown
    }
  }
}

export type AnswerThreadEvalTurn = {
  query: string
  searchContext?: EvalSearchContext
  openRouterAgent?: EvalOpenRouterToolUse
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
    description: 'Direct Parramatta search returns the listed businesses without model planning.',
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
      expectedModelRequests: 1,
      expectedModelToolRuns: 0,
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
      summaryIncludes: ['something that matches what you need'],
      agentJsonIncludes: ['q=emergency+plumber+parramatta'],
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      requireHarnessRun: true,
      harnessStatus: 'ok',
      harnessToolsInvoked: ['registry.search'],
      harnessPhases: ['gate', 'assemble'],
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
    openRouterAgent: {
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'Two listed businesses match this need.',
        summary:
          'The listings publish emergency pipe repair in Parramatta. Review the businesses for timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow:
          'Open the provider page and send an inquiry when that option is published. Agentic Economy does not book or take payment on this page.',
      },
    },
    expected: {
      status: 'complete',
      expectedModelRequests: 3,
      expectedModelToolRuns: 1,
      maxModelRequests: 3,
      maxModelToolRuns: 1,
      maxToolRuns: 2,
      slugs: ['plumbing-demo', 'parramatta-emergency-plumbing'],
      toolQueries: ['paramata', 'parramatta'],
      toolIds: ['registry.search', 'registry.search'],
      toolStatuses: ['complete', 'complete'],
      includeTimingNames: [
        'retrieval.initial_search',
        'registry.search.convex',
        'tool.run',
        'sse.emit_snapshot',
      ],
      agentJsonIncludes: ['q=parramatta'],
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
      expectedModelRequests: 1,
      expectedModelToolRuns: 0,
      slugs: [],
      toolQueries: ['Emergency plumber Brunswick', 'Emergency plumber Brunswick'],
      toolIds: ['registry.search', 'web.discover'],
      toolStatuses: ['complete', 'refused'],
      includeTimingNames: [
        'retrieval.initial_search',
        'registry.search.convex',
        'sse.emit_snapshot',
      ],
      excludeTimingNames: ['model.agent_total'],
      oneLineIncludes: ['No businesses match'],
      summaryIncludes: ['No matches found'],
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
      expectedModelRequests: 1,
      expectedModelToolRuns: 0,
      slugs: [],
      toolQueries: [],
      includeTimingNames: [
        'turn.context_parse',
        'sse.emit_snapshot',
        'turn.persistence_prepare',
      ],
      excludeTimingNames: ['registry.search.convex', 'model.agent_total'],
      oneLineIncludes: ['What do you need done in Perth'],
      summaryIncludes: ['once I know what you need'],
      nextStepIncludes: ['what you need'],
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
        source: 'user_selected',
      },
    },
    expected: {
      status: 'complete',
      expectedModelRequests: 1,
      expectedModelToolRuns: 0,
      slugs: [],
      toolQueries: ['emergency plumber', 'emergency plumber'],
      toolIds: ['registry.search', 'web.discover'],
      toolStatuses: ['complete', 'refused'],
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
      expectedModelRequests: 1,
      expectedModelToolRuns: 0,
      slugs: [],
      toolQueries: [],
      includeTimingNames: ['turn.context_parse', 'sse.emit_snapshot', 'turn.persistence_prepare'],
      excludeTimingNames: ['model.agent_total', 'retrieval.initial_search'],
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      requireHarnessRun: true,
      harnessStatus: 'ok',
      harnessToolsInvoked: [],
      harnessPhases: ['gate', 'assemble'],
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
      expectedModelRequests: 1,
      expectedModelToolRuns: 0,
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
      summaryIncludes: ['something that matches what you need'],
      agentJsonIncludes: ['q=dentist+coburg'],
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
        source: 'user_selected',
      },
    },
    expected: {
      status: 'complete',
      expectedModelRequests: 1,
      expectedModelToolRuns: 0,
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
      summaryIncludes: ['something that matches what you need'],
      agentJsonIncludes: ['location=Perth'],
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
      expectedModelRequests: 1,
      expectedModelToolRuns: 0,
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
      summaryIncludes: ['something that matches what you need'],
      agentJsonIncludes: ['q=family+lawyer+in+Parramatta'],
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
      expectedModelRequests: 1,
      expectedModelToolRuns: 0,
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
      summaryIncludes: ['something that matches what you need'],
      agentJsonIncludes: ['q=locksmith+near+Geelong'],
      forbidInternalPublicTerms: true,
      forbidUnsafeClaims: true,
      maxTotalTimingMs: 5_000,
    },
  },
  {
    id: 'turn-capability-tool-executes',
    description: 'A direct-data query executes against a seed-only test fixture and grounds the answer in its returned JSON rather than catalog prose.',
    covers: [
      'capability-tool-execution',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
    ],
    query: 'what is the current price of bitcoin in USD',
    openRouterAgent: {
      toolCalls: [
        {
          toolId: SEED_ONLY_CAPABILITY_TOOL_ID,
          input: { ids: 'bitcoin', vs_currencies: 'usd' },
        },
      ],
      prose: {
        oneLine: 'The seed-only test quote for bitcoin is $94,213.00 USD.',
        summary:
          'The seed-only test response returned 94213.00 USD (bitcoin to usd).',
        whatToDoNow:
          'Use the returned test quote for this evaluation; no provider fulfilment or availability claim is made.',
      },
    },
    capabilityOutput: SEED_ONLY_CAPABILITY_OUTPUT,
    expected: {
      status: 'complete',
      expectedModelRequests: 3,
      expectedModelToolRuns: 1,
      maxModelRequests: 3,
      maxModelToolRuns: 1,
      maxToolRuns: 1,
      slugs: [],
      toolIds: ['operation.execute'],
      toolStatuses: ['complete'],
      oneLineIncludes: ['USD'],
      summaryIncludes: ['94213.00'],
      capabilityEvidence: {
        operationRef: SEED_ONLY_CAPABILITY_OPERATION_REF,
        input: { ids: 'bitcoin', vs_currencies: 'usd' },
        output: SEED_ONLY_CAPABILITY_OUTPUT,
      },
      forbidCatalogProse: true,
      includeTimingNames: ['model.agent_total', 'tool.run', 'sse.emit_snapshot'],
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
          expectedModelRequests: 1,
          expectedModelToolRuns: 0,
          slugs: ['parramatta-emergency-plumbing'],
          toolQueries: ['emergency plumber parramatta'],
          includeTimingNames: ['retrieval.initial_search', 'sse.emit_snapshot'],
          excludeTimingNames: ['model.agent_total'],
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
      {
        query: 'which take inquiries?',
        expected: {
          status: 'complete',
          expectedModelRequests: 1,
          expectedModelToolRuns: 0,
          slugs: [],
          toolQueries: [],
          includeTimingNames: ['sse.emit_snapshot'],
          excludeTimingNames: ['retrieval.initial_search', 'model.agent_total'],
          oneLineIncludes: ['No businesses accept requests yet'],
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
          expectedModelRequests: 1,
          expectedModelToolRuns: 0,
          slugs: ['parramatta-emergency-plumbing'],
          toolQueries: ['emergency plumber parramatta'],
          includeTimingNames: ['retrieval.initial_search', 'sse.emit_snapshot'],
          excludeTimingNames: ['model.agent_total'],
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
      {
        query: 'book the first one and pay now',
        expected: {
          status: 'complete',
          expectedModelRequests: 1,
          expectedModelToolRuns: 0,
          slugs: ['parramatta-emergency-plumbing'],
          toolQueries: [],
          includeTimingNames: ['turn.context_parse', 'sse.emit_snapshot', 'turn.persistence_prepare'],
          excludeTimingNames: ['model.agent_total', 'retrieval.initial_search'],
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
    ],
  },
] as const satisfies readonly AnswerThreadEvalCase[]

export const ANSWER_HARNESS_EVAL_CASES = [
  {
    id: 'harness-persisted-run-direct-turn',
    description: 'A complete direct-retrieval turn persists private harnessRun evidence and phase/tool coverage.',
    covers: ['persisted-harness-run', 'live-phase-tool-evidence'],
    source: { kind: 'answer-turn', caseId: 'turn-direct-parramatta-fast-path' },
    assertions: ['requires-persisted-harness-run', 'requires-live-phase-tool-evidence'],
  },
  {
    id: 'harness-public-contract-refusal-turn',
    description: 'Unsupported booking/payment intent returns boundary copy with persisted harnessRun evidence.',
    covers: ['persisted-harness-run', 'public-contract-refusal'],
    source: { kind: 'answer-turn', caseId: 'turn-unsupported-booking-boundary' },
    assertions: ['requires-persisted-harness-run', 'requires-public-contract-refusal'],
  },
  {
    id: 'harness-blocked-refused-tool-policy',
    description: 'Harness approval policy records public prompt/write blocks separately from deny/exec refusals.',
    covers: ['blocked-refused-tools'],
    source: { kind: 'unit-test', file: 'tests/unit/harness/approval-policy.test.ts' },
    assertions: ['requires-blocked-tool', 'requires-refused-tool'],
  },
  {
    id: 'harness-invalid-output-evidence',
    description: 'Harness run reports keep invalid output as private error evidence and counters.',
    covers: ['invalid-output'],
    source: { kind: 'unit-test', file: 'tests/unit/harness/run-collector.test.ts' },
    assertions: ['requires-invalid-output'],
  },
  {
    id: 'harness-answer-model-accounting',
    description: 'Answer model execution emits provider/model/usage accounting records for harness reports.',
    covers: ['live-phase-tool-evidence'],
    source: { kind: 'unit-test', file: 'tests/unit/answer/answer-tool-use-agent.test.ts' },
    assertions: ['requires-live-phase-tool-evidence', 'requires-model-accounting'],
  },
  {
    id: 'harness-stale-replay-projection',
    description: 'Harness replay projection identifies stale terminal branches and sanitizes public replay output.',
    covers: ['stale-replay'],
    source: { kind: 'unit-test', file: 'tests/unit/harness/replay-projection.test.ts' },
    assertions: ['requires-stale-replay', 'forbids-public-harness-leakage'],
  },
  {
    id: 'harness-public-projection-leakage',
    description: 'Public answer-thread projection omits raw harnessRun, tool payloads, and result hashes.',
    covers: ['public-leakage'],
    source: { kind: 'integration-test', file: 'tests/integration/answer-tool-calls.test.ts' },
    assertions: ['forbids-public-harness-leakage'],
  },
] as const satisfies readonly AnswerHarnessEvalCase[]

export function findAnswerTurnEvalCase(caseId: string): AnswerTurnEvalCase | undefined {
  return ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === caseId)
}

export function findAnswerThreadEvalCase(caseId: string): AnswerThreadEvalCase | undefined {
  return ANSWER_THREAD_EVAL_CASES.find((testCase) => testCase.id === caseId)
}
