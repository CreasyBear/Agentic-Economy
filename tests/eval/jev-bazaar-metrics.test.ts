import { describe, expect, it } from 'vitest'
import { rankingMetrics } from '../../tools/dev/eval-jev-bazaar'

describe('paired Bazaar relevance metrics', () => {
  it('uses the same candidate pool for ideal ranking and counts only direct fits as top-one success', () => {
    expect(rankingMetrics([2, 1, 0])).toEqual({ top1: 1, reciprocalRank: 1, ndcg5: 1, directFits: 1 })
    expect(rankingMetrics([1, 0, 2])).toMatchObject({ top1: 0, reciprocalRank: 1 / 3, directFits: 1 })
    expect(rankingMetrics([1, 0, 2]).ndcg5).toBeLessThan(1)
  })
  it('does not confuse missing relevant supply with ranking failure', () => {
    expect(rankingMetrics([])).toEqual({ top1: null, reciprocalRank: null, ndcg5: null, directFits: 0 })
    expect(rankingMetrics([0, 0])).toEqual({ top1: null, reciprocalRank: null, ndcg5: null, directFits: 0 })
    expect(rankingMetrics([1, 0])).toMatchObject({ top1: null, reciprocalRank: null, ndcg5: 1 })
  })
  it('rejects invalid labels', () => {
    for (const grade of [-1, 3, 0.5, Number.NaN]) expect(() => rankingMetrics([grade])).toThrow('invalid_relevance_grade')
  })
})
