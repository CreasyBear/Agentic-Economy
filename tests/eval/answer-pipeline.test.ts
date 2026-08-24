import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import {
  ANSWER_THREAD_EVAL_CASES,
  ANSWER_TURN_EVAL_CASES,
  type AnswerThreadEvalCase,
  type AnswerTurnEvalCase,
} from '../../eval/answer/lib/cases'
import { seedKeylessExecutableSource } from '../helpers/keyless-seed-source'
import {
  ANSWER_TURN_DATA_PART,
  runAnswerGate,
  type AnswerTurnFrame,
  type AnswerTurnUIMessage,
} from '@/modules/answer/public'
import { runAnswerToolUseAgent } from '@/modules/answer/server'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'
import { registrySearchAction } from '@/modules/registry/registry.actions'
import {
  runAnswerThreadEvalCase,
  runAnswerTurnEvalCase,
  type AnswerTurnEvalResult,
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
import { readAnswerTurnStream } from '../helpers/answer-turn-stream'
import { createLocalE2eRegistrySourcePort } from '../helpers/registry-local-e2e'

const QUERY = 'listed offering parramatta'

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

  it('invokes onFrame for each parsed answer frame', async () => {
    const sent: AnswerTurnFrame[] = [
      { seq: 0, event: { type: 'thread', threadId: 'thread:eval', turnId: 'turn:eval', turnSeq: 1 } },
      { seq: 1, event: { type: 'one-line', oneLine: 'A business matches.' } },
      { seq: 2, event: { type: 'pending' } },
    ]
    const stream = createUIMessageStream<AnswerTurnUIMessage>({
      execute: ({ writer }) => {
        for (const frame of sent) {
          writer.write({ type: ANSWER_TURN_DATA_PART, data: frame, transient: true })
        }
      },
      onError: () => 'answer_turn_failed',
    })
    const observed: AnswerTurnFrame[] = []
    const frames = await readAnswerTurnStream(
      createUIMessageStreamResponse({ stream }),
      (frame) => observed.push(frame),
    )

    expect(frames).toEqual(sent)
    expect(observed).toEqual(sent)
  })

  it('produces a failure-explaining suite report from the shared catalog', async () => {
    const report = await runAnswerEvalSuite()
    expect(report.schemaVersion).toBe('answer-eval-suite-report:v3')
    expect(report.schemaVersion).not.toBe('answer-eval-suite-report:v2')
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
    expect(report.cases.every((testCase) => testCase.userOutcome.satisfied), JSON.stringify(report.cases.filter((testCase) => !testCase.userOutcome.satisfied), null, 2)).toBe(true)
    expect(report.cases.every((testCase) => testCase.userOutcome.gotRightAnswer)).toBe(true)
    expect(report.cases.every((testCase) => testCase.userOutcome.canProceed)).toBe(true)
    expect(report.cases.every((testCase) => testCase.userOutcome.abandonmentRisk === 'low')).toBe(true)

    const turns = report.cases.flatMap((testCase) => {
      if (testCase.kind === 'turn') {
        return [{ artifactKinds: testCase.artifactKinds }]
      }
      return testCase.turns.map((turn) => ({
        artifactKinds: turn.artifactKinds,
      }))
    })
    expect(turns.every((turn) => turn.artifactKinds.includes('one-line'))).toBe(true)
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
    expect(Number.isFinite(report.summary.modelToolRunCount)).toBe(true)
    expect(report.summary.modelToolRunCount).toBeGreaterThanOrEqual(0)
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

    expect(report.summary.capabilityToolCounts).toEqual({
      total: 2,
      complete: 1,
      refused: 1,
      error: 0,
    })
    expect(report.summary.capabilityOperationRefDialects).toEqual({
      canonical: 2,
      readable: 0,
      invalid: 0,
      missing: 0,
    })
    expect(report.summary.capabilityEvidenceCompleteTurnCount).toBe(1)

    const capabilityReport = report.cases.find((testCase) => testCase.id === 'turn-capability-tool-executes')
    expect(capabilityReport?.kind).toBe('turn')
    expect(capabilityReport?.kind === 'turn' ? capabilityReport.modelRequestCount : undefined).toBe(5)
    expect(capabilityReport?.kind === 'turn' ? capabilityReport.modelToolRunCount : undefined).toBe(3)
    const directReport = report.cases.find((testCase) => testCase.id === 'turn-direct-parramatta-fast-path')
    expect(directReport?.kind).toBe('turn')
    expect(directReport?.kind === 'turn' ? directReport.modelRequestCount : undefined).toBe(4)
    expect(directReport?.kind === 'turn' ? directReport.modelToolRunCount : undefined).toBe(1)

    const paramataReport = report.cases.find((testCase) => testCase.id === 'turn-paramata-visible-recovery')
    expect(paramataReport?.kind).toBe('turn')
    expect(paramataReport?.kind === 'turn' ? paramataReport.modelRequestCount : undefined).toBe(5)
    expect(paramataReport?.kind === 'turn' ? paramataReport.modelToolRunCount : undefined).toBe(2)
    expect(paramataReport?.kind === 'turn' ? paramataReport.toolRunCount : undefined).toBe(2)
    expect(paramataReport?.kind === 'turn' ? paramataReport.costUnavailableReasons : undefined).toEqual([
      'price_table_missing',
    ])
    expect(paramataReport?.kind === 'turn' ? paramataReport.usage : undefined).toMatchObject({
      inputTokens: 520,
      outputTokens: 136,
      totalTokens: 656,
    })

    const { keys, strings } = readSerializedReportValues(JSON.stringify(report))
    const forbiddenPrivateKeys: Record<string, true> = {
      diagnostics: true,
      oneLine: true,
      nextStep: true,
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
    const forbiddenPrivateContent = /(?:harnessRun|harnessFinalization|modelRequests|toolId|inputJson|resultSummaryJson|resultJson|rawToolPayload|rawToolInput|rawToolOutput|resultHash|snapshotHash|sourceHash|descriptorHash|requestId|responseId|providerRequestId|providerResponseId|runId|modelResponse|responseText|private:evidence:)|(?<![\w-])prompt(?![\w-])/i
    expect(forbiddenPrivateContent.test('recovery-prompts')).toBe(false)
    expect(forbiddenPrivateContent.test('raw prompt content')).toBe(true)
    expect(strings.filter((value) => forbiddenPrivateContent.test(value))).toEqual([])
    expect(strings).not.toContain('Two businesses may fit what you need.')
    expect(strings).not.toContain('The businesses offer emergency pipe repair in Parramatta.')
  })

  it('rejects impossible model and tool count expectations', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-capability-tool-executes')
    if (sourceCase === undefined) {
      throw new Error('missing turn-capability-tool-executes eval case')
    }

    const impossibleCase: AnswerTurnEvalCase = {
      ...sourceCase,
      id: 'turn-capability-tool-executes-impossible-counts',
      expected: {
        ...sourceCase.expected,
        expectedModelRequests: 0,
        expectedModelToolRuns: 0,
        maxModelToolRuns: 0,
        maxToolRuns: 0,
      },
    }
    const result = await runAnswerTurnEvalCase(impossibleCase)
    expect(result.ok).toBe(false)
    expect(result.problems).toContain('expected 0 model requests, got 5')
    expect(result.problems).toContain('expected 0 model tool runs, got 3')
  })
  it('rejects a seed-only capability response that violates its output schema', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-capability-tool-executes')
    if (sourceCase === undefined) {
      throw new Error('missing turn-capability-tool-executes eval case')
    }

    const result = await runAnswerTurnEvalCase({
      ...sourceCase,
      id: 'turn-capability-tool-executes-schema-mismatch',
      capabilityOutput: { bitcoin: { usd: '94,213' } },
    })

    expect(result.ok).toBe(false)
    expect(result.problems).toContain('capability evidence status is error')
  })

  it('rejects a seed-only capability query mismatch instead of treating kind as success', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-capability-tool-executes')
    if (sourceCase === undefined || sourceCase.openRouterAgent === undefined) {
      throw new Error('missing turn-capability-tool-executes eval case')
    }

    const result = await runAnswerTurnEvalCase({
      ...sourceCase,
      id: 'turn-capability-tool-executes-query-mismatch',
      openRouterAgent: {
        ...sourceCase.openRouterAgent,
        toolCalls: sourceCase.openRouterAgent.toolCalls.map((call) =>
          call.toolId === 'operation.execute'
            ? {
                ...call,
                input: {
                  ...call.input,
                  input: { ids: 'ethereum', vs_currencies: 'usd' },
                },
              }
            : call
        ),
      },
    })

    expect(result.ok).toBe(false)
    expect(result.problems, result.problems.join('; ')).toContain('capability evidence status is error')
  })

  it('rejects stale seed-only prose when the completed operation returns a changed value', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-capability-tool-executes')
    if (sourceCase === undefined) {
      throw new Error('missing turn-capability-tool-executes eval case')
    }

    const result = await runAnswerTurnEvalCase({
      ...sourceCase,
      id: 'turn-capability-tool-executes-stale-prose',
      capabilityOutput: { bitcoin: { usd: 95_123 } },
      expected: {
        ...sourceCase.expected,
        capabilityEvidence: {
          ...sourceCase.expected.capabilityEvidence!,
          output: { bitcoin: { usd: 95_123 } },
        },
      },
    })

    expect(result.ok).toBe(false)
    expect(result.problems).toContain('capability prose is stale for returned value')
  })
  it('rejects a seed-only capability result bound to the wrong operation reference', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-capability-tool-executes')
    if (sourceCase === undefined) {
      throw new Error('missing turn-capability-tool-executes eval case')
    }

    const result = await runAnswerTurnEvalCase({
      ...sourceCase,
      id: 'turn-capability-tool-executes-ref-mismatch',
      expected: {
        ...sourceCase.expected,
        capabilityEvidence: {
          ...sourceCase.expected.capabilityEvidence!,
          operationRef: `operation:v1:${'b'.repeat(64)}`,
        },
      },
    })

    expect(result.ok).toBe(false)
    expect(result.problems).toContain('capability operation reference mismatch')
  })

  it('enforces persisted tool statuses without leaking tool identities', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-paramata-visible-recovery')
    if (sourceCase === undefined) {
      throw new Error('missing turn-paramata-visible-recovery eval case')
    }

    const result = await runAnswerTurnEvalCase({
      ...sourceCase,
      id: 'turn-paramata-wrong-tool-status',
      expected: {
        ...sourceCase.expected,
        toolStatuses: ['refused', 'complete'],
      },
    })

    expect(result.ok).toBe(false)
    expect(result.problems.some((problem) =>
      problem.startsWith('tool status expectation failed (2 expected, 2 observed)'),
    )).toBe(true)
    expect(result.problems.join('; ')).not.toContain('registry.search')
  })

  it('rejects wrong model accounting on a direct-search case', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-direct-parramatta-fast-path')
    if (sourceCase === undefined) {
      throw new Error('missing turn-direct-parramatta-fast-path eval case')
    }

    const result = await runAnswerTurnEvalCase({
      ...sourceCase,
      id: 'turn-direct-parramatta-model-request',
      expected: {
        ...sourceCase.expected,
        expectedModelRequests: 0,
        expectedModelToolRuns: 1,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.problems).toContain('expected 0 model requests, got 4')
    expect(result.problems.join('; ')).not.toContain('model tool runs')
  })

  it('rejects wrong model request and model-tool counts', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-capability-tool-executes')
    if (sourceCase === undefined) {
      throw new Error('missing turn-capability-tool-executes eval case')
    }

    const result = await runAnswerTurnEvalCase({
      ...sourceCase,
      id: 'turn-capability-tool-executes-wrong-model-counts',
      expected: {
        ...sourceCase.expected,
        expectedModelRequests: 1,
        maxModelRequests: 1,
        expectedModelToolRuns: 2,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.problems).toContain('expected 1 model requests, got 5')
    expect(result.problems).toContain('expected 2 model tool runs, got 3')
    expect(result.problems).toContain('model request count 5 exceeds 1')
  })

  it('rejects nonfinite wall-clock latency', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-direct-parramatta-fast-path')
    if (sourceCase === undefined) {
      throw new Error('missing turn-direct-parramatta-fast-path eval case')
    }

    const now = vi.spyOn(performance, 'now').mockReturnValue(Number.NaN)
    let result: AnswerTurnEvalResult
    try {
      result = await runAnswerTurnEvalCase({
        ...sourceCase,
        id: 'turn-direct-parramatta-nonfinite-latency',
      })
    } finally {
      now.mockRestore()
    }

    expect(result.ok).toBe(false)
    expect(result.problems).toContain('request wall-clock timings must be finite and non-negative')
  })
  it('redacts private tool identities from failed eval expectations', async () => {
    const sourceCase = ANSWER_TURN_EVAL_CASES.find((testCase) => testCase.id === 'turn-paramata-visible-recovery')
    if (sourceCase === undefined) {
      throw new Error('missing turn-paramata-visible-recovery eval case')
    }

    const privateToolIds = ['private.tool.a', 'private.tool.b']
    const result = await runAnswerTurnEvalCase({
      ...sourceCase,
      id: 'turn-paramata-private-tool-id-mismatch',
      expected: {
        ...sourceCase.expected,
        toolIds: privateToolIds,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.problems).toContain('tool identity expectation failed (2 expected, 2 observed)')
    expect(result.problems.join('; ')).not.toContain(privateToolIds[0] as string)
    expect(result.problems.join('; ')).not.toContain(privateToolIds[1] as string)
    expect(result.problems.join('; ')).not.toContain('registry.search')
  })

  it.each(ANSWER_TURN_EVAL_CASES)('$id', async (testCase: AnswerTurnEvalCase) => {
    const result = await runAnswerTurnEvalCase(testCase)
    expect(result.ok, `${result.problems.join('; ')}; diagnostics=${JSON.stringify(result.diagnostics)}`).toBe(true)
  })

  it.each(ANSWER_THREAD_EVAL_CASES)('$id', async (testCase: AnswerThreadEvalCase) => {
    const result = await runAnswerThreadEvalCase(testCase)
    expect(result.ok, result.problems.join('; ')).toBe(true)
  })

  it('returns grounded evidence for the default registry fixture', async () => {
    const resetRegistryPort = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())
    try {
      const page = await registrySearchAction.run({
        data: { query: QUERY, limit: 10 },
        context: { caller: 'chat' },
      })
      expect(page.items.map((item) => item.slug)).toEqual(['demo-listed-provider'])
    } finally {
      resetRegistryPort()
    }
  })

  it('replaces provider fulfillment claims despite grounded tool-result slugs', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: QUERY } }],
      prose: {
        oneLine: 'One business may fit what you need.',
        summary:
          'The business offers emergency pipe repair. The business confirms timing, price, availability, and the work.',
        whatToDoNow:
          'Open the business page and send a request when published. The business confirms timing, price, availability, and the work.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const resetRegistryPort = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())

    try {
      const result = await runAnswerToolUseAgent({
        query: QUERY,
        keylessExecutableSource: seedKeylessExecutableSource,
      })
      expect(runAnswerGate({
        snapshot: result.snapshot,
        allowedSlugs: result.allowedSlugs,
      })).toEqual({ ok: true })
      expect(result.snapshot.summary).toContain('still need confirmation')
      expect(result.snapshot.summary).not.toContain('confirms timing')
    } finally {
      resetRegistryPort()
      restoreOpenRouter()
      await server.close()
    }
  })
})
