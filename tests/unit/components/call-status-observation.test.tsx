/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallStatusPageResult } from '@/lib/call-recovery/call-status-page-types'
const mocks = vi.hoisted(() => ({ read: vi.fn(), cancel: vi.fn(), reconcile: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))
vi.mock('@tanstack/react-start', async (importOriginal) => ({ ...await importOriginal(), useServerFn: (fn: unknown) => fn }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }))
vi.mock('@/modules/capability-execution/call-recovery.functions', () => ({ readOwnerCallStatusServer: mocks.read, cancelOwnerCallServer: mocks.cancel, reconcileOwnerCallServer: mocks.reconcile }))
import { useCallStatusRecovery } from '@/hooks/useCallStatusRecovery'
const pending: CallStatusPageResult = { kind: 'found', callRef: 'call:observe', toolRef: 'tool:one', state: 'in_progress', version: 1 }
const complete: CallStatusPageResult = { ...pending, state: 'terminal', version: 2 }
describe('Call status observation', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible') })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
  it('observes the same Call and stops after resolution, without executing recovery commands', async () => {
    mocks.read.mockResolvedValue(complete)
    const { result } = renderHook(() => useCallStatusRecovery(pending))
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.result).toEqual(complete)
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ data: { callRef: pending.callRef } })
    expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled()
  })
  it('retains useful status on an outage and recovers after backoff', async () => {
    mocks.read.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(complete)
    const { result } = renderHook(() => useCallStatusRecovery(pending))
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.result).toEqual(pending)
    expect(result.current.actions.feedback?.message).toMatch(/Updates are delayed/)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(result.current.result).toEqual(complete)
    expect(result.current.actions.feedback).toBeUndefined()
  })
  it('pauses hidden tabs and updates when visible; unmount cancels observation', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    mocks.read.mockResolvedValue(pending)
    const { unmount } = renderHook(() => useCallStatusRecovery(pending))
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(mocks.read).not.toHaveBeenCalled()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(mocks.read).toHaveBeenCalledOnce()
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(mocks.read).toHaveBeenCalledOnce()
  })
  it('does not overlap a slow read with a manual read or cancellation', async () => {
    let finish!: (value: CallStatusPageResult) => void
    mocks.read.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const authorized: CallStatusPageResult = { ...pending, state: 'authorized' }
    const { result } = renderHook(() => useCallStatusRecovery(authorized))
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    await act(async () => { await result.current.actions.onRefresh?.(); await result.current.actions.onCancel?.() })
    expect(result.current.actions.refreshPending).toBe(true)
    expect(mocks.read).toHaveBeenCalledOnce(); expect(mocks.cancel).not.toHaveBeenCalled()
    await act(async () => { finish(complete) })
    expect(result.current.result).toEqual(complete)
  })
})
