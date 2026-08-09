import { ANSWER_EVAL_SCORE_THRESHOLD } from '../answer/lib/scoring'

export const ANSWER_BRAINTRUST_SCORE_THRESHOLD = ANSWER_EVAL_SCORE_THRESHOLD / 10

export type AnswerBraintrustReport = {
  ok: boolean
  threshold: number
  averageScore: number
  evaluatedCount: number
  failedCaseIds: readonly string[]
}

export type AnswerBraintrustScoreSample = {
  id: string
  score?: number
  failed: boolean
}

export function summarizeAnswerBraintrustScores(
  samples: readonly AnswerBraintrustScoreSample[],
): AnswerBraintrustReport {
  const failures: string[] = []
  const scores: number[] = []
  for (const sample of samples) {
    if (sample.score === undefined || !Number.isFinite(sample.score)) {
      failures.push(sample.id)
      continue
    }
    scores.push(sample.score)
    if (sample.score < ANSWER_BRAINTRUST_SCORE_THRESHOLD || sample.failed) failures.push(sample.id)
  }
  const averageScore = scores.length === 0
    ? 0
    : scores.reduce((sum, score) => sum + score, 0) / scores.length
  return {
    ok: failures.length === 0
      && scores.length > 0
      && averageScore >= ANSWER_BRAINTRUST_SCORE_THRESHOLD,
    threshold: ANSWER_BRAINTRUST_SCORE_THRESHOLD,
    averageScore,
    evaluatedCount: samples.length,
    failedCaseIds: failures,
  }
}
