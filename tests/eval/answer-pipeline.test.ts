import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ANSWER_THREAD_EVAL_CASES,
  ANSWER_TURN_EVAL_CASES,
  type AnswerThreadEvalCase,
  type AnswerTurnEvalCase,
} from '../../eval/answer/lib/cases'
import {
  assembleAnswerEvidence,
  runAnswerToolUseAgent,
  runAnswerGate,
} from '@/modules/answer/public'
import {
  runAnswerThreadEvalCase,
  runAnswerTurnEvalCase,
} from '../../eval/answer/lib/evaluators'
import { runAnswerEvalSuite } from '../../eval/answer/lib/suite'
import {
  auditAnswerEvalCoverage,
  auditPromptfooAnswerConfig,
} from '../../eval/answer/lib/coverage'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'

const QUERY = 'emergency plumber parramatta'

type SerializedReportValues = {
  keys: string[]
  strings: string[]
}

function readSerializedReportValues(serializedReport: string): SerializedReportValues {
  const keys: string[] = []
  const strings: string[] = []
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      strings.push(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value === null || typeof value !== 'object') return
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key)
      visit(nested)
    }
  }

  visit(JSON.parse(serializedReport) as unknown)
  return { keys, strings }
}

describe('answer pipeline eval', () => {
  it('has unique answer eval case ids', () => {
    const ids = [
      ...ANSWER_TURN_EVAL_CASES.map((testCase) => testCase.id),
      ...ANSWER_THREAD_EVAL_CASES.map((testCase) => testCase.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps required answer eval coverage in place', () => {
    const audit = auditAnswerEvalCoverage()
    expect(audit.issues, audit.issues.map((issue) => issue.message).join('; ')).toEqual([])
    expect(audit.broadSeedBusinessCount).toBeGreaterThanOrEqual(100)
  })

  it('keeps promptfoo answer cases in sync with the shared catalog', () => {
    const config = readFileSync(
      new URL('../../eval/answer/promptfooconfig.yaml', import.meta.url),
      'utf8',
    )
    const issues = auditPromptfooAnswerConfig(config)
    expect(issues, issues.map((issue) => issue.message).join('; ')).toEqual([])
  })

  it('produces a failure-explaining suite report from the shared catalog', async () => {
    const report = await runAnswerEvalSuite()
    expect(report.ok).toBe(true)
    expect(report.schemaVersion).toBe('answer-eval-suite-report:v3')
    expect(report.summary.caseCount).toBe(ANSWER_TURN_EVAL_CASES.length + ANSWER_THREAD_EVAL_CASES.length)
    expect(report.summary.failedCaseCount).toBe(0)
    expect(report.summary.failedScoreCaseCount).toBe(0)
    expect(report.summary.minimumCaseScore).toBeGreaterThanOrEqual(report.summary.scoreThreshold)
    expect(report.summary.averageCaseScore).toBeGreaterThanOrEqual(report.summary.scoreThreshold)
    expect(report.summary.failedTurnCount).toBe(0)
    expect(report.summary.p95TurnTimingMs).toBeGreaterThan(0)
    expect(report.seed.broadBusinessCount).toBeGreaterThanOrEqual(100)
    expect(report.cases.every((testCase) => testCase.ok)).toBe(true)
    expect(report.cases.every((testCase) => testCase.score >= testCase.scoreThreshold)).toBe(true)
    expect(report.cases.every((testCase) => testCase.userOutcome.satisfied)).toBe(true)
    expect(report.cases.every((testCase) => testCase.userOutcome.gotRightAnswer)).toBe(true)
    expect(report.cases.every((testCase) => testCase.userOutcome.canProceed)).toBe(true)
    expect(report.cases.every((testCase) => testCase.userOutcome.abandonmentRisk === 'low')).toBe(true)

    const turns = report.cases.flatMap((testCase) => {
      if (testCase.kind === 'turn') {
        return [{ artifactKinds: testCase.artifactKinds, nextStep: testCase.diagnostics.nextStep }]
      }
      return testCase.turns.map((turn) => ({
        artifactKinds: turn.artifactKinds,
        nextStep: turn.diagnostics.nextStep,
      }))
    })
    expect(turns.every((turn) => turn.artifactKinds.includes('one-line'))).toBe(true)
    expect(turns.every((turn) => turn.nextStep === undefined || turn.artifactKinds.includes('what-to-do-now'))).toBe(true)
    const reportTurns = report.cases.flatMap((testCase) => {
      if (testCase.kind === 'turn') {
        return [{
          requestToFirstProgressMs: testCase.requestToFirstProgressMs,
          requestToCompletionMs: testCase.requestToCompletionMs,
        }]
      }
      return testCase.turns.map((turn) => ({
        requestToFirstProgressMs: turn.requestToFirstProgressMs,
        requestToCompletionMs: turn.requestToCompletionMs,
      }))
    })
    for (const turn of reportTurns) {
      expect(Number.isFinite(turn.requestToFirstProgressMs)).toBe(true)
      expect(turn.requestToFirstProgressMs).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(turn.requestToCompletionMs)).toBe(true)
      expect(turn.requestToCompletionMs).toBeGreaterThanOrEqual(0)
    }
    for (const pathSummary of Object.values(report.summary.performanceByPath)) {
      expect(Number.isFinite(pathSummary.turnCount)).toBe(true)
      expect(pathSummary.turnCount).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(pathSummary.p95RequestToFirstProgressMs)).toBe(true)
      expect(pathSummary.p95RequestToFirstProgressMs).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(pathSummary.maxRequestToFirstProgressMs)).toBe(true)
      expect(pathSummary.maxRequestToFirstProgressMs).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(pathSummary.p95RequestToCompletionMs)).toBe(true)
      expect(pathSummary.p95RequestToCompletionMs).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(pathSummary.maxRequestToCompletionMs)).toBe(true)
      expect(pathSummary.maxRequestToCompletionMs).toBeGreaterThanOrEqual(0)
    }
    expect(Number.isFinite(report.summary.modelRequestCount)).toBe(true)
    expect(report.summary.modelRequestCount).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(report.summary.toolRunCount)).toBe(true)
    expect(report.summary.toolRunCount).toBeGreaterThanOrEqual(0)
    expect(Object.values(report.summary.usage).every((value) => Number.isFinite(value) && value >= 0)).toBe(true)
    expect(report.summary.costUnavailableReasons.every((reason) => reason.length > 0)).toBe(true)
    if (report.summary.estimatedUsd !== undefined) {
      expect(Number.isFinite(report.summary.estimatedUsd)).toBe(true)
      expect(report.summary.estimatedUsd).toBeGreaterThanOrEqual(0)
    }
    expect(report.summary.costUnavailableReasons).toEqual(
      [...report.summary.costUnavailableReasons].sort((left, right) => left.localeCompare(right)),
    )

    const directReport = report.cases.find((testCase) => testCase.id === 'turn-direct-parramatta-fast-path')
    expect(directReport?.kind).toBe('turn')
    expect(directReport?.kind === 'turn' ? directReport.modelRequestCount : undefined).toBe(0)

    const paramataReport = report.cases.find((testCase) => testCase.id === 'turn-paramata-visible-recovery')
    expect(paramataReport?.kind).toBe('turn')
    expect(paramataReport?.kind === 'turn' ? paramataReport.modelRequestCount : undefined).toBe(2)
    expect(paramataReport?.kind === 'turn' ? paramataReport.toolRunCount : undefined).toBe(2)
    expect(paramataReport?.kind === 'turn' ? paramataReport.costUnavailableReasons : undefined).toEqual([
      'price_table_missing',
    ])
    expect(paramataReport?.kind === 'turn' ? paramataReport.usage : undefined).toMatchObject({
      inputTokens: 240,
      outputTokens: 67,
      totalTokens: 307,
    })

    const { keys, strings } = readSerializedReportValues(JSON.stringify(report))
    const forbiddenPrivateKeys: Record<string, true> = {
      harnessRun: true,
      harnessFinalization: true,
      modelRequests: true,
      toolId: true,
      inputJson: true,
      resultSummaryJson: true,
      resultJson: true,
      rawToolPayload: true,
      rawToolInput: true,
      rawToolOutput: true,
      resultHash: true,
      snapshotHash: true,
      sourceHash: true,
      descriptorHash: true,
      requestId: true,
      responseId: true,
      providerRequestId: true,
      providerResponseId: true,
      runId: true,
      prompt: true,
      modelResponse: true,
      responseText: true,
    }
    expect(keys.some((key) => forbiddenPrivateKeys[key] === true)).toBe(false)
    const forbiddenPrivateContent = /(?:harnessRun|harnessFinalization|modelRequests|toolId|inputJson|resultSummaryJson|resultJson|rawToolPayload|rawToolInput|rawToolOutput|resultHash|snapshotHash|sourceHash|descriptorHash|requestId|responseId|providerRequestId|providerResponseId|runId|modelResponse|responseText|private:evidence:)/i
    expect(strings.filter((value) => forbiddenPrivateContent.test(value))).toEqual([])
  })

  it('rejects impossible model and tool count expectations', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-paramata-visible-recovery')
    if (sourceCase === undefined) {
      throw new Error('missing turn-paramata-visible-recovery eval case')
    }

    const impossibleCase: AnswerTurnEvalCase = {
      ...sourceCase,
      id: 'turn-paramata-visible-recovery-impossible-counts',
      expected: {
        ...sourceCase.expected,
        expectedModelRequests: 0,
        maxToolRuns: 0,
      },
    }
    const result = await runAnswerTurnEvalCase(impossibleCase)
    expect(result.ok).toBe(false)
    expect(result.problems).toContain('expected 0 model requests, got 2')
    expect(result.problems).toContain('tool run count 2 exceeds 0')
  })

  it.each(ANSWER_TURN_EVAL_CASES)('$id', async (testCase: AnswerTurnEvalCase) => {
    const result = await runAnswerTurnEvalCase(testCase)
    expect(result.ok, result.problems.join('; ')).toBe(true)
  })

  it.each(ANSWER_THREAD_EVAL_CASES)('$id', async (testCase: AnswerThreadEvalCase) => {
    const result = await runAnswerThreadEvalCase(testCase)
    expect(result.ok, result.problems.join('; ')).toBe(true)
  })

  it('returns grounded evidence for the default registry fixture', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousEvalSeed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
    const previousConvexUrl = process.env.CONVEX_URL
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    process.env.AE_ANSWER_EVAL_REGISTRY_SEED = 'default'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const evidence = await assembleAnswerEvidence({ query: QUERY, limit: 10 })
      expect(evidence).toBeDefined()
      expect(evidence?.providers.map((provider) => provider.slug)).toEqual(['parramatta-emergency-plumbing', 'plumbing-demo'])
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousEvalSeed === undefined) {
        delete process.env.AE_ANSWER_EVAL_REGISTRY_SEED
      } else {
        process.env.AE_ANSWER_EVAL_REGISTRY_SEED = previousEvalSeed
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousViteConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousViteConvexUrl
      }
    }
  })

  it('passes runAnswerGate for tool-use agent output grounded on tool-result slugs', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousEvalSeed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair. The business confirms timing, price, availability, and the work.',
        whatToDoNow:
          'Open the provider page and send an inquiry when published. The business confirms timing, price, availability, and the work.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    process.env.AE_ANSWER_EVAL_REGISTRY_SEED = 'default'

    try {
      const result = await runAnswerToolUseAgent({ query: QUERY })
      const gate = runAnswerGate({
        snapshot: result.snapshot,
        allowedSlugs: result.allowedSlugs,
      })
      expect(gate.ok).toBe(true)
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousEvalSeed === undefined) {
        delete process.env.AE_ANSWER_EVAL_REGISTRY_SEED
      } else {
        process.env.AE_ANSWER_EVAL_REGISTRY_SEED = previousEvalSeed
      }
    }
  })
})
