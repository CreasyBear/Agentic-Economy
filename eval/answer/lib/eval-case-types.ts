/** Seed-only/test-only capability fixture; no live provider claim. */
export const SEED_ONLY_CAPABILITY_OPERATION_REF =
  'operation:v1:3e80c2a3a9b09f6a53b90856f1e077e173b2a151c6bc2530fe3478b76b2d8b31'
export const SEED_ONLY_CAPABILITY_TOOL_ID = 'operation.execute'
export const KEYED_EVAL_OPERATION_REF =
  'operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

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
    tag: 'model-chosen-tool-loop',
    description: 'Safe Answer requests choose tools inside one bounded model loop rather than deterministic routing.',
  },
  {
    tag: 'bounded-tool-loop',
    description: 'Each case declares bounded model requests and model/tool call ceilings.',
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
    description: 'Broad catalogue browse requests search the live catalog instead of dumping a hardcoded listing or asking from a trade list.',
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
    tag: 'execute-ref-from-detail',
    description: 'Execute input operationRef equals the prior operations.detail result.',
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
  {
    tag: 'compare-when-ambiguous',
    description: 'When two listings match, the model compares them from returned evidence before executing.',
  },
  {
    tag: 'keyed-execute-refused',
    description: 'Anonymous execute of a keyed listing is refused; invoke is not used.',
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
