/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallStatusPageResult } from '@/lib/call-recovery/call-status-page-types'
const mocks = vi.hoisted(() => ({ read: vi.fn(), cancel: vi.fn(), reconcile: vi.fn(), invalidate: vi.fn(), watch: vi.fn(), connection: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: mocks.watch, useConvexConnectionState: mocks.connection }))
vi.mock('../../../convex/_generated/api', () => ({ api: { capabilityCalls: { watchOwnerCallState: 'watchOwnerCallState' } } }))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))
vi.mock('@tanstack/react-start', async (importOriginal) => ({ ...await importOriginal(), useServerFn: (fn: unknown) => fn }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }))
vi.mock('@/modules/capability-execution/call-recovery.functions', () => ({ readOwnerCallStatusServer: mocks.read, cancelOwnerCallServer: mocks.cancel, reconcileOwnerCallServer: mocks.reconcile }))
import { useCallStatusRecovery } from '@/hooks/useCallStatusRecovery'
const pending: CallStatusPageResult = { kind: 'found', callRef: 'call:observe', toolRef: 'tool:one', state: 'in_progress', version: 1 }
const complete: CallStatusPageResult = { ...pending, state: 'terminal', version: 2 }
describe('Call status observation', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.invalidate.mockResolvedValue(undefined); mocks.connection.mockReturnValue({ isWebSocketConnected: true, hasEverConnected: true }); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible') })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
  it('re-reads the loader once when the reactive Call state changes, without any timer poll', async () => {
    mocks.watch.mockReturnValue({ state: 'pending', updatedAt: pending.kind === 'found' ? pending.version : 0 })
    const { rerender } = renderHook(() => useCallStatusRecovery(pending))
    mocks.watch.mockReturnValue({ state: 'completed', updatedAt: 2 })
    rerender()
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(mocks.invalidate).toHaveBeenCalledTimes(1)
    expect(mocks.read).toHaveBeenCalledTimes(0)
    expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled()
  })
  it('re-reads once when the first reactive value is already newer than the loaded status', () => {
    mocks.watch.mockReturnValue({ state: 'completed', updatedAt: 2 })
    const { rerender } = renderHook(() => useCallStatusRecovery(pending))
    rerender()
    expect(mocks.invalidate).toHaveBeenCalledTimes(1)
  })
  it('says live updates are paused while the Convex connection is down, and when a re-read fails', async () => {
    mocks.watch.mockReturnValue({ state: 'pending', updatedAt: 1 })
    mocks.connection.mockReturnValue({ isWebSocketConnected: false, hasEverConnected: true })
    const { result, rerender } = renderHook(() => useCallStatusRecovery(pending))
    expect(result.current.actions.feedback).toEqual({ kind: 'error', message: 'Live updates are paused. Your last recorded status is still shown.' })
    mocks.connection.mockReturnValue({ isWebSocketConnected: true, hasEverConnected: true })
    mocks.invalidate.mockRejectedValueOnce(new Error('loader offline'))
    mocks.watch.mockReturnValue({ state: 'completed', updatedAt: 2 })
    rerender()
    await act(async () => { await Promise.resolve() })
    expect(result.current.actions.feedback).toEqual({ kind: 'error', message: 'Live updates are paused. Your last recorded status is still shown.' })
  })
  it('subscribes only while the Call is observable', () => {
    mocks.watch.mockReturnValue(undefined)
    renderHook(() => useCallStatusRecovery(pending))
    expect(mocks.watch).toHaveBeenLastCalledWith(expect.anything(), { callRef: pending.callRef })
    cleanup()
    renderHook(() => useCallStatusRecovery(complete))
    expect(mocks.watch).toHaveBeenLastCalledWith(expect.anything(), 'skip')
  })
  it('does not overlap a slow read with a manual read or cancellation', async () => {
    let finish!: (value: CallStatusPageResult) => void
    mocks.read.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const authorized: CallStatusPageResult = { ...pending, state: 'authorized' }
    const { result } = renderHook(() => useCallStatusRecovery(authorized))
    await act(async () => { void result.current.actions.onRefresh?.(); await result.current.actions.onCancel?.() })
    expect(result.current.actions.refreshPending).toBe(true)
    expect(mocks.read).toHaveBeenCalledOnce(); expect(mocks.cancel).not.toHaveBeenCalled()
    await act(async () => { finish(complete) })
    expect(result.current.result).toEqual(complete)
  })
})
