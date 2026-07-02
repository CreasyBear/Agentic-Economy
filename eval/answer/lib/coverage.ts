import {
  ANSWER_EVAL_COVERAGE_REQUIREMENTS,
  ANSWER_HARNESS_EVAL_ASSERTIONS,
  ANSWER_HARNESS_EVAL_CASES,
  ANSWER_HARNESS_EVAL_REQUIREMENTS,
  ANSWER_THREAD_EVAL_CASES,
  ANSWER_TURN_EVAL_CASES,
  type AnswerEvalCoverageTag,
  type AnswerHarnessEvalAssertion,
  type AnswerHarnessEvalCase,
  type AnswerHarnessEvalTag,
  type AnswerThreadEvalCase,
  type AnswerTurnEvalCase,
} from './cases'
import {
  BROAD_ANSWER_EVAL_BUSINESS_FIXTURES,
  BROAD_ANSWER_EVAL_SEED_EXPECTATIONS,
} from './registry-seed'

export type AnswerEvalCoverageIssue = {
  code: string
  message: string
  caseId?: string
  tag?: AnswerEvalCoverageTag
  harnessTag?: AnswerHarnessEvalTag
}

export type AnswerEvalCoverageAudit = {
  ok: boolean
  caseCount: number
  turnCaseCount: number
  threadCaseCount: number
  harnessCaseCount: number
  broadSeedBusinessCount: number
  coveredTags: AnswerEvalCoverageTag[]
  coveredHarnessTags: AnswerHarnessEvalTag[]
  issues: AnswerEvalCoverageIssue[]
}

type PromptfooAnswerMode = 'answer-turn' | 'answer-thread'

type PromptfooAnswerEntry = {
  mode: PromptfooAnswerMode
  caseId: string
}

export function auditAnswerEvalCoverage(): AnswerEvalCoverageAudit {
  const issues: AnswerEvalCoverageIssue[] = []
  const turnCases = [...ANSWER_TURN_EVAL_CASES]
  const threadCases = [...ANSWER_THREAD_EVAL_CASES]
  const allCases = [...turnCases, ...threadCases]
  const coveredTags = new Set<AnswerEvalCoverageTag>()
  const coveredHarnessTags = new Set<AnswerHarnessEvalTag>()
  const ids = new Set<string>()

  for (const testCase of allCases) {
    const coverageTags: readonly AnswerEvalCoverageTag[] = testCase.covers
    if (ids.has(testCase.id)) {
      issues.push({
        code: 'duplicate_case_id',
        message: `Duplicate answer eval case id "${testCase.id}".`,
        caseId: testCase.id,
      })
    }
    ids.add(testCase.id)

    if (coverageTags.length === 0) {
      issues.push({
        code: 'case_without_coverage_tags',
        message: 'Every answer eval case must declare the reliability dimensions it protects.',
        caseId: testCase.id,
      })
    }
    for (const tag of coverageTags) {
      coveredTags.add(tag)
    }
  }

  for (const requirement of ANSWER_EVAL_COVERAGE_REQUIREMENTS) {
    if (!coveredTags.has(requirement.tag)) {
      issues.push({
        code: 'missing_required_coverage',
        message: `Missing required answer eval coverage: ${requirement.description}`,
        tag: requirement.tag,
      })
    }
  }

  for (const testCase of ANSWER_HARNESS_EVAL_CASES as readonly AnswerHarnessEvalCase[]) {
    if (ids.has(testCase.id)) {
      issues.push({
        code: 'duplicate_case_id',
        message: `Duplicate answer eval case id "${testCase.id}".`,
        caseId: testCase.id,
      })
    }
    ids.add(testCase.id)

    if (testCase.covers.length === 0) {
      issues.push({
        code: 'harness_case_without_coverage_tags',
        message: 'Every harness eval case must declare the harness reliability dimensions it protects.',
        caseId: testCase.id,
      })
    }
    for (const tag of testCase.covers) {
      coveredHarnessTags.add(tag)
    }
  }

  for (const requirement of ANSWER_HARNESS_EVAL_REQUIREMENTS) {
    if (!coveredHarnessTags.has(requirement.tag)) {
      issues.push({
        code: 'missing_required_harness_coverage',
        message: `Missing required harness eval coverage: ${requirement.description}`,
        harnessTag: requirement.tag,
      })
    }
  }

  auditTurnCaseShape(turnCases, issues)
  auditThreadCaseShape(threadCases, issues)
  auditHarnessCaseShape(ANSWER_HARNESS_EVAL_CASES, turnCases, threadCases, issues)
  auditBroadSeed(issues)

  return {
    ok: issues.length === 0,
    caseCount: allCases.length,
    turnCaseCount: turnCases.length,
    threadCaseCount: threadCases.length,
    harnessCaseCount: ANSWER_HARNESS_EVAL_CASES.length,
    broadSeedBusinessCount: BROAD_ANSWER_EVAL_BUSINESS_FIXTURES.length,
    coveredTags: [...coveredTags].sort(),
    coveredHarnessTags: [...coveredHarnessTags].sort(),
    issues,
  }
}

