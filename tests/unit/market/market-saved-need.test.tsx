// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarketSavedNeed } from '@/components/ae/market/useMarketSavedNeed'

const api = vi.hoisted(() => ({ find: vi.fn(), status: vi.fn(), record: vi.fn(), withdraw: vi.fn() }))
vi.mock('@/modules/market-demand/market-demand.functions', () => ({ findOwnerActiveMarketDemand: api.find, getOwnerMarketDemandStatus: api.status, recordOwnerMarketDemand: api.record, withdrawOwnerMarketDemand: api.withdraw }))
const input = { query: 'weather', filters: { provider: 'example.test' } }
const record = { kind: 'open' as const, requestRef: 'request-weather', query: 'weather', createdAt: 1, matchedCount: 0 }
beforeEach(() => { vi.clearAllMocks(); api.find.mockResolvedValue({ kind: 'not_found' }); api.record.mockResolvedValue({ kind: 'recorded', requestRef: record.requestRef, query: input.query, createdAt: 1 }); api.status.mockResolvedValue(record); api.withdraw.mockResolvedValue({ kind: 'withdrawn', requestRef: record.requestRef }) })
afterEach(cleanup)

describe('durable Market saved need', () => {
  it('uses exact filters, retains request reference, and withdraws the same need', async () => {
    const { result } = renderHook(() => useMarketSavedNeed(input, 'alice'))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(api.find).toHaveBeenCalledWith({ data: input })
    await act(() => result.current.save())
    expect(api.record).toHaveBeenCalledWith({ data: { ...input, idempotencyKey: expect.any(String) } })
    expect(result.current.record?.requestRef).toBe(record.requestRef)
    await act(() => result.current.withdraw())
    expect(api.withdraw).toHaveBeenCalledWith({ data: { requestRef: record.requestRef } })
    expect(result.current.record).toBeUndefined()
    expect(result.current.withdrawn).toBe(true)
  })
  it('does not write when current status could not be checked', async () => {
    api.find.mockResolvedValue({ kind: 'error', code: 'invalid_request' })
    const { result } = renderHook(() => useMarketSavedNeed(input, 'alice'))
    await waitFor(() => expect(result.current.error).toBeDefined())
    await act(() => result.current.save())
    expect(api.record).not.toHaveBeenCalled()
  })
  it('never exposes or acts on the previous owner or query after an in-flight lookup', async () => {
    let resolve!: (value: unknown) => void
    api.find.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const { result, rerender } = renderHook(({ owner, query }) => useMarketSavedNeed({ ...input, query }, owner), { initialProps: { owner: 'alice', query: 'weather' } })
    rerender({ owner: 'bob', query: 'document' })
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    await act(async () => { resolve({ kind: 'found', request: { requestRef: 'private-alice', query: 'weather', createdAt: 1 } }) })
    expect(result.current.record).toBeUndefined()
    expect(api.status).not.toHaveBeenCalled()
  })
  it('keeps a confirmed reference when status is unavailable and withdraws that exact need', async () => {
    api.status.mockResolvedValue({ kind: 'error', code: 'source_unavailable' })
    const { result } = renderHook(() => useMarketSavedNeed(input, 'alice'))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    await act(() => result.current.save())
    expect(result.current.requestRef).toBe(record.requestRef)
    expect(result.current.error).toContain('status is unavailable')
    await act(() => result.current.save())
    expect(api.record).toHaveBeenCalledTimes(1)
    await act(() => result.current.withdraw())
    expect(api.withdraw).toHaveBeenCalledWith({ data: { requestRef: record.requestRef } })
    expect(result.current.requestRef).toBeUndefined()
  })
  it('retains the idempotency key after a lost save response', async () => {
    api.record.mockRejectedValueOnce(new Error('lost response'))
    const { result } = renderHook(() => useMarketSavedNeed(input, 'alice'))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    await act(() => result.current.save())
    const first = api.record.mock.calls[0]?.[0].data.idempotencyKey
    await act(() => result.current.lookup())
    await act(() => result.current.save())
    expect(api.record.mock.calls[1]?.[0].data.idempotencyKey).toBe(first)
  })
})
