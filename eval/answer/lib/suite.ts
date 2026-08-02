import { round2 } from '../../../src/modules/common/round-2'

import {
  ANSWER_EVAL_COVERAGE_REQUIREMENTS,
  ANSWER_THREAD_EVAL_CASES,
  ANSWER_TURN_EVAL_CASES,
  type AnswerEvalCoverageTag,
  type AnswerThreadEvalCase,
  type AnswerThreadEvalTurn,
  type AnswerTurnEvalCase,
} from './cases'
import { auditAnswerEvalCoverage } from './coverage'
import {
  runAnswerThreadEvalCase,
  runAnswerTurnEvalCase,
  type AnswerEvalPerformancePath,
  type AnswerEvalUsage,
  type AnswerThreadEvalResult,
  type AnswerTurnEvalResult,
} from './evaluators'
import {
  BROAD_ANSWER_EVAL_SEED_EXPECTATIONS,
  BROAD_ANSWER_EVAL_BUSINESS_FIXTURES,
  requireFirstOffering,
} from './registry-seed'
import {
  ANSWER_EVAL_SCORE_THRESHOLD,
  scoreAnswerThreadCase,
  scoreAnswerThreadTurn,
  scoreAnswerTurnCase,
  type AnswerEvalScore,
  type AnswerEvalScoreBreakdown,
  type AnswerEvalScoreRank,
  type AnswerEvalUserOutcome,
} from './scoring'


type AnswerEvalPerformanceSummary = {
  turnCount: number
  p95RequestToFirstProgressMs: number
  maxRequestToFirstProgressMs: number
  p95RequestToCompletionMs: number
  maxRequestToCompletionMs: number
}

type AnswerEvalScoredReport = {
  score: number

  scoreThreshold: number
  rank: AnswerEvalScoreRank
  scoreBreakdown: readonly AnswerEvalScoreBreakdown[]
  userOutcome: AnswerEvalUserOutcome
}
type AnswerEvalTurnMetrics = {
  performancePath: AnswerEvalPerformancePath
  requestToFirstProgressMs: number
  requestToCompletionMs: number
  modelRequestCount: number
  toolRunCount: number
  usage: AnswerEvalUsage
  estimatedUsd?: number
  costUnavailableReasons: readonly string[]
}

type AnswerEvalMeasuredTurn = AnswerEvalTurnMetrics & {
  ok: boolean
  totalTimingMs: number
}
type AnswerEvalAggregateMetrics = {
  modelRequestCount: number
  toolRunCount: number
  usage: AnswerEvalUsage
  estimatedUsd?: number
  costUnavailableReasons: readonly string[]
  performanceByPath: Record<AnswerEvalPerformancePath, AnswerEvalPerformanceSummary>
}

export type AnswerEvalSuiteCaseReport =
  | ({
      kind: 'turn'
      id: string
      description: string
      seed: 'default' | 'broad'
      covers: readonly AnswerEvalCoverageTag[]
      ok: boolean
      problems: readonly string[]
      status: AnswerTurnEvalResult['status']
      slugs: readonly string[]
      toolQueries: readonly string[]
      timingNames: readonly string[]
      artifactKinds: readonly string[]
      workStepIds: readonly string[]
      totalTimingMs: number
      performancePath: AnswerEvalPerformancePath
      requestToFirstProgressMs: number
      requestToCompletionMs: number
      modelRequestCount: number
      toolRunCount: number
      usage: AnswerEvalUsage
      estimatedUsd?: number
      costUnavailableReasons: readonly string[]
      diagnostics: AnswerTurnEvalResult['diagnostics']
    } & AnswerEvalScoredReport)
  | ({
      kind: 'thread'
      id: string
      description: string
      seed: 'default' | 'broad'
      covers: readonly AnswerEvalCoverageTag[]
      ok: boolean
      problems: readonly string[]
      turns: readonly ({
        index: number
        query: string
        ok: boolean
        problems: readonly string[]
        status: AnswerTurnEvalResult['status']
        slugs: readonly string[]
        toolQueries: readonly string[]
        timingNames: readonly string[]
        artifactKinds: readonly string[]
        totalTimingMs: number
        performancePath: AnswerEvalPerformancePath
        requestToFirstProgressMs: number
        requestToCompletionMs: number
        modelRequestCount: number
        toolRunCount: number
        usage: AnswerEvalUsage
        estimatedUsd?: number
        costUnavailableReasons: readonly string[]
        diagnostics: AnswerTurnEvalResult['diagnostics']
      } & AnswerEvalScoredReport)[]
    } & AnswerEvalScoredReport)