export function auditPromptfooAnswerConfig(configText: string): AnswerEvalCoverageIssue[] {
  const issues: AnswerEvalCoverageIssue[] = []
  const entries = parsePromptfooAnswerEntries(configText)
  const catalog = new Map<string, PromptfooAnswerMode>()

  for (const testCase of ANSWER_TURN_EVAL_CASES) {
    catalog.set(testCase.id, 'answer-turn')
  }
  for (const testCase of ANSWER_THREAD_EVAL_CASES) {
    catalog.set(testCase.id, 'answer-thread')
  }

  const seen = new Map<string, PromptfooAnswerMode[]>()
  for (const entry of entries) {
    const modes = seen.get(entry.caseId) ?? []
    modes.push(entry.mode)
    seen.set(entry.caseId, modes)

    const expectedMode = catalog.get(entry.caseId)
    if (expectedMode === undefined) {
      issues.push({
        code: 'promptfoo_unknown_case',
        message: `Promptfoo references unknown answer eval case "${entry.caseId}".`,
        caseId: entry.caseId,
      })
      continue
    }
    if (entry.mode !== expectedMode) {
      issues.push({
        code: 'promptfoo_mode_mismatch',
        message: `Promptfoo case "${entry.caseId}" uses mode ${entry.mode}, expected ${expectedMode}.`,
        caseId: entry.caseId,
      })
    }
  }

  for (const [caseId, expectedMode] of catalog.entries()) {
    const modes = seen.get(caseId) ?? []
    if (modes.length === 0) {
      issues.push({
        code: 'promptfoo_missing_case',
        message: `Promptfoo is missing ${expectedMode} case "${caseId}".`,
        caseId,
      })
    }
    if (modes.length > 1) {
      issues.push({
        code: 'promptfoo_duplicate_case',
        message: `Promptfoo lists answer eval case "${caseId}" ${modes.length} times.`,
        caseId,
      })
    }
  }

  return issues
}

function auditTurnCaseShape(
  turnCases: readonly AnswerTurnEvalCase[],
  issues: AnswerEvalCoverageIssue[],
): void {
  for (const testCase of turnCases) {
    auditExpectedShape(testCase, testCase, issues)

    if (testCase.covers.includes('visible-typo-recovery')) {
      const toolQueries = testCase.expected.toolQueries ?? []
      if (toolQueries.length < 2 || toolQueries[0] === toolQueries[1]) {
        issues.push({
          code: 'typo_recovery_without_visible_correction',
          message: 'Typo recovery cases must assert both the literal query and corrected query in evidence.',
          caseId: testCase.id,
        })
      }
    }

    if (testCase.covers.includes('near-me-location-guard')) {
      if (testCase.searchContext?.mode !== 'near_me' && !testCase.expected.agentJsonIncludes?.some(hasLocationSignal)) {
        issues.push({
          code: 'location_guard_without_location_signal',
          message: 'Location guard cases must use near-me context or assert a location-bearing agent JSON link.',
          caseId: testCase.id,
        })
      }
    }

    if (testCase.covers.includes('broad-catalog-scale') && testCase.registrySeed !== 'broad') {
      issues.push({
        code: 'broad_case_without_broad_seed',
        message: 'Broad catalog cases must opt into the broad registry seed.',
        caseId: testCase.id,
      })
    }
  }
}

