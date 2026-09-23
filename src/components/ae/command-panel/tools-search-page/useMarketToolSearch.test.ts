// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ToolChoiceSearchResult } from '../market-tools-client'

import { TOOLS_SEARCH_DEBOUNCE_MS } from './tools-search-page.contracts'
import { useMarketToolSearch } from './useMarketToolSearch'

const okPayload = (): ToolChoiceSearchResult => ({
  kind: 'ok',
  schemaVersion: 'registry-tools:v3',
  query: 'alpha',
  count: 1,
  items: [
    {
      toolRef: 'operation:v1:' + 'a'.repeat(64),
      capabilityId: 'cap.one',
      title: 'Alpha Tool',
      description: 'desc',
      provider: { name: 'Prov', slug: 'prov' },
      priceLabel: '$1.00',
      healthStatus: 'operational',
      listingTier: 'reviewed',
    },
  ],
  pagination: { limit: 12, hasMore: false },
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useMarketToolSearch', () => {
  it('stays idle for an empty query without scheduling search', () => {
    vi.useFakeTimers()
    const searchTools = vi.fn()
    const { result } = renderHook(() =>
      useMarketToolSearch({ query: '   ', searchAttempt: 0, searchTools }),
    )
    expect(result.current.status).toEqual({ kind: 'idle' })
    act(() => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS + 1)
    })
    expect(searchTools).not.toHaveBeenCalled()
  })

  it('does not search before the debounce boundary', () => {
    vi.useFakeTimers()
    const searchTools = vi.fn(async () => okPayload())
    const { result } = renderHook(() =>
      useMarketToolSearch({ query: 'alpha', searchAttempt: 0, searchTools }),
    )
    expect(result.current.status).toEqual({ kind: 'loading', query: 'alpha' })
    act(() => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS - 1)
    })
    expect(searchTools).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(searchTools).toHaveBeenCalledTimes(1)
  })

  it('coalesces rapid keystrokes into one in-flight search', () => {
    vi.useFakeTimers()
    const searchTools = vi.fn(async () => okPayload())
    const { rerender } = renderHook(
      ({ query }) => useMarketToolSearch({ query, searchAttempt: 0, searchTools }),
      { initialProps: { query: 'a' } },
    )
    act(() => {
      vi.advanceTimersByTime(50)
    })
    rerender({ query: 'al' })
    act(() => {
      vi.advanceTimersByTime(50)
    })
    rerender({ query: 'alpha' })
    act(() => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
    })
    expect(searchTools).toHaveBeenCalledTimes(1)
    expect(searchTools).toHaveBeenCalledWith({ query: 'alpha', limit: 12 })
  })

  it('ignores stale responses when a newer query wins the race', async () => {
    vi.useFakeTimers()
    let resolveFirst: ((value: ToolChoiceSearchResult) => void) | undefined
    let resolveSecond: ((value: ToolChoiceSearchResult) => void) | undefined
    const first = new Promise<ToolChoiceSearchResult>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<ToolChoiceSearchResult>((resolve) => {
      resolveSecond = resolve
    })
    const searchTools = vi.fn(async (input: { query: string }) =>
      input.query === 'first' ? await first : await second,
    )
    const { result, rerender } = renderHook(
      ({ query }) => useMarketToolSearch({ query, searchAttempt: 0, searchTools }),
      { initialProps: { query: 'first' } },
    )
    act(() => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
    })
    rerender({ query: 'second' })
    act(() => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
    })
    await act(async () => {
      resolveSecond?.(okPayload())
      await Promise.resolve()
    })
    expect(result.current.status.kind).toBe('success')
    const stalePayload = okPayload()
    if (stalePayload.kind !== 'ok') throw new Error('fixture_expected_ok')
    const staleItem = stalePayload.items[0]
    if (staleItem === undefined) throw new Error('fixture_missing_item')
    await act(async () => {
      resolveFirst?.({
        ...stalePayload,
        query: 'first',
        items: [{ ...staleItem, title: 'Stale Tool' }],
      })
      await Promise.resolve()
    })
    if (result.current.status.kind === 'success') {
      expect(result.current.status.items[0]?.title).toBe('Alpha Tool')
    }
  })

  it('maps unavailable results to recovery errors', async () => {
    vi.useFakeTimers()
    const searchTools = vi.fn(async () => ({
      kind: 'unavailable' as const,
      schemaVersion: 'registry-tools:v3' as const,
      reason: 'source_unavailable' as const,
    }))
    const { result } = renderHook(() =>
      useMarketToolSearch({ query: 'alpha', searchAttempt: 0, searchTools }),
    )
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.status).toMatchObject({
      kind: 'error',
      tone: 'recovery',
    })
  })

  it('maps parse failures to alert errors with the unreadable copy', async () => {
    vi.useFakeTimers()
    const searchTools = vi.fn(async () => {
      throw new Error('catalog_search_result_invalid')
    })
    const { result } = renderHook(() =>
      useMarketToolSearch({ query: 'alpha', searchAttempt: 0, searchTools }),
    )
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.status).toEqual({
      kind: 'error',
      query: 'alpha',
      tone: 'alert',
      message: 'The catalog returned something unreadable. Try again.',
    })
  })

  it('maps transport failures to alert errors with the unavailable copy', async () => {
    vi.useFakeTimers()
    const searchTools = vi.fn(async () => {
      throw new Error('catalog_search_unavailable')
    })
    const { result } = renderHook(() =>
      useMarketToolSearch({ query: 'alpha', searchAttempt: 0, searchTools }),
    )
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.status).toEqual({
      kind: 'error',
      query: 'alpha',
      tone: 'alert',
      message: 'The catalog is temporarily unavailable. Try again.',
    })
  })

  it('retries when searchAttempt increments', async () => {
    vi.useFakeTimers()
    const searchTools = vi.fn(async () => okPayload())
    const { rerender } = renderHook(
      ({ attempt }) => useMarketToolSearch({ query: 'alpha', searchAttempt: attempt, searchTools }),
      { initialProps: { attempt: 0 } },
    )
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(searchTools).toHaveBeenCalledTimes(1)
    rerender({ attempt: 1 })
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(searchTools).toHaveBeenCalledTimes(2)
  })
})
