/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BROWSER_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import { useAeActivity } from '@/components/ae/activity/useAeActivity'
import type { CallPage, CallRow } from '@/components/ae/activity/activity.contracts'
import type { UseAeActivityInput } from '@/components/ae/activity/useAeActivity'

const mocks = vi.hoisted(() => ({
  readOwnerCallsServer: vi.fn(),
  captureClientExceptionOnClient: vi.fn(),
  navigate: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: mocks.navigate, invalidate: mocks.invalidate }),
}))

vi.mock('@/lib/server/call-history.functions', () => ({
  readOwnerCallsServer: mocks.readOwnerCallsServer,
}))

vi.mock('@/lib/observability/capture-client-exception', () => ({
  captureClientExceptionOnClient: mocks.captureClientExceptionOnClient,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const periodStartAt = Date.UTC(2026, 9, 1)
const periodEndAt = Date.UTC(2026, 10, 1)

function callRow(callRef: string, overrides: Partial<CallRow> = {}): CallRow {
  return {
    callRef,
    accountRef: 'account:1',
    principalRef: 'agent:alpha',
    credentialRef: 'credential:1',
    applicationRef: 'application:1',
    toolRef: 'tool:1',
    providerRef: 'provider:1',
    toolLabel: 'Fixture Tool',
    state: 'completed',
    deliveryState: 'delivered',
    paymentState: 'settled',
    latencyMs: 142,
    audAmountUnits: '100000',
    createdAt: periodStartAt + 1_000,
    updatedAt: periodStartAt + 2_000,
    ...overrides,
  }
}

function callPage(rows: readonly CallRow[], continueCursor: string, isDone = false): CallPage {
  return { page: [...rows], continueCursor, isDone }
}

const initialCall = callRow('call:initial')
const { audAmountUnits: omittedNextAmount, ...nextCall } = callRow('call:next', {
  state: 'outcome_unknown',
  deliveryState: 'unknown',
  paymentState: 'unknown',
})
void omittedNextAmount
const finalCall = callRow('call:final', {
  state: 'refused',
  deliveryState: 'not_delivered',
  paymentState: 'released',
})

function input(initial = callPage([initialCall], 'cursor-1')): UseAeActivityInput {
  return {
    initial,
    usage: {
      kind: 'available',
      dimensionKind: 'account',
      dimensionRef: 'account:1',
      periodStartAt,
      periodEndAt,
      callCountUnits: '1',
      completedCountUnits: '1',
      outcomeUnknownCountUnits: '0',
      updatedAt: periodEndAt,
      source: 'convex_call_evidence',
    },
    spend: { kind: 'not_requested' },
    periodStart: '2026-10',
    periodStartAt,
    periodEndAt,
    dateRangeFilter: '30d',
    statusFilter: 'all',
    setStatusFilter: vi.fn(),
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('Activity pagination request continuity', () => {
  it('bounds an ignored continuation signal, preserves the exact cursor, and permits a manual retry', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Continuation deadline.', 'TimeoutError')), ms)
      return controller.signal
    })
    const obsolete = deferred<CallPage>()
    mocks.readOwnerCallsServer.mockReturnValueOnce(obsolete.promise).mockResolvedValueOnce(callPage([nextCall], '', true))
    const { result } = renderHook(() => useAeActivity(input()))
    let pending!: Promise<void>
    act(() => { pending = result.current.loadNextPage() })
    const signal = mocks.readOwnerCallsServer.mock.calls[0]?.[0].signal as AbortSignal
    await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_READ_TIMEOUT_MS); await pending })
    expect(signal.aborted).toBe(true)
    expect(result.current.pagination).toMatchObject({ items: [initialCall], cursor: 'cursor-1', status: 'failed' })
    expect(mocks.readOwnerCallsServer).toHaveBeenCalledOnce()
    await act(async () => { await result.current.loadNextPage() })
    expect(mocks.readOwnerCallsServer.mock.calls[1]?.[0].data).toEqual({ cursor: 'cursor-1', periodStartAt, periodEndAt })
    await act(async () => { obsolete.resolve(callPage([finalCall], '', true)); await obsolete.promise })
    expect(result.current.pagination.items.map(item => item.callRef)).toEqual(['call:initial', 'call:next'])
    expect(result.current.pagination.status).toBe('idle')
  })

  it('aborts a retired mounted scope and ignores its late completion while a fresh scope reads', async () => {
    const obsolete = deferred<CallPage>()
    const fresh = deferred<CallPage>()
    mocks.readOwnerCallsServer.mockReturnValueOnce(obsolete.promise).mockReturnValueOnce(fresh.promise)
    const old = renderHook(() => useAeActivity(input()))
    let pending!: Promise<void>
    act(() => { pending = old.result.current.loadNextPage() })
    const signal = mocks.readOwnerCallsServer.mock.calls[0]?.[0].signal as AbortSignal
    old.unmount()
    expect(signal.aborted).toBe(true)
    await pending
    expect(mocks.captureClientExceptionOnClient).not.toHaveBeenCalled()
    const current = renderHook(() => useAeActivity(input(callPage([finalCall], 'fresh-cursor'))))
    act(() => { void current.result.current.loadNextPage() })
    await act(async () => { obsolete.resolve(callPage([nextCall], '', true)); await obsolete.promise })
    expect(current.result.current.pagination).toMatchObject({ items: [finalCall], cursor: 'fresh-cursor', status: 'loading' })
    await act(async () => { fresh.resolve(callPage([initialCall], '', true)); await fresh.promise })
    expect(current.result.current.pagination.items.map(item => item.callRef)).toEqual(['call:final', 'call:initial'])
  })

  it('dispatches one read for same-turn activations, retains rows while pending, and continues with the returned cursor', async () => {
    const firstRead = deferred<CallPage>()
    const secondRead = deferred<CallPage>()
    mocks.readOwnerCallsServer
      .mockReturnValueOnce(firstRead.promise)
      .mockReturnValueOnce(secondRead.promise)

    const { result } = renderHook(() => useAeActivity(input()))

    act(() => {
      void result.current.loadNextPage()
      void result.current.loadNextPage()
    })

    expect(mocks.readOwnerCallsServer).toHaveBeenCalledTimes(1)
    expect(mocks.readOwnerCallsServer).toHaveBeenNthCalledWith(1, {
      data: { cursor: 'cursor-1', periodStartAt, periodEndAt }, signal: expect.any(AbortSignal),
    })
    expect(result.current.pagination).toMatchObject({
      items: [initialCall],
      cursor: 'cursor-1',
      status: 'loading',
    })

    await act(async () => {
      firstRead.resolve(callPage([nextCall, { ...initialCall, toolLabel: 'Duplicate Call' }], 'cursor-2'))
      await firstRead.promise
    })

    expect(result.current.pagination.items.map((item) => item.callRef)).toEqual(['call:initial', 'call:next'])
    expect(result.current.pagination.cursor).toBe('cursor-2')
    expect(result.current.pagination.status).toBe('idle')

    act(() => {
      void result.current.loadNextPage()
    })

    expect(mocks.readOwnerCallsServer).toHaveBeenCalledTimes(2)
    expect(mocks.readOwnerCallsServer).toHaveBeenNthCalledWith(2, {
      data: { cursor: 'cursor-2', periodStartAt, periodEndAt }, signal: expect.any(AbortSignal),
    })

    await act(async () => {
      secondRead.resolve(callPage([finalCall], '', true))
      await secondRead.promise
    })

    expect(result.current.pagination.items.map((item) => item.callRef)).toEqual([
      'call:initial',
      'call:next',
      'call:final',
    ])
    expect(result.current.pagination.cursor).toBeUndefined()
    expect(result.current.pagination.status).toBe('idle')
  })

  it('retains rows and cursor after rejection, then permits a deliberate retry', async () => {
    const failedRead = deferred<CallPage>()
    const retryPage = callPage([nextCall], '', true)
    const failure = new Error('Call history unavailable')
    mocks.readOwnerCallsServer
      .mockReturnValueOnce(failedRead.promise)
      .mockResolvedValueOnce(retryPage)

    const { result } = renderHook(() => useAeActivity(input()))

    act(() => {
      void result.current.loadNextPage()
    })

    expect(result.current.pagination).toMatchObject({
      items: [initialCall],
      cursor: 'cursor-1',
      status: 'loading',
    })

    await act(async () => {
      failedRead.reject(failure)
      await failedRead.promise.catch(() => undefined)
    })

    expect(mocks.captureClientExceptionOnClient).toHaveBeenCalledWith(failure)
    expect(result.current.pagination).toMatchObject({
      items: [initialCall],
      cursor: 'cursor-1',
      status: 'failed',
    })

    await act(async () => {
      await result.current.loadNextPage()
    })

    expect(mocks.readOwnerCallsServer).toHaveBeenCalledTimes(2)
    expect(mocks.readOwnerCallsServer).toHaveBeenNthCalledWith(2, {
      data: { cursor: 'cursor-1', periodStartAt, periodEndAt }, signal: expect.any(AbortSignal),
    })
    expect(result.current.pagination.items.map((item) => item.callRef)).toEqual([
      'call:initial',
      'call:next',
    ])
    expect(result.current.pagination.cursor).toBeUndefined()
    expect(result.current.pagination.status).toBe('idle')
  })
})
