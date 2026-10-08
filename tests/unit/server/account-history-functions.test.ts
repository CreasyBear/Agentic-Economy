import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const source = vi.hoisted(() => ({ action: vi.fn(), query: vi.fn(), createTransport: vi.fn(), requestController: new AbortController() }))
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => ({ signal: source.requestController.signal }) }))
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
  createAuthenticatedSourceTransport: source.createTransport,
}))

import { SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import { readOwnerAccountHistoryServer, readOwnerCallsServer, readOwnerSpendServer, readOwnerUsageServer } from '@/lib/server/call-history.functions'

beforeEach(() => {
  source.requestController = new AbortController()
  source.createTransport.mockResolvedValue({ query: source.query, action: source.action })
})
afterEach(() => { source.action.mockReset(); source.query.mockReset(); source.createTransport.mockReset(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('owner Account history server boundary', () => {
  it('bounds a continuation source that ignores cancellation using a request-local transport', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Continuation source deadline.', 'TimeoutError')), ms)
      return controller.signal
    })
    source.query.mockReturnValue(new Promise(() => {}))
    const pending = readOwnerCallsServer({ data: { cursor: 'original-cursor' } })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(SOURCE_READ_TIMEOUT_MS)
    await rejected
    expect(source.createTransport).toHaveBeenCalledOnce()
    expect(source.createTransport.mock.calls[0]?.[0].signal.aborted).toBe(true)
    expect(source.query.mock.calls[0]?.[1]).toEqual({ paginationOpts: { numItems: 50, cursor: 'original-cursor' } })
    expect(source.query).toHaveBeenCalledOnce()
    expect(source.action).not.toHaveBeenCalled()
  })

  it('cancels the auth wait and dispatches no continuation when credentials arrive late', async () => {
    let finish!: (transport: unknown) => void
    source.createTransport.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const pending = readOwnerCallsServer({ data: { cursor: 'original-cursor' } })
    source.requestController.abort(new DOMException('Request cancelled.', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(source.createTransport.mock.calls[0]?.[0].signal.aborted).toBe(true)
    finish({ query: source.query, action: source.action })
    await Promise.resolve()
    expect(source.query).not.toHaveBeenCalled()
    expect(source.action).not.toHaveBeenCalled()
  })

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
