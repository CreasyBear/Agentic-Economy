import { describe, expect, it } from 'vitest'

import { summarizeAnswerBraintrustScores } from '../../../eval/braintrust/answer-report'

const PASSING_SCORE = 0.9

describe('Braintrust answer reporter', () => {
  it('passes only when every reviewed answer meets the existing AE threshold', () => {
    const report = summarizeAnswerBraintrustScores([
      { id: 'turn:1', score: 1, failed: false },
      { id: 'turn:2', score: PASSING_SCORE, failed: false },
    ])
    expect(report.ok).toBe(true)
    expect(report.threshold).toBe(PASSING_SCORE)
    expect(report.averageScore).toBeCloseTo(PASSING_SCORE + 0.05)
    expect(report.failedCaseIds).toEqual([])
  })

  it('fails a below-threshold or errored result and reports its deterministic id', () => {
    const report = summarizeAnswerBraintrustScores([
      { id: 'turn:good', score: 1, failed: false },
      { id: 'turn:low', score: 0.89, failed: false },
      { id: 'turn:error', score: 1, failed: true },
    ])
    expect(report.ok).toBe(false)
    expect(report.evaluatedCount).toBe(3)
    expect(report.failedCaseIds).toEqual(['turn:low', 'turn:error'])
  })

  it('does not claim a pass for an empty local run', () => {
    const report = summarizeAnswerBraintrustScores([])
    expect(report.ok).toBe(false)
    expect(report.averageScore).toBe(0)
    expect(report.failedCaseIds).toEqual([])
  })
})
