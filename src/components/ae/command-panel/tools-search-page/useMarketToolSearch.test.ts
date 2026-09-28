// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ToolChoiceSearchResult } from '../market-tools-client'
import { isPublicToolRef } from '@/modules/capability-supply/public'

import { TOOLS_SEARCH_DEBOUNCE_MS } from './tools-search-page.contracts'
import { useMarketToolSearch } from './useMarketToolSearch'

const alphaRef = `operation:v1:${'a'.repeat(64)}`
if (!isPublicToolRef(alphaRef)) throw new Error('test_tool_ref_invalid')

const okPayload = (): ToolChoiceSearchResult => ({
  kind: 'match',
  schemaVersion: 'registry-tools:v3',
  query: 'alpha',
  partialResults: false,
  assessed: { source: 'all', scope: 'complete', examined: 1, coverage: 'complete' },
  results: [{
    id: alphaRef,
    source: 'current',
    access: 'ae_callable',
    toolRef: alphaRef,
    title: 'Alpha Tool',
    summary: 'desc',
    provider: 'Prov',
    actionClass: 'retrieve',
    objectClass: 'data',
    readiness: 'ready',
    price: { kind: 'indicative', label: 'A$1.00' },
    detailRef: alphaRef,
    next: [{ action: 'describe', args: { toolRef: alphaRef }, authority: 'public' }],
  }],
  next: [{ action: 'broaden', authority: 'public', args: { query: 'alpha' } }],
  pagination: { limit: 8, hasMore: false },
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
    expect(searchTools).toHaveBeenCalledWith({ query: 'alpha', limit: 8 })
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
    if (stalePayload.kind !== 'match') throw new Error('fixture_expected_match')
    const staleItem = stalePayload.results[0]
    if (staleItem === undefined) throw new Error('fixture_expected_result')
    await act(async () => {
      resolveFirst?.({
        ...stalePayload,
        query: 'first',
        results: [{ ...staleItem, title: 'Stale Tool' }],
      })
      await Promise.resolve()
    })
    if (result.current.status.kind === 'success') {
      expect(result.current.status.items[0]?.title).toBe('Alpha Tool')
    }
  })

  it('maps unavailable results to recovery errors', async () => {
    vi.useFakeTimers()
    const searchTools = vi.fn(async (): Promise<ToolChoiceSearchResult> => ({
      kind: 'unavailable', schemaVersion: 'registry-tools:v3', query: 'alpha', reason: 'source_unavailable',
      results: [], partialResults: false, assessed: { source: 'all', scope: 'page', examined: 0, coverage: 'partial' },
      pagination: { limit: 8, hasMore: false }, next: [{ action: 'retry', authority: 'public', args: { query: 'alpha' } }],
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

  it('renders exhausted no-match without selectable results', async () => {
    vi.useFakeTimers()
    const matched = okPayload()
    if (matched.kind !== 'match') throw new Error('fixture_expected_match')
    const searchTools = vi.fn(async (): Promise<ToolChoiceSearchResult> => ({
      kind: 'noMatch', schemaVersion: matched.schemaVersion, query: 'AUD USD exchange rate',
      reason: 'No suitable Tools found in the assessed sources.',
      results: [], assessed: { source: 'all', scope: 'complete', examined: 1, coverage: 'complete' },
      partialResults: false, pagination: matched.pagination, next: matched.next,
    }))
    const { result } = renderHook(() => useMarketToolSearch({ query: 'AUD USD exchange rate', searchAttempt: 0, searchTools }))
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.status).toMatchObject({
      kind: 'empty', count: 0, message: expect.stringContaining('No suitable Tools found in the assessed sources'),
    })
  })

  it('keeps scoped supply distinct from no-match and routes external listings to exact detail', async () => {
    vi.useFakeTimers()
    const matched = okPayload()
    if (matched.kind !== 'match') throw new Error('fixture_expected_match')
    const first = matched.results[0]
    if (first === undefined) throw new Error('fixture_expected_result')
    const searchTools = vi.fn(async (): Promise<ToolChoiceSearchResult> => ({
      ...matched,
      kind: 'scoped',
      reason: 'Unassessed supply remains.',
      assessed: { source: 'all', scope: 'page', examined: 2, coverage: 'partial' },
      results: [
        first,
        {
          id: 'opaque-1', source: 'coinbase', access: 'external_listing',
          title: 'External Tool', summary: 'External lookup', provider: 'Outside',
          actionClass: 'retrieve', objectClass: 'data', readiness: 'unverified',
          price: { kind: 'indicative', label: 'USDC 0.000001' }, detailRef: '/api/v1/registry/detail?id=opaque-1',
          next: [{ action: 'describe-external', authority: 'public', args: { id: 'opaque-1' } }],
        },
      ],
    }))
    const { result } = renderHook(() =>
      useMarketToolSearch({ query: 'alpha', searchAttempt: 0, searchTools }),
    )
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.status).toMatchObject({
      kind: 'success',
      scopeLabel: expect.stringContaining('other supply may exist'),
      items: [
        { toolRef: alphaRef, sourceKind: 'admitted', priceLabel: 'A$1.00' },
        {
          toolRef: '/api/v1/registry/detail?id=opaque-1',
          sourceKind: 'directory',
          healthLabel: 'External listing, not callable through AE',
          priceLabel: 'AUD estimate temporarily unavailable',
        },
      ],
    })
  })

  it('shows an unassessed empty page as scoped rather than exhausted', async () => {
    vi.useFakeTimers()
    const matched = okPayload()
    if (matched.kind !== 'match') throw new Error('fixture_expected_match')
    const searchTools = vi.fn(async (): Promise<ToolChoiceSearchResult> => ({
      ...matched,
      kind: 'scoped',
      reason: 'Unassessed supply remains.',
      results: [],
      assessed: { source: 'coinbase', scope: 'page', examined: 8, coverage: 'partial' },
    }))
    const { result } = renderHook(() =>
      useMarketToolSearch({ query: 'alpha', searchAttempt: 0, searchTools }),
    )
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.status).toMatchObject({
      kind: 'empty',
      message: expect.stringContaining('more supply may exist'),
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