export type AnswerEvalSuiteReport = {
  schemaVersion: 'answer-eval-suite-report:v3'
  ok: boolean
  summary: {
    caseCount: number
    turnCaseCount: number
    threadCaseCount: number
    failedCaseCount: number
    failedScoreCaseCount: number
    scoreThreshold: number
    minimumCaseScore: number
    averageCaseScore: number
    totalTurnCount: number
    failedTurnCount: number
    totalTimingMs: number
    p95TurnTimingMs: number
    maxTurnTimingMs: number
    modelRequestCount: number
    toolRunCount: number
    usage: AnswerEvalUsage
    estimatedUsd?: number
    costUnavailableReasons: readonly string[]
    performanceByPath: Record<AnswerEvalPerformancePath, AnswerEvalPerformanceSummary>
  }
  coverage: {
    ok: boolean
    requiredTags: readonly AnswerEvalCoverageTag[]
    coveredTags: readonly AnswerEvalCoverageTag[]
    issues: ReturnType<typeof auditAnswerEvalCoverage>['issues']
  }
  seed: {
    broadBusinessCount: number
    expectedBroadBusinessCount: number
    broadIndustryCount: number
    expectedBroadIndustryCount: number
    broadLocaleCount: number
    expectedBroadLocaleCount: number
  }
  cases: readonly AnswerEvalSuiteCaseReport[]
}

export async function runAnswerEvalSuite(): Promise<AnswerEvalSuiteReport> {
  const coverage = auditAnswerEvalCoverage()
  const turnReports: AnswerEvalSuiteCaseReport[] = []

  for (const testCase of ANSWER_TURN_EVAL_CASES) {
    const result = await runAnswerTurnEvalCase(testCase)
    turnReports.push(toTurnReport(testCase, result))
  }

  const threadReports: AnswerEvalSuiteCaseReport[] = []
  for (const testCase of ANSWER_THREAD_EVAL_CASES) {
    const result = await runAnswerThreadEvalCase(testCase)
    threadReports.push(toThreadReport(testCase, result))
  }

  const cases = [...turnReports, ...threadReports]
  const turnResults = flattenTurnResults(cases)
  const timingValues = turnResults.map((result) => result.totalTimingMs).sort((left, right) => left - right)
  const aggregate = aggregateTurnMetrics(turnResults)
  const failedCaseCount = cases.filter((testCase) => !testCase.ok).length
  const scoreValues = cases.map((testCase) => testCase.score)
  const failedScoreCaseCount = cases.filter((testCase) => testCase.score < ANSWER_EVAL_SCORE_THRESHOLD).length
  const failedTurnCount = turnResults.filter((result) => !result.ok).length

  return {
    schemaVersion: 'answer-eval-suite-report:v3',
    ok: coverage.ok && failedCaseCount === 0 && failedScoreCaseCount === 0,
    summary: {
      caseCount: cases.length,
      turnCaseCount: turnReports.length,
      threadCaseCount: threadReports.length,
      failedCaseCount,
      failedScoreCaseCount,
      scoreThreshold: ANSWER_EVAL_SCORE_THRESHOLD,
      minimumCaseScore: scoreValues.length === 0 ? 0 : Math.min(...scoreValues),
      averageCaseScore: average(scoreValues),
      totalTurnCount: turnResults.length,
      failedTurnCount,
      totalTimingMs: round2(timingValues.reduce((sum, value) => sum + value, 0)),
      p95TurnTimingMs: percentile(timingValues, 95),
      maxTurnTimingMs: timingValues.at(-1) ?? 0,
      ...aggregate,
    },
    coverage: {
      ok: coverage.ok,
      requiredTags: ANSWER_EVAL_COVERAGE_REQUIREMENTS.map((requirement) => requirement.tag),
      coveredTags: coverage.coveredTags,
      issues: coverage.issues,
    },
    seed: readBroadSeedSummary(),
    cases,
  }
}