function auditThreadCaseShape(
  threadCases: readonly AnswerThreadEvalCase[],
  issues: AnswerEvalCoverageIssue[],
): void {
  for (const testCase of threadCases) {
    if (testCase.turns.length < 2) {
      issues.push({
        code: 'thread_case_too_short',
        message: 'Thread eval cases must contain at least two turns.',
        caseId: testCase.id,
      })
    }

    for (const [index, turn] of testCase.turns.entries()) {
      auditExpectedShape(
        {
          id: `${testCase.id}#${index + 1}`,
          description: `${testCase.description} turn ${index + 1}`,
          covers: testCase.covers,
          query: turn.query,
          ...(turn.searchContext === undefined ? {} : { searchContext: turn.searchContext }),
          ...(turn.plannedAgent === undefined ? {} : { plannedAgent: turn.plannedAgent }),
          expected: turn.expected,
        },
        testCase,
        issues,
      )
    }

    if (testCase.covers.includes('frozen-evidence-follow-up')) {
      const followUp = testCase.turns.slice(1).find((turn) =>
        sameStringList(turn.expected.toolQueries ?? [], []) &&
        (turn.expected.excludeTimingNames ?? []).includes('retrieval.initial_search'),
      )
      if (followUp === undefined) {
        issues.push({
          code: 'frozen_follow_up_without_no_retrieval_assertion',
          message: 'Frozen-evidence follow-up cases must assert no tool queries and no initial search on a later turn.',
          caseId: testCase.id,
        })
      }
    }
  }
}

function auditHarnessCaseShape(
  harnessCases: readonly AnswerHarnessEvalCase[],
  turnCases: readonly AnswerTurnEvalCase[],
  threadCases: readonly AnswerThreadEvalCase[],
  issues: AnswerEvalCoverageIssue[],
): void {
  const turnCaseById = new Map(turnCases.map((testCase) => [testCase.id, testCase]))
  const threadCaseById = new Map(threadCases.map((testCase) => [testCase.id, testCase]))

  for (const testCase of harnessCases) {
    if (testCase.assertions.length === 0) {
      issues.push({
        code: 'harness_case_without_assertions',
        message: 'Every harness eval case must name the structural assertion it protects.',
        caseId: testCase.id,
      })
    }

    for (const assertion of testCase.assertions) {
      if (!(ANSWER_HARNESS_EVAL_ASSERTIONS as readonly string[]).includes(assertion)) {
        issues.push({
          code: 'unknown_harness_assertion',
          message: `Harness eval case references unknown assertion "${assertion}".`,
          caseId: testCase.id,
        })
      }
    }

    auditHarnessCoverageAssertionMapping(testCase, issues)

    if (testCase.source.kind === 'answer-turn') {
      const turnCase = turnCaseById.get(testCase.source.caseId)
      if (turnCase === undefined) {
        issues.push({
          code: 'harness_case_unknown_turn_source',
          message: `Harness eval case references unknown answer turn case "${testCase.source.caseId}".`,
          caseId: testCase.id,
        })
        continue
      }
      auditHarnessTurnSource(testCase, turnCase, issues)
      continue
    }

    if (testCase.source.kind === 'answer-thread') {
      if (!threadCaseById.has(testCase.source.caseId)) {
        issues.push({
          code: 'harness_case_unknown_thread_source',
          message: `Harness eval case references unknown answer thread case "${testCase.source.caseId}".`,
          caseId: testCase.id,
        })
      }
      continue
    }

    if (testCase.source.kind === 'unit-test' && !testCase.source.file.startsWith('tests/unit/')) {
      issues.push({
        code: 'harness_unit_case_outside_unit_tests',
        message: 'Harness unit-test metadata must point at tests/unit.',
        caseId: testCase.id,
      })
    }
    if (testCase.source.kind === 'integration-test' && !testCase.source.file.startsWith('tests/integration/')) {
      issues.push({
        code: 'harness_integration_case_outside_integration_tests',
        message: 'Harness integration-test metadata must point at tests/integration.',
        caseId: testCase.id,
      })
    }
    if (!testCase.source.file.endsWith('.test.ts')) {
      issues.push({
        code: 'harness_case_non_test_source',
        message: 'Harness structural metadata must point at a Vitest test file.',
        caseId: testCase.id,
      })
    }
  }
}

