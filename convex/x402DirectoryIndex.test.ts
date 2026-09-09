import { describe, expect, it } from 'vitest'

import { categoryConcentration } from './lib/x402DirectoryIndex/categoryStats'
import { directoryMomentum, momentumPatch } from './lib/x402DirectoryIndex/rows'

describe('directory momentum vs previous generation', () => {
  // Two-generation fixture: previous-gen '*' search rows vs current activity.
  it('marks never-compared resources unknown', () => {
    expect(directoryMomentum({ calls: 10, payers: 3 }, undefined)).toEqual({ momentumOrder: -1, momentumBand: 'unknown' })
  })
  it('marks resources whose previous row reported no payers as new', () => {
    const signal = directoryMomentum({ calls: 20, payers: 5 }, { payers: -1 })
    expect(signal).toEqual({ momentumOrder: -1, momentumBand: 'new' })
  })
  it('bands flat inside a ±1 payer delta and carries both deltas when known', () => {
    expect(directoryMomentum({ calls: 120, payers: 6 }, { calls: 119, payers: 5 })).toEqual({
      momentumOrder: 1, callDelta: 1, payerDelta: 1, momentumBand: 'flat',
    })
  })
  it('marks a >= 2 payer gain rising and a <= -2 payer loss falling', () => {
    expect(directoryMomentum({ calls: 130, payers: 6 }, { calls: 100, payers: 4 })).toEqual({ momentumOrder: 2, callDelta: 30, payerDelta: 2, momentumBand: 'rising' })
    expect(directoryMomentum({ calls: 40, payers: 2 }, { calls: 100, payers: 4 })).toEqual({ momentumOrder: -2, callDelta: -60, payerDelta: -2, momentumBand: 'falling' })
    expect(directoryMomentum({ payers: 0 }, { payers: 4 })).toEqual({ momentumOrder: -4, payerDelta: -4, momentumBand: 'falling' })
  })
  it('omits callDelta when either side has no reported calls', () => {
    expect(directoryMomentum({ payers: 6 }, { payers: 4 })).toEqual({ momentumOrder: 2, payerDelta: 2, momentumBand: 'rising' })
    expect(directoryMomentum({ payers: 5 }, { payers: 4 })).toEqual({ momentumOrder: 1, payerDelta: 1, momentumBand: 'flat' })
  })
  it('treats a current row without reported payers as unknown against a documented previous row', () => {
    expect(directoryMomentum({}, { payers: 4 })).toEqual({ momentumOrder: -1, momentumBand: 'unknown' })
  })
  it('patches omit undefined deltas and always carry an order', () => {
    expect(momentumPatch(directoryMomentum({ payers: 5 }, { payers: 3, calls: 10 }))).toEqual({ momentumOrder: 2, momentumBand: 'rising', payerDelta: 2 })
    expect(momentumPatch(directoryMomentum({ payers: 1 }, undefined))).toEqual({ momentumOrder: -1, momentumBand: 'unknown' })
  })
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