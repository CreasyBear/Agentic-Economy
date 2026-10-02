/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { treasuryTestView } from './treasury-test-fixture'
const mocks = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('../actions/useAdminCommandProof', () => ({ useAdminCommandProof: () => mocks.execute }))
import { useTreasuryActions } from './useTreasuryActions'

afterEach(() => { cleanup(); mocks.execute.mockReset() })
const completed = (action: string) => ({ kind: 'completed', action, code: action === 'set_payments_paused' ? 'payments_paused' : 'treasury_thresholds_changed', effectRefs: [], auditEventRef: 'audit:test', correlationId: 'correlation:test' })

describe('treasury command interactions', () => {
  it('recovers unknown results with the identical reviewed command despite reactive changes', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('lost_response')).mockResolvedValueOnce(completed('set_payments_paused'))
    const view = treasuryTestView()
    const { result, rerender } = renderHook(({ value }) => useTreasuryActions(value), { initialProps: { value: view } })
    act(() => result.current.open('pause'))
    await act(async () => { await result.current.submit() })
    expect(result.current.unknown).toBe(true)
    const sent = mocks.execute.mock.calls[0]![0]
    rerender({ value: { ...view, controls: { ...view.controls, launchStateDigest: 'launch:2', paymentsOpenTo: 'none' } } })
    act(() => result.current.open('thresholds'))
    expect(result.current.action).toBe('pause')
    await act(async () => { await result.current.submit() })
    expect(mocks.execute.mock.calls[1]![0]).toBe(sent)
    expect(result.current.receipt?.kind).toBe('completed')
  })
  it('retains threshold input and key through MFA cancellation, then clears only after completion', async () => {
    mocks.execute.mockRejectedValueOnce({ code: 'reverification_cancelled', clerkRuntimeError: true }).mockResolvedValueOnce(completed('change_treasury_thresholds'))
    const { result } = renderHook(() => useTreasuryActions(treasuryTestView()))
    act(() => { result.current.open('thresholds'); result.current.edit('lowWater', '0.000001'); result.current.edit('target', '2') })
    await act(async () => { await result.current.submit() })
    const sent = mocks.execute.mock.calls[0]![0]
    expect(result.current.lowWater).toBe('0.000001')
    expect(result.current.unknown).toBe(false)
    await act(async () => { await result.current.submit() })
    expect(mocks.execute.mock.calls[1]![0]).toBe(sent)
    expect(sent.input).toEqual({ environment: 'sandbox', lowWaterUnits: '1', targetFloatUnits: '2000000' })
    expect(result.current.lowWater).toBe('')
  })
  it('requires explicit fresh review after target_changed and preserves the edit', async () => {
    mocks.execute.mockResolvedValueOnce({ kind: 'refused', action: 'change_treasury_thresholds', code: 'target_changed', correlationId: 'correlation:test' }).mockResolvedValueOnce(completed('change_treasury_thresholds'))
    const view = treasuryTestView()
    const { result, rerender } = renderHook(({ value }) => useTreasuryActions(value), { initialProps: { value: view } })
    act(() => { result.current.open('thresholds'); result.current.edit('lowWater', '1'); result.current.edit('target', '2') })
    await act(async () => { await result.current.submit() })
    const sent = mocks.execute.mock.calls[0]![0]
    rerender({ value: { ...view, controls: { ...view.controls, settingsStateDigest: 'settings:2' } } })
    await act(async () => { await result.current.submit() })
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    act(() => result.current.reviewCurrent())
    expect(result.current.target).toBe('2')
    await act(async () => { await result.current.submit() })
    expect(mocks.execute.mock.calls[1]![0]).toMatchObject({ expectedStateDigest: 'settings:2' })
    expect(mocks.execute.mock.calls[1]![0].operationKey).not.toBe(sent.operationKey)
  })
  it('proposes resume to the saved audience and does not claim completion', async () => {
    mocks.execute.mockResolvedValue({ kind: 'proposed', action: 'set_payments_paused', proposalRef: 'proposal:test', expiresAt: 1, correlationId: 'correlation:test' })
    const view = treasuryTestView()
    view.controls = { ...view.controls, paymentsOpenTo: 'none', resumePaymentsOpenTo: 'admins', resumeRequiresApproval: true }
    const { result } = renderHook(() => useTreasuryActions(view))
    act(() => result.current.open('resume'))
    await act(async () => { await result.current.submit() })
    expect(mocks.execute.mock.calls[0]![0]).toMatchObject({ approval: { kind: 'propose' }, input: { paused: false }, expectedStateDigest: 'launch:1' })
    expect(result.current.review.resumePaymentsOpenTo).toBe('admins')
    expect(result.current.receipt?.kind).toBe('proposed')
  })
  it('prevents duplicate submits and denies non-owner changes', async () => {
    const view = treasuryTestView()
    view.controls.canManage = false
    const { result } = renderHook(() => useTreasuryActions(view))
    act(() => result.current.open('pause'))
    await act(async () => { await result.current.submit() })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('never rekeys a lost response after retrying a known refusal that required a new key', async () => {
    mocks.execute.mockResolvedValueOnce({ kind: 'refused', action: 'change_treasury_thresholds', code: 'stale_source_write_admission', correlationId: 'correlation:test' })
      .mockRejectedValueOnce(new Error('lost_response_after_commit'))
      .mockResolvedValueOnce(completed('change_treasury_thresholds'))
    const { result } = renderHook(() => useTreasuryActions(treasuryTestView()))
    act(() => { result.current.open('thresholds'); result.current.edit('lowWater', '1'); result.current.edit('target', '2') })
    await act(async () => { await result.current.submit() })
    const refusedRequest = mocks.execute.mock.calls[0]![0]
    await act(async () => { result.current.retry() })
    await waitFor(() => expect(result.current.unknown).toBe(true))
    const uncertainRequest = mocks.execute.mock.calls[1]![0]
    expect(uncertainRequest.operationKey).not.toBe(refusedRequest.operationKey)
    expect(result.current.receipt).toBeNull()
    await act(async () => { result.current.retry() })
    await waitFor(() => expect(result.current.receipt?.kind).toBe('completed'))
    expect(mocks.execute.mock.calls[2]![0]).toBe(uncertainRequest)
  })
  it('keeps an earlier outcome uncertain when MFA cancellation interrupts receipt recovery', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('lost_response_after_commit'))
      .mockRejectedValueOnce({ code: 'reverification_cancelled', clerkRuntimeError: true })
      .mockResolvedValueOnce(completed('set_payments_paused'))
    const { result } = renderHook(() => useTreasuryActions(treasuryTestView()))
    act(() => result.current.open('pause'))
    await act(async () => { await result.current.submit() })
    const uncertainRequest = mocks.execute.mock.calls[0]![0]
    await act(async () => { result.current.retry() })
    expect(result.current.unresolved).toBe(true)
    act(() => result.current.open('thresholds'))
    expect(result.current.action).toBe('pause')
    await act(async () => { result.current.retry() })
    await waitFor(() => expect(result.current.receipt?.kind).toBe('completed'))
    expect(mocks.execute.mock.calls.map(call => call[0])).toEqual([uncertainRequest, uncertainRequest, uncertainRequest])
  })
})
