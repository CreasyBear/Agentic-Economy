import { describe, expect, it } from 'vitest'
import { scoreToolEvidence, toolSelectionReasons, type ToolSelectionEvidence } from '@/modules/common/tool-selection-score'

const evidence: ToolSelectionEvidence = { aeCompleted: 9, aeFailed: 1, usedBefore: false }

describe('paid-answer report selection signal', () => {
  it.each(['balanced', 'cheapest', 'reliable'] as const)('applies a bounded separate penalty with %s preference', preference => {
    const baseline = scoreToolEvidence(evidence, preference)
    expect(scoreToolEvidence({ ...evidence, reportedByBuyers30d: 0 }, preference)).toBe(baseline)
    const one = scoreToolEvidence({ ...evidence, reportedByBuyers30d: 1 }, preference)
    const many = scoreToolEvidence({ ...evidence, reportedByBuyers30d: 1000 }, preference)
    expect(one).toBeLessThan(baseline)
    expect(many).toBeLessThan(one)
    expect(baseline - many).toBeLessThanOrEqual(0.15)
    expect(many).toBeGreaterThanOrEqual(0)
  })

  it('preserves observed delivery success and explains reports separately', () => {
    expect(toolSelectionReasons({ ...evidence, reportedByBuyers30d: 2 })).toEqual([
      '90% of 10 calls succeeded', '2 buyers reported an answer this month',
    ])
  })
})