function auditHarnessCoverageAssertionMapping(
  testCase: AnswerHarnessEvalCase,
  issues: AnswerEvalCoverageIssue[],
): void {
  const requiredAssertionsByTag: Record<AnswerHarnessEvalTag, readonly AnswerHarnessEvalAssertion[]> = {
    'persisted-harness-run': ['requires-persisted-harness-run'],
    'live-phase-tool-evidence': ['requires-live-phase-tool-evidence'],
    'blocked-refused-tools': ['requires-blocked-tool', 'requires-refused-tool'],
    'invalid-output': ['requires-invalid-output'],
    'stale-replay': ['requires-stale-replay'],
    'public-leakage': ['forbids-public-harness-leakage'],
    'public-contract-refusal': ['requires-public-contract-refusal'],
  }

  for (const tag of testCase.covers) {
    const missing = requiredAssertionsByTag[tag].filter((assertion) => !testCase.assertions.includes(assertion))
    for (const assertion of missing) {
      issues.push({
        code: 'harness_coverage_without_assertion',
        message: `Harness coverage "${tag}" must include assertion "${assertion}".`,
        caseId: testCase.id,
        harnessTag: tag,
      })
    }
  }
}

function auditHarnessTurnSource(
  harnessCase: AnswerHarnessEvalCase,
  turnCase: AnswerTurnEvalCase,
  issues: AnswerEvalCoverageIssue[],
): void {
  if (
    harnessCase.assertions.includes('requires-persisted-harness-run') &&
    turnCase.expected.requireHarnessRun !== true
  ) {
    issues.push({
      code: 'harness_turn_without_harness_run_assertion',
      message: 'Harness persisted-run metadata must point at a turn case that requires harnessRun.',
      caseId: harnessCase.id,
    })
  }
  if (
    harnessCase.assertions.includes('requires-live-phase-tool-evidence') &&
    ((turnCase.expected.harnessPhases ?? []).length === 0 || turnCase.expected.harnessToolsInvoked === undefined)
  ) {
    issues.push({
      code: 'harness_turn_without_phase_tool_assertion',
      message: 'Live phase/tool harness metadata must point at a turn case with harness phase and tool assertions.',
      caseId: harnessCase.id,
    })
  }
  if (
    harnessCase.assertions.includes('requires-public-contract-refusal') &&
    (!turnCase.covers.includes('unsupported-action-boundary') || turnCase.expected.requireBoundaryCopy !== true)
  ) {
    issues.push({
      code: 'harness_refusal_without_boundary_case',
      message: 'Public contract refusal metadata must point at an unsupported-action boundary case.',
      caseId: harnessCase.id,
    })
  }
}

function auditExpectedShape(
  testCase: AnswerTurnEvalCase,
  parentCase: AnswerTurnEvalCase | AnswerThreadEvalCase,
  issues: AnswerEvalCoverageIssue[],
): void {
  const expected = testCase.expected

  if ((expected.includeTimingNames ?? []).length === 0) {
    issues.push({
      code: 'case_without_timing_names',
      message: 'Every answer eval case must assert expected timing names.',
      caseId: testCase.id,
    })
  }
  if (!(expected.includeTimingNames ?? []).includes('sse.emit_snapshot')) {
    issues.push({
      code: 'case_without_sse_timing',
      message: 'Every answer eval case must assert the SSE snapshot timing.',
      caseId: testCase.id,
    })
  }
  if (expected.maxTotalTimingMs === undefined || expected.maxTotalTimingMs <= 0) {
    issues.push({
      code: 'case_without_timing_budget',
      message: 'Every answer eval case must assert a total timing budget.',
      caseId: testCase.id,
    })
  }
  if (expected.forbidInternalPublicTerms !== true || expected.forbidUnsafeClaims !== true) {
    issues.push({
      code: 'case_without_public_copy_safety',
      message: 'Every answer eval case must scan public copy for internal terms and unsafe claims.',
      caseId: testCase.id,
    })
  }
  if (parentCase.covers.includes('public-copy-boundary') && expected.requireBoundaryCopy !== true) {
    issues.push({
      code: 'boundary_case_without_boundary_assertion',
      message: 'Boundary coverage cases must require boundary copy.',
      caseId: testCase.id,
    })
  }
  if (parentCase.covers.includes('direct-retrieval-fast-path')) {
    if (!(expected.excludeTimingNames ?? []).includes('model.agent_total')) {
      issues.push({
        code: 'direct_retrieval_without_model_exclusion',
        message: 'Direct retrieval cases must assert that model planning did not run.',
        caseId: testCase.id,
      })
    }
  }
  if (parentCase.covers.includes('persisted-tool-evidence') && expected.toolQueries === undefined) {
    issues.push({
      code: 'evidence_case_without_tool_query_assertion',
      message: 'Persisted evidence coverage cases must assert recorded tool query inputs.',
      caseId: testCase.id,
    })
  }
  if (expected.requireHarnessRun === true) {
    if (expected.harnessStatus === undefined) {
      issues.push({
        code: 'harness_case_without_status_assertion',
        message: 'Harness-run eval cases must assert the expected harness terminal status.',
        caseId: testCase.id,
      })
    }
    if (expected.harnessToolsInvoked === undefined) {
      issues.push({
        code: 'harness_case_without_tool_coverage_assertion',
        message: 'Harness-run eval cases must assert invoked tool coverage, even when empty.',
        caseId: testCase.id,
      })
    }
    if ((expected.harnessPhases ?? []).length === 0) {
      issues.push({
        code: 'harness_case_without_phase_coverage_assertion',
        message: 'Harness-run eval cases must assert at least one harness phase.',
        caseId: testCase.id,
      })
    }
  }
}