function toTurnReport(
  testCase: AnswerTurnEvalCase,
  result: AnswerTurnEvalResult,
): AnswerEvalSuiteCaseReport {
  const score = scoreAnswerTurnCase(testCase, result)

  return {
    kind: 'turn',
    id: testCase.id,
    description: testCase.description,
    seed: testCase.registrySeed ?? 'default',
    covers: testCase.covers,
    ok: result.ok,
    problems: result.problems,
    status: result.status,
    slugs: result.slugs,
    toolQueries: result.toolQueries,
    timingNames: result.timingNames,
    artifactKinds: result.artifactKinds,
    workStepIds: result.workStepIds,
    totalTimingMs: result.totalTimingMs,
    ...toTurnMetrics(result),
    diagnostics: result.diagnostics,
    ...toScoredReport(score),
  }
}

function toThreadReport(
  testCase: AnswerThreadEvalCase,
  result: AnswerThreadEvalResult,
): AnswerEvalSuiteCaseReport {
  const turnScores = result.turns.map((turn, index) => scoreAnswerThreadTurn(readThreadTurn(testCase, index), turn))
  const score = scoreAnswerThreadCase(testCase, result, turnScores)

  return {
    kind: 'thread',
    id: testCase.id,
    description: testCase.description,
    seed: testCase.registrySeed ?? 'default',
    covers: testCase.covers,
    ok: result.ok,
    problems: result.problems,
    turns: result.turns.map((turn, index) => ({
      index: index + 1,
      query: readThreadTurn(testCase, index).query,
      ok: turn.ok,
      problems: turn.problems,
      status: turn.status,
      slugs: turn.slugs,
      toolQueries: turn.toolQueries,
        timingNames: turn.timingNames,
        artifactKinds: turn.artifactKinds,
        workStepIds: turn.workStepIds,
        totalTimingMs: turn.totalTimingMs,
        ...toTurnMetrics(turn),
      diagnostics: turn.diagnostics,
      ...toScoredReport(turnScores[index] ?? scoreAnswerThreadTurn(readThreadTurn(testCase, index), turn)),
    })),
    ...toScoredReport(score),
  }
}
function toTurnMetrics(result: AnswerEvalTurnMetrics): AnswerEvalTurnMetrics {
  return {
    performancePath: result.performancePath,
    requestToFirstProgressMs: result.requestToFirstProgressMs,
    requestToCompletionMs: result.requestToCompletionMs,
    modelRequestCount: result.modelRequestCount,
    toolRunCount: result.toolRunCount,
    usage: result.usage,
    ...(result.estimatedUsd === undefined ? {} : { estimatedUsd: result.estimatedUsd }),
    costUnavailableReasons: result.costUnavailableReasons,
  }
}


function toScoredReport(score: AnswerEvalScore): AnswerEvalScoredReport {
  return {
    score: score.score,
    scoreThreshold: score.threshold,
    rank: score.rank,
    scoreBreakdown: score.breakdown,
    userOutcome: score.userOutcome,
  }
}

function readThreadTurn(testCase: AnswerThreadEvalCase, index: number): AnswerThreadEvalTurn {
  return testCase.turns[index] ?? {
    query: '',
    expected: {
      status: 'error',
      slugs: [],
    },
  }
}

function flattenTurnResults(cases: readonly AnswerEvalSuiteCaseReport[]): AnswerEvalMeasuredTurn[] {
  return cases.flatMap((testCase) => {
    if (testCase.kind === 'turn') {
      return [{
        ok: testCase.ok,
        totalTimingMs: testCase.totalTimingMs,
        ...toTurnMetrics(testCase),
      }]
    }

    return testCase.turns.map((turn) => ({
      ok: turn.ok,
      totalTimingMs: turn.totalTimingMs,
      ...toTurnMetrics(turn),
    }))
  })
}

