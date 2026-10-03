import { afterEach, describe, expect, it, vi } from 'vitest'

const source = vi.hoisted(() => ({ action: vi.fn(), query: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (validate: (value: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => Promise<unknown>) =>
        async (input: { data?: unknown } = {}) => await handler({ data: validate(input.data) }),
    }),
  }),
}))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/convex-source')>()),
  callSourceAction: source.action,
  callSourceQuery: source.query,
}))

import { readOwnerAccountHistoryServer, readOwnerCallsServer, readOwnerSpendServer, readOwnerUsageServer } from '@/lib/server/call-history.functions'

afterEach(() => { source.action.mockReset(); source.query.mockReset() })

describe('owner Account history server boundary', () => {
  it('forwards an exact Agent and fixed range with the same 50-row cursor contract', async () => {
    source.query.mockResolvedValue({ page: [], isDone: true, continueCursor: '' })
    await readOwnerCallsServer({ data: { principalRef: 'principal:exact', periodStartAt: 100, periodEndAt: 200, cursor: 'opaque:next' } })
    expect(source.query.mock.calls[0]?.[1]).toEqual({ principalRef: 'principal:exact', periodStartAt: 100, periodEndAt: 200,
      paginationOpts: { numItems: 50, cursor: 'opaque:next' } })
    await expect(readOwnerCallsServer({ data: JSON.parse('{"periodStartAt":100}') })).rejects.toThrow()
    await expect(readOwnerCallsServer({ data: { periodStartAt: 200, periodEndAt: 100 } })).rejects.toThrow()
    await expect(readOwnerCallsServer({ data: JSON.parse('{"accountRef":"foreign"}') })).rejects.toThrow()
    expect(source.query).toHaveBeenCalledTimes(1)
    await readOwnerCallsServer({ data: { periodStartAt: 0, periodEndAt: 400 * 86_400_000 } })
    expect(source.query.mock.calls[1]?.[1]).toEqual({ periodStartAt: 0, periodEndAt: 400 * 86_400_000,
      paginationOpts: { numItems: 50, cursor: null } })
  })

  it('accepts bounded explicit ranges while preserving calendar month readers', async () => {
    source.query.mockResolvedValue({ kind: 'empty' })
    source.action.mockResolvedValue({ kind: 'empty' })
    await readOwnerUsageServer({ data: { dimensionKind: 'agent', dimensionRef: 'principal:exact', periodStartAt: 100, periodEndAt: 200 } })
    expect(source.query.mock.calls[0]?.[1]).toEqual({ dimensionKind: 'agent', dimensionRef: 'principal:exact', periodStartAt: 100, periodEndAt: 200 })
    await readOwnerSpendServer({ data: { dimensionKind: 'account', periodStartAt: 100, periodEndAt: 200 } })
    expect(source.action.mock.calls[0]?.[1]).toEqual({ periodStartAt: 100, periodEndAt: 200 })
    await readOwnerUsageServer({ data: { dimensionKind: 'account', periodKind: 'month', periodStart: '2026-09' } })
    expect(source.query.mock.calls[1]?.[1]).toEqual({ dimensionKind: 'account', periodStartAt: Date.UTC(2026, 8, 1), periodEndAt: Date.UTC(2026, 9, 1) })
    await expect(readOwnerUsageServer({ data: { dimensionKind: 'account', periodStartAt: 0, periodEndAt: 367 * 86_400_000 } })).rejects.toThrow()
    expect(source.query).toHaveBeenCalledTimes(2)
  })

  it('rejects inconsistent counts before a presentation can calculate a negative refused count', async () => {
    source.query.mockResolvedValue({ kind: 'available', dimensionKind: 'account', dimensionRef: 'account:owner',
      periodStartAt: 100, periodEndAt: 200, callCountUnits: '1', completedCountUnits: '2', outcomeUnknownCountUnits: '0',
      updatedAt: 150, source: 'convex_call_evidence' })
    await expect(readOwnerUsageServer({ data: { dimensionKind: 'account', periodStartAt: 100, periodEndAt: 200 } }))
      .rejects.toThrow('usage_counts_inconsistent')
  })

  it('preserves source unavailability and forwards only a bounded cursor', async () => {
    source.action.mockResolvedValue({ kind: 'unavailable', code: 'formance_read_unavailable' })
    await expect(readOwnerAccountHistoryServer({ data: { cursor: 'signed:cursor' } }))
      .resolves.toEqual({ kind: 'unavailable', code: 'formance_read_unavailable' })
    expect(source.action.mock.calls[0]?.[1]).toEqual({ cursor: 'signed:cursor' })
    await readOwnerAccountHistoryServer({ data: {} })
    expect(source.action.mock.calls[1]?.[1]).toEqual({})
  })

  it('rejects unknown input fields and invalid money results at their respective boundary', async () => {
    const forged = JSON.parse('{"accountRef":"account:other"}')
    await expect(readOwnerAccountHistoryServer({ data: forged })).rejects.toThrow()
    await expect(readOwnerAccountHistoryServer({ data: { cursor: 'x'.repeat(4097) } })).rejects.toThrow()
    expect(source.action).not.toHaveBeenCalled()
    source.action.mockResolvedValue({ kind: 'available', entries: [], isDone: true })
    await expect(readOwnerAccountHistoryServer({ data: {} })).rejects.toThrow()
  })
})