function auditBroadSeed(issues: AnswerEvalCoverageIssue[]): void {
  const fixtures = BROAD_ANSWER_EVAL_BUSINESS_FIXTURES
  const industries = new Set(fixtures.map((fixture) => fixture.serviceCategory))
  const locales = new Set(fixtures.map((fixture) => `${fixture.suburb}:${fixture.stateTerritory}`))
  const slugs = new Set(fixtures.map((fixture) => fixture.requestedSlug))

  if (fixtures.length < BROAD_ANSWER_EVAL_SEED_EXPECTATIONS.businessCount) {
    issues.push({
      code: 'broad_seed_too_small',
      message: `Broad answer eval seed has ${fixtures.length} businesses, expected at least ${BROAD_ANSWER_EVAL_SEED_EXPECTATIONS.businessCount}.`,
    })
  }
  if (industries.size < BROAD_ANSWER_EVAL_SEED_EXPECTATIONS.industryCount) {
    issues.push({
      code: 'broad_seed_too_few_industries',
      message: `Broad answer eval seed has ${industries.size} industries, expected at least ${BROAD_ANSWER_EVAL_SEED_EXPECTATIONS.industryCount}.`,
    })
  }
  if (locales.size < BROAD_ANSWER_EVAL_SEED_EXPECTATIONS.localeCount) {
    issues.push({
      code: 'broad_seed_too_few_locales',
      message: `Broad answer eval seed has ${locales.size} locales, expected at least ${BROAD_ANSWER_EVAL_SEED_EXPECTATIONS.localeCount}.`,
    })
  }
  if (slugs.size !== fixtures.length) {
    issues.push({
      code: 'broad_seed_duplicate_slugs',
      message: 'Broad answer eval seed must not contain duplicate slugs.',
    })
  }
}

function parsePromptfooAnswerEntries(configText: string): PromptfooAnswerEntry[] {
  const entries: PromptfooAnswerEntry[] = []
  let currentMode: PromptfooAnswerMode | undefined

  for (const rawLine of configText.split(/\r?\n/g)) {
    const line = rawLine.trim()
    if (line.startsWith('- description:')) {
      currentMode = undefined
      continue
    }

    const mode = line.match(/^mode:\s*(answer-turn|answer-thread)\s*$/)
    if (mode?.[1] === 'answer-turn' || mode?.[1] === 'answer-thread') {
      currentMode = mode[1]
      continue
    }

    const caseId = line.match(/^caseId:\s*['"]?([^'"\s]+)['"]?\s*$/)
    if (caseId?.[1] !== undefined && currentMode !== undefined) {
      entries.push({ mode: currentMode, caseId: caseId[1] })
    }
  }

  return entries
}

function hasLocationSignal(value: string): boolean {
  return /location=/i.test(value)
}

function sameStringList(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}