function aggregateTurnMetrics(turns: readonly AnswerEvalMeasuredTurn[]): AnswerEvalAggregateMetrics {
  const usage: AnswerEvalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  }
  let estimatedUsd: number | undefined
  const costUnavailableReasons = new Set<string>()

  for (const turn of turns) {
    usage.inputTokens += turn.usage.inputTokens
    usage.outputTokens += turn.usage.outputTokens
    usage.cachedInputTokens += turn.usage.cachedInputTokens
    usage.cacheWriteTokens += turn.usage.cacheWriteTokens
    usage.reasoningOutputTokens += turn.usage.reasoningOutputTokens
    usage.totalTokens += turn.usage.totalTokens
    if (turn.estimatedUsd !== undefined) {
      estimatedUsd = round2((estimatedUsd ?? 0) + turn.estimatedUsd)
    }
    for (const reason of turn.costUnavailableReasons) {
      costUnavailableReasons.add(reason)
    }
  }

  const deterministicTurns = turns.filter((turn) => turn.performancePath === 'deterministic')
  const modelTurns = turns.filter((turn) => turn.performancePath === 'model')
  return {
    modelRequestCount: turns.reduce((sum, turn) => sum + turn.modelRequestCount, 0),
    toolRunCount: turns.reduce((sum, turn) => sum + turn.toolRunCount, 0),
    usage,
    ...(estimatedUsd === undefined ? {} : { estimatedUsd }),
    costUnavailableReasons: [...costUnavailableReasons].sort((left, right) => left.localeCompare(right)),
    performanceByPath: {
      deterministic: summarizePerformance(deterministicTurns),
      model: summarizePerformance(modelTurns),
    },
  }
}

function summarizePerformance(turns: readonly AnswerEvalMeasuredTurn[]): AnswerEvalPerformanceSummary {
  const firstProgressValues = turns
    .map((turn) => turn.requestToFirstProgressMs)
    .sort((left, right) => left - right)
  const completionValues = turns
    .map((turn) => turn.requestToCompletionMs)
    .sort((left, right) => left - right)
  return {
    turnCount: turns.length,
    p95RequestToFirstProgressMs: percentile(firstProgressValues, 95),
    maxRequestToFirstProgressMs: firstProgressValues.at(-1) ?? 0,
    p95RequestToCompletionMs: percentile(completionValues, 95),
    maxRequestToCompletionMs: completionValues.at(-1) ?? 0,
  }
}

function readBroadSeedSummary(): AnswerEvalSuiteReport['seed'] {
  const industryCount = new Set(BROAD_ANSWER_EVAL_BUSINESS_FIXTURES.map((fixture) => requireFirstOffering(fixture).category)).size
  const localeCount = new Set(
    BROAD_ANSWER_EVAL_BUSINESS_FIXTURES.map((fixture) => `${fixture.suburb}:${fixture.stateTerritory}`),
  ).size

  return {
    broadBusinessCount: BROAD_ANSWER_EVAL_BUSINESS_FIXTURES.length,
    expectedBroadBusinessCount: BROAD_ANSWER_EVAL_SEED_EXPECTATIONS.businessCount,
    broadIndustryCount: industryCount,
    expectedBroadIndustryCount: BROAD_ANSWER_EVAL_SEED_EXPECTATIONS.industryCount,
    broadLocaleCount: localeCount,
    expectedBroadLocaleCount: BROAD_ANSWER_EVAL_SEED_EXPECTATIONS.localeCount,
  }
}

function percentile(sortedValues: readonly number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0
  }

  const rank = Math.ceil((percentileValue / 100) * sortedValues.length) - 1
  const index = Math.min(Math.max(rank, 0), sortedValues.length - 1)
  return round2(sortedValues[index] ?? 0)
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length)
}

