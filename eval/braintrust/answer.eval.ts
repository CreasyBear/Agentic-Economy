import {
  Eval,
  Reporter,
  initDataset,
  type AnyDataset,
  type EvalCase,
} from 'braintrust'

import {
  ANSWER_TURN_EVAL_CASES,
  findAnswerTurnEvalCase,
  type AnswerTurnEvalCase,
} from '../answer/lib/cases'
import {
  runAnswerTurnEvalCase,
  type AnswerTurnEvalResult,
} from '../answer/lib/evaluators'
import { isBoundedReviewedExpected } from '../../tools/ae/lib/braintrust-learning'
import { isRecord } from '@/modules/common/is-record'
import { scoreAnswerTurnCase } from '../answer/lib/scoring'
import {
  summarizeAnswerBraintrustScores,
  type AnswerBraintrustReport,
  type AnswerBraintrustScoreSample,
} from './answer-report'

const DEFAULT_PROJECT = 'Agentic Economy'
const DEFAULT_DATASET = 'ae-answer-reviewed'

export type BraintrustAnswerEvalMode = 'local' | 'remote'

export type BraintrustAnswerEvalOptions = {
  mode: BraintrustAnswerEvalMode
  project?: string
  dataset?: string
  datasetVersion?: string
  baseExperimentId?: string
  apiKey?: string
}

type AnswerEvalInput = {
  caseId?: string
  turnId?: string
  query?: string
}

type AnswerEvalExpected = AnswerTurnEvalCase['expected']

type AnswerEvalData = EvalCase<AnswerEvalInput, AnswerEvalExpected, void>
function buildAnswerBraintrustScoreSample(input: {
  id: unknown
  score: unknown
  failed: boolean
}): AnswerBraintrustScoreSample {
  const sample = {
    id: typeof input.id === 'string' ? input.id : 'unknown',
    failed: input.failed,
  }
  return typeof input.score === 'number'
    ? { ...sample, score: input.score }
    : sample
}



export const answerBraintrustReporter = Reporter<AnswerBraintrustReport>('AE answer score threshold', {
  reportEval: (_evaluator, result) => summarizeAnswerBraintrustScores(result.results.map((evaluation) =>
    buildAnswerBraintrustScoreSample({
      id: evaluation.id ?? evaluation.input.caseId ?? evaluation.input.turnId,
      score: evaluation.scores.answer_quality,
      failed: evaluation.error !== undefined,
    }),
  )),
  reportRun: (reports) => reports.length > 0 && reports.every((report) => report.ok),
})


export async function runBraintrustAnswerEval(options: BraintrustAnswerEvalOptions) {
  const project = options.project ?? DEFAULT_PROJECT
  const datasetName = options.dataset ?? DEFAULT_DATASET
  const evaluator = options.mode === 'local'
    ? {
        data: inlineAnswerCases(),
        task: runAnswerTask,
        scores: [scoreAnswerCase],
        experimentName: 'ae-answer-local',
        description: 'Local no-send Braintrust wrapper around the existing AE answer cases, evaluators, and scoring.',
        metadata: { source: 'ae-answer-eval', mode: 'local' },
        maxConcurrency: 1,
      }
    : {
        data: remoteAnswerCases({
          project,
          dataset: datasetName,
          datasetVersion: requireDatasetVersion(options.datasetVersion),
          apiKey: requireBraintrustKey(options.apiKey),
        }),
        task: runAnswerTask,
        scores: [scoreAnswerCase],
        experimentName: 'ae-answer-remote',
        description: 'Pinned Braintrust dataset evaluation through the existing AE answer evaluator and score.',
        metadata: {
          source: 'ae-answer-eval',
          mode: 'remote',
          dataset: datasetName,
          datasetVersion: requireDatasetVersion(options.datasetVersion),
        },
        maxConcurrency: 1,
      }
  return Eval('ae-answer', evaluator, {
    noSendLogs: options.mode === 'local',
    reporter: answerBraintrustReporter,
    ...(options.mode === 'remote' && options.baseExperimentId !== undefined
      ? { baseExperimentId: requireBaseExperimentId(options.baseExperimentId) }
      : {}),
  })
}

function inlineAnswerCases(): AnswerEvalData[] {
  return ANSWER_TURN_EVAL_CASES.map((testCase) => ({
    id: testCase.id,
    input: { caseId: testCase.id },
    expected: testCase.expected,
    tags: ['ae', 'answer', 'inline-case'],
  }))
}

async function* remoteAnswerCases(options: {
  project: string
  dataset: string
  datasetVersion: string
  apiKey: string
}): AsyncGenerator<AnswerEvalData> {
  const dataset: AnyDataset = initDataset({
    project: options.project,
    dataset: options.dataset,
    version: options.datasetVersion,
    apiKey: options.apiKey,
  })
  for await (const value of dataset) {
    const row = readRemoteDatasetRow(value)
    const input = readEvalInput(row.input)
    const expected = readExpected(row.expected)
    yield {
      id: row.id,
      input,
      expected,
      ...(row.tags === undefined ? {} : { tags: row.tags }),
    }
  }
}

async function runAnswerTask(
  input: AnswerEvalInput,
  hooks: { expected: AnswerEvalExpected },
): Promise<AnswerTurnEvalResult> {
  const testCase = resolveAnswerCase(input, hooks.expected)
  if (testCase === undefined) {
    throw new Error('braintrust_answer_case_requires_case_id_or_reviewed_expected')
  }
  return runAnswerTurnEvalCase(testCase)
}

