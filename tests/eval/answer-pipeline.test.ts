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
    expect(report.schemaVersion).toBe('answer-eval-suite-report:v2')
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
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    process.env.AE_ANSWER_EVAL_REGISTRY_SEED = 'default'

    try {
      const evidence = await assembleAnswerEvidence({ query: QUERY, limit: 10 })
      expect(evidence).toBeDefined()
      expect(evidence?.providers.map((provider) => provider.slug)).toEqual(['parramatta-emergency-plumbing'])
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
