export type CategoryStatRow = { category: string; payersOrder?: number; popularOrder?: number }

export type CategoryStat = {
  category: string
  label: string
  toolCount: number
  documentedPayers: number
  totalCalls: number
  totalPayers: number
  top3Share: number
  hhi: number
}

function reportedCount(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/**
 * Category concentration over a FULL generation of '*' search rows. A tool is
 * "documented" when payers30d is a safe non-negative integer; calls and payer
 * totals accumulate only over documented rows. HHI = Σ(callsᵢ/totalCalls)² and
 * top3Share = top-3 calls / totalCalls, both 0 when totalCalls is 0. Sorted by
 * toolCount desc (category asc as a deterministic tiebreak).
 */
export function categoryConcentration(rows: readonly CategoryStatRow[]): CategoryStat[] {
  const categories = new Map<string, { toolCount: number; documentedPayers: number; totalCalls: number; totalPayers: number; calls: number[] }>()
  for (const row of rows) {
    const acc = categories.get(row.category) ?? { toolCount: 0, documentedPayers: 0, totalCalls: 0, totalPayers: 0, calls: [] }
    acc.toolCount += 1
    const payers = reportedCount(row.payersOrder)
    if (payers !== undefined) {
      acc.documentedPayers += 1
      acc.totalPayers += payers
      const calls = reportedCount(row.popularOrder)
      if (calls !== undefined) { acc.calls.push(calls); acc.totalCalls += calls }
    }
    categories.set(row.category, acc)
  }
  const stats: CategoryStat[] = []
  for (const [category, acc] of categories) {
    // Three running maximum slots avoid sorting the full call list.
    const top3 = [0, 0, 0]
    for (let calls of acc.calls) {
      for (let slot = 0; slot < top3.length; slot += 1) {
        const current = top3[slot] ?? 0
        if (calls > current) { top3[slot] = calls; calls = current }
      }
    }
    const top3Calls = (top3[0] ?? 0) + (top3[1] ?? 0) + (top3[2] ?? 0)
    stats.push({
      category, label: category, toolCount: acc.toolCount, documentedPayers: acc.documentedPayers,
      totalCalls: acc.totalCalls, totalPayers: acc.totalPayers,
      top3Share: acc.totalCalls > 0 ? top3Calls / acc.totalCalls : 0,
      hhi: acc.totalCalls > 0 ? acc.calls.reduce((sum, calls) => sum + (calls / acc.totalCalls) ** 2, 0) : 0,
    })
  }
  return stats.sort((a, b) => b.toolCount - a.toolCount || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0))
}