function scoreAnswerCase(args: {
  input: AnswerEvalInput
  output: AnswerTurnEvalResult
  expected: AnswerEvalExpected
}) {
  const testCase = resolveAnswerCase(args.input, args.expected)
  if (testCase === undefined) {
    return {
      name: 'answer_quality',
      score: 0,
      metadata: { reason: 'braintrust_answer_case_requires_case_id_or_reviewed_expected' },
    }
  }
  const score = scoreAnswerTurnCase(testCase, args.output)
  return {
    name: 'answer_quality',
    score: score.score / 10,
    metadata: {
      threshold: score.threshold,
      rank: score.rank,
      satisfied: score.userOutcome.satisfied,
      breakdown: score.breakdown,
    },
  }
}

function resolveAnswerCase(input: AnswerEvalInput, expected?: AnswerEvalExpected): AnswerTurnEvalCase | undefined {
  if (input.caseId !== undefined) {
    return findAnswerTurnEvalCase(input.caseId)
  }
  if (input.query === undefined || expected === undefined) return undefined
  return {
    id: input.turnId ?? 'braintrust-reviewed-turn',
    description: 'Reviewed Braintrust answer turn.',
    covers: [],
    query: input.query,
    expected,
  }
}

type BraintrustNewDatasetRecord = {
  id: string
  input: unknown
  expected: unknown
  tags?: unknown
}

type BraintrustLegacyDatasetRecord = {
  id: string
  input: unknown
  output: unknown
  metadata: unknown
}

function isNewBraintrustDatasetRecord(
  value: Record<string, unknown>,
): value is BraintrustNewDatasetRecord & Record<string, unknown> {
  return 'expected' in value
}

function isLegacyBraintrustDatasetRecord(
  value: Record<string, unknown>,
): value is BraintrustLegacyDatasetRecord & Record<string, unknown> {
  return 'output' in value && 'metadata' in value
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((tag: unknown) => typeof tag === 'string')
}

function readRemoteDatasetRow(value: unknown): {
  id: string
  input: unknown
  expected: unknown
  tags?: string[]
} {
  if (!isRecord(value) || typeof value.id !== 'string' || !('input' in value)) {
    throw new Error('braintrust_answer_dataset_row_invalid')
  }
  if (isLegacyBraintrustDatasetRecord(value) || !isNewBraintrustDatasetRecord(value)) {
    throw new Error('braintrust_answer_dataset_row_invalid')
  }
  const tags = value.tags
  if (tags !== undefined && !isStringArray(tags)) {
    throw new Error('braintrust_answer_dataset_tags_invalid')
  }
  return {
    id: value.id,
    input: value.input,
    expected: value.expected,
    ...(tags === undefined ? {} : { tags }),
  }
}

function readEvalInput(value: unknown): AnswerEvalInput {
  if (!isRecord(value)) {
    throw new Error('braintrust_answer_dataset_input_invalid')
  }
  const caseId = typeof value.caseId === 'string' ? value.caseId : undefined
  const turnId = typeof value.turnId === 'string' ? value.turnId : undefined
  const query = typeof value.query === 'string' ? value.query : undefined
  if (caseId === undefined && query === undefined) throw new Error('braintrust_answer_dataset_input_missing_query')
  return { ...(caseId === undefined ? {} : { caseId }), ...(turnId === undefined ? {} : { turnId }), ...(query === undefined ? {} : { query }) }
}

function readExpected(value: unknown): AnswerEvalExpected {
  if (!isBoundedReviewedExpected(value)) {
    throw new Error('braintrust_answer_dataset_expected_invalid')
  }
  return value as AnswerEvalExpected
}

function requireBraintrustKey(value: string | undefined): string {
  const apiKey = value?.trim() || process.env.BRAINTRUST_API_KEY?.trim()
  if (apiKey === undefined || apiKey.length === 0) throw new Error('BRAINTRUST_API_KEY is required for remote Braintrust evaluation.')
  return apiKey
}

function requireDatasetVersion(value: string | undefined): string {
  const version = value?.trim() || process.env.AE_BRAINTRUST_DATASET_VERSION?.trim()
  if (version === undefined || version.length === 0 || /\s/u.test(version) || /^(?:latest|current|head)$/iu.test(version)) {
    throw new Error('AE_BRAINTRUST_DATASET_VERSION must be an exact immutable Braintrust xact id for remote evaluation.')
  }
  return version
}

function requireBaseExperimentId(value: string): string {
  const id = value.trim()
  if (id.length === 0 || /\s/u.test(id)) throw new Error('AE_BRAINTRUST_BASE_EXPERIMENT_ID must be an exact experiment id.')
  return id
}

if (process.argv[1]?.endsWith('/eval/braintrust/answer.eval.ts') === true) {
  const mode: BraintrustAnswerEvalMode = process.argv.includes('--remote') ? 'remote' : 'local'
  const result = await runBraintrustAnswerEval({
    mode,
    ...(process.env.AE_BRAINTRUST_BASE_EXPERIMENT_ID === undefined ? {} : { baseExperimentId: process.env.AE_BRAINTRUST_BASE_EXPERIMENT_ID }),
  })
  const report = summarizeAnswerBraintrustScores(result.results.map((evaluation) =>
    buildAnswerBraintrustScoreSample({
      id: evaluation.id ?? evaluation.input.caseId ?? evaluation.input.turnId,
      score: evaluation.scores.answer_quality,
      failed: evaluation.error !== undefined,
    }),
  ))
  process.stdout.write(`${JSON.stringify({ summary: result.summary, aeReport: report }, null, 2)}\n`)
  if (!report.ok) process.exitCode = 1
}
