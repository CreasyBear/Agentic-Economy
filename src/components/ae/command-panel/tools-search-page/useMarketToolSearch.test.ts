// @vitest-environment jsdom

import { createElement } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ToolChoiceSearchResult } from '../market-tools-client'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import type * as MarketDemandFns from '@/modules/market-demand/market-demand.functions'

import { TOOLS_SEARCH_DEBOUNCE_MS } from './tools-search-page.contracts'
import { useMarketToolSearch } from './useMarketToolSearch'
import { ToolsSearchPage } from './ToolsSearchPage'

const owner = vi.hoisted(() => ({
  signedIn: true,
  record: vi.fn(),
  find: vi.fn(),
  status: vi.fn(),
  withdraw: vi.fn(),
}))
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ isSignedIn: owner.signedIn }) }))
vi.mock('@/modules/market-demand/market-demand.functions', async (loadOriginal) => ({
  ...await loadOriginal<typeof MarketDemandFns>(),
  recordOwnerMarketDemand: owner.record,
  findOwnerActiveMarketDemand: owner.find,
  getOwnerMarketDemandStatus: owner.status,
  withdrawOwnerMarketDemand: owner.withdraw,
}))
vi.mock('./components/ToolSearchStatus', () => ({ ToolSearchStatus: () => null }))

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
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  owner.signedIn = true
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

  it('offers the original search phrase for saving only after an exhaustive no-match', async () => {
    vi.useFakeTimers()
    const base = okPayload()
    if (base.kind !== 'match') throw new Error('fixture_expected_match')
    const searchTools = vi.fn(async (): Promise<ToolChoiceSearchResult> => ({
      ...base, kind: 'noMatch', query: 'find reliable FX', results: [],
      reason: 'No suitable Tools found.', next: [],
    }))
    const { result, rerender } = renderHook(
      ({ query }) => useMarketToolSearch({ query, searchAttempt: 0, searchTools }),
      { initialProps: { query: 'find reliable FX' } },
    )
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(searchTools).toHaveBeenCalledWith({ query: 'find reliable FX', limit: 8 })
    expect(result.current.saveNeed).toEqual({ query: 'find reliable FX' })

    rerender({ query: 'another need' })
    expect(result.current.saveNeed).toBeUndefined()
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.saveNeed).toBeUndefined()
  })

  it.each([
    { assessed: { source: 'all' as const, scope: 'page' as const, examined: 1, coverage: 'partial' as const } },
    { partialResults: true },
    { pagination: { limit: 8, hasMore: true } },
  ])('does not offer Save on incomplete no-match %#', async (override) => {
    vi.useFakeTimers()
    const base = okPayload()
    if (base.kind !== 'match') throw new Error('fixture_expected_match')
    const searchTools = vi.fn(async (): Promise<ToolChoiceSearchResult> => ({
      ...base, kind: 'noMatch', query: 'alpha', results: [], reason: 'Supply unassessed.', next: [],
      ...override,
    }))
    const { result } = renderHook(() => useMarketToolSearch({ query: 'alpha', searchAttempt: 0, searchTools }))
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.status).toMatchObject({ kind: 'empty', message: expect.stringContaining('not assessed every source') })
    expect(result.current.saveNeed).toBeUndefined()
  })

  it('preserves a valid 200-character search phrase without truncation', async () => {
    vi.useFakeTimers()
    const query = 'x'.repeat(200)
    const base = okPayload()
    if (base.kind !== 'match') throw new Error('fixture_expected_match')
    const searchTools = vi.fn(async (): Promise<ToolChoiceSearchResult> => ({
      ...base, kind: 'noMatch', query, results: [], reason: 'No suitable Tools found.', next: [],
    }))
    const { result } = renderHook(() => useMarketToolSearch({ query, searchAttempt: 0, searchTools }))
    await act(async () => {
      vi.advanceTimersByTime(TOOLS_SEARCH_DEBOUNCE_MS)
      await Promise.resolve()
    })
    expect(result.current.saveNeed).toEqual({ query })
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

describe('ToolsSearchPage saved need', () => {
  const noMatchSearch = vi.fn(async (): Promise<ToolChoiceSearchResult> => ({
    ...okPayload(), kind: 'noMatch', query: 'alpha', results: [],
    reason: 'No suitable Tools found.', next: [],
  }))

  it('offers sign-in instead of an anonymous demand write', async () => {
    owner.signedIn = false
    render(createElement(ToolsSearchPage, {
      query: 'alpha', onQueryChange: vi.fn(), onSelectTool: vi.fn(), searchTools: noMatchSearch,
    }))
    expect((await screen.findByRole('link', { name: 'Sign in to save this need' })).getAttribute('href')).toBe('/sign-in')
    expect(screen.queryByRole('button', { name: 'Save this need' })).toBeNull()
    expect(owner.record).not.toHaveBeenCalled()
    expect(owner.find).not.toHaveBeenCalled()
  })

  it('reuses one key across retry and exposes owner status and withdrawal', async () => {
    owner.find.mockResolvedValue({ kind: 'not_found' })
    owner.record.mockResolvedValueOnce({ kind: 'refused', code: 'source_unavailable' })
      .mockResolvedValueOnce({ kind: 'recorded', requestRef: 'need-a', query: 'alpha', createdAt: 1 })
    owner.status.mockResolvedValue({
      kind: 'open', requestRef: 'need-a', query: 'alpha', createdAt: 1, matchedCount: 0,
    })
    owner.withdraw.mockResolvedValue({ kind: 'withdrawn', requestRef: 'need-a' })
    render(createElement(ToolsSearchPage, {
      query: 'alpha', onQueryChange: vi.fn(), onSelectTool: vi.fn(), searchTools: noMatchSearch,
    }))

    fireEvent.click(await screen.findByRole('button', { name: 'Save this need' }))
    expect((await screen.findByRole('alert')).textContent).toContain('could not be saved')
    fireEvent.click(screen.getByRole('button', { name: 'Save this need' }))
    expect(await screen.findByText('Saved need · need-a')).toBeTruthy()
    expect(owner.record).toHaveBeenCalledTimes(2)
    const first = owner.record.mock.calls[0]?.[0]
    const second = owner.record.mock.calls[1]?.[0]
    expect(first.data).toEqual({ query: 'alpha', idempotencyKey: second.data.idempotencyKey })
    expect(first.data.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(owner.status).toHaveBeenCalledWith({ data: { requestRef: 'need-a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(await screen.findByRole('button', { name: 'Save this need' })).toBeTruthy()
    expect(owner.withdraw).toHaveBeenCalledWith({ data: { requestRef: 'need-a' } })
  })

  it('reopens exact owner-scoped saved demand and checks live status after reload', async () => {
    owner.find.mockResolvedValue({
      kind: 'found',
      request: { requestRef: 'need-existing', query: 'alpha', createdAt: 1, updatedAt: 1 },
    })
    owner.status.mockResolvedValue({
      kind: 'open', requestRef: 'need-existing', query: 'alpha', createdAt: 1, matchedCount: 0,
    })
    render(createElement(ToolsSearchPage, {
      query: 'alpha', onQueryChange: vi.fn(), onSelectTool: vi.fn(), searchTools: noMatchSearch,
    }))
    expect(await screen.findByText('Saved need · need-existing')).toBeTruthy()
    expect(owner.find).toHaveBeenCalledWith({ data: { query: 'alpha' } })
    expect(owner.status).toHaveBeenCalledWith({ data: { requestRef: 'need-existing' } })
    expect(owner.record).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Save this need' })).toBeNull()
  })

  it('does not write another need before checking whether the owner already saved it', async () => {
    let resolveFind: ((value: unknown) => void) | undefined
    owner.find.mockImplementationOnce(() => new Promise<unknown>((resolve) => { resolveFind = resolve }))
    render(createElement(ToolsSearchPage, {
      query: 'alpha', onQueryChange: vi.fn(), onSelectTool: vi.fn(), searchTools: noMatchSearch,
    }))
    const checking = await screen.findByRole('button', { name: 'Checking saved needs…' })
    expect(checking.hasAttribute('disabled')).toBe(true)
    fireEvent.click(checking)
    expect(owner.record).not.toHaveBeenCalled()
    await act(async () => {
      resolveFind?.({ kind: 'not_found' })
      await Promise.resolve()
    })
    expect(await screen.findByRole('button', { name: 'Save this need' })).toBeTruthy()
  })

  it('uses a fresh intent after an expired replay without extending the old window', async () => {
    owner.find.mockResolvedValue({ kind: 'not_found' })
    owner.record.mockResolvedValueOnce({ kind: 'replayed', requestRef: 'expired', query: 'alpha', createdAt: 1 })
      .mockResolvedValueOnce({ kind: 'recorded', requestRef: 'new-need', query: 'alpha', createdAt: 2 })
    owner.status.mockResolvedValueOnce({ kind: 'not_found' })
      .mockResolvedValueOnce({ kind: 'open', requestRef: 'new-need', query: 'alpha', createdAt: 2, matchedCount: 0 })
    render(createElement(ToolsSearchPage, {
      query: 'alpha', onQueryChange: vi.fn(), onSelectTool: vi.fn(), searchTools: noMatchSearch,
    }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save this need' }))
    expect((await screen.findByRole('alert')).textContent).toContain('expired')
    fireEvent.click(screen.getByRole('button', { name: 'Save this need' }))
    expect(await screen.findByText('Saved need · new-need')).toBeTruthy()
    expect(owner.record.mock.calls[0]?.[0].data.idempotencyKey)
      .not.toBe(owner.record.mock.calls[1]?.[0].data.idempotencyKey)
  })
})
