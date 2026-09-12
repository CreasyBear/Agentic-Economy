import { describe, expect, it } from 'vitest'

import { categoryConcentration } from './lib/x402DirectoryIndex/categoryStats'

describe('category concentration', () => {
  const row = (category: string, payersOrder: number | undefined, popularOrder: number) => ({
    category,
    label: category,
    popularOrder,
    ...(payersOrder === undefined ? {} : { payersOrder }),
  })

  it('computes exact totals, top-3 share and HHI on a hand-built 4-row fixture', () => {
    // payers 10/10/5/2, calls 100/50/25/5 -> totalCalls 180, totalPayers 27,
    // top3 = 175 -> top3Share = 175/180, HHI = (5/9)²+(5/18)²+(5/36)²+(1/36)².
    const stats = categoryConcentration([
      row('search', 10, 100), row('search', 10, 50), row('search', 5, 25), row('search', 2, 5),
      row('empty', 0, 0), row('empty', undefined, 12),
    ])
    expect(stats.map(stat => stat.category)).toEqual(['search', 'empty'])
    const search = stats[0]
    expect(search).toBeDefined()
    if (search === undefined) return
    expect(search.toolCount).toBe(4)
    expect(search.documentedPayers).toBe(4)
    expect(search.totalCalls).toBe(180)
    expect(search.totalPayers).toBe(27)
    expect(search.top3Share).toBeCloseTo(175 / 180, 12)
    expect(search.hhi).toBeCloseTo(13150 / 32400, 12)
    const empty = stats[1]
    expect(empty).toEqual({ category: 'empty', label: 'empty', toolCount: 2, documentedPayers: 1, totalCalls: 0, totalPayers: 0, top3Share: 0, hhi: 0 })
  })

  it('sorts by toolCount desc with a deterministic category tiebreak', () => {
    const stats = categoryConcentration([row('b', 1, 1), row('a', 1, 1), row('c', 1, 1), row('c', 1, 1)])
    expect(stats.map(stat => [stat.category, stat.toolCount])).toEqual([['c', 2], ['a', 1], ['b', 1]])
  })
})