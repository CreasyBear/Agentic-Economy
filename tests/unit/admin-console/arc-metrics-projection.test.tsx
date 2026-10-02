// @vitest-environment jsdom
import { renderHook, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarketplaceMetricsReport } from '@/lib/operator/admin-console/metrics.contracts'

const source = vi.hoisted(() => ({ report: undefined as unknown }))
vi.mock('convex/react', () => ({ useQuery: () => source.report }))
import { useAdminMetrics } from '@/components/ae/admin/metrics/useAdminMetrics'

const day = {
  day: '2026-10-01', computedAt: 1, version: 1 as const, complete: true,
  settledCallValue: null, money: 'no_settled_usage' as const,
  settledCalls: 0, attemptedCalls: 1234, completedCalls: 1200, uncertainCalls: 3,
  uncertainCallsOpenAtClose: 3, quotesCreated: 1500, quotesConvertedAtClose: 1234,
  transactingWorkspaces: 2, transactingAgents: 2, transactingProviders: 2,
  transactingTools: 2, returningWorkspaces: 0, newTransactingWorkspaces: 2,
  newTransactingProviders: 2, terminalCalls: 1200, terminalCallsWithResolution: 1200,
}
const report: MarketplaceMetricsReport = {
  days: [day], coverageComplete: false, partialDays: ['2026-09-30'], latestDay: day.day,
  headline: null, ratios: null, wow: null,
}
afterEach(() => { cleanup(); source.report = undefined })

describe('Arc metrics receives authoritative Call counts', () => {
  it('keeps partial daily counts exact while withholding incomplete totals and ratios', () => {
    source.report = report
    const { result } = renderHook(() => useAdminMetrics('last_7'))
    expect(result.current).toMatchObject({
      kind: 'ready', coverageComplete: false, cards: [], ratios: [],
      dailyCalls: [{ day: day.day, attemptedCalls: 1234, completedCalls: 1200, uncertainCalls: 3 }],
      partialDays: ['2026-09-30'],
    })
    expect(result.current.kind === 'ready' && result.current.days[0]?.attemptedCalls).toBe('1,234')
    expect(day.attemptedCalls).toBe(1234)
  })

  it('never manufactures a series for loading or refused reads', () => {
    const { result, rerender } = renderHook(() => useAdminMetrics('last_7'))
    expect(result.current).toEqual({ kind: 'loading' })
    source.report = { kind: 'refused', code: 'missing_membership' }
    rerender()
    expect(result.current).toEqual({ kind: 'refused' })
  })
})
