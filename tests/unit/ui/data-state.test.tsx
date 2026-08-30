/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  listDataPhase,
  stagedListPhase,
  useFirstLoadPending,
  useStickyRows,
} from '@/components/ui/data-state'

afterEach(cleanup)

describe('listDataPhase', () => {
  it('treats an absent query result as unloaded, never as empty', () => {
    expect(listDataPhase(undefined)).toBe('unloaded')
  })

  it('separates a resolved-empty page from cached rows', () => {
    expect(listDataPhase([])).toBe('cached-empty')
    expect(listDataPhase([{ id: 'row-1' }])).toBe('cached-rows')
  })
})

describe('useFirstLoadPending', () => {
  it('allows skeletons before the first settled load and never again', () => {
    const hook = renderHook(({ loading }) => useFirstLoadPending(loading), {
      initialProps: { loading: true },
    })

    expect(hook.result.current).toBe(true)

    act(() => hook.rerender({ loading: false }))
    expect(hook.result.current).toBe(false)

    act(() => hook.rerender({ loading: true }))
    expect(hook.result.current).toBe(false)
  })

  it('starts settled when mounted without a load', () => {
    const hook = renderHook((loading) => useFirstLoadPending(loading), {
      initialProps: false,
    })

    expect(hook.result.current).toBe(false)
  })
})

describe('useStickyRows', () => {
  it('holds the last cached page across query-key churn', () => {
    const hook = renderHook(
      ({ rows }: { rows?: readonly string[] }) => useStickyRows(rows),
      { initialProps: {} },
    )

    expect(hook.result.current.everCached).toBe(false)
    expect(hook.result.current.shown).toEqual([])

    act(() => hook.rerender({ rows: ['first'] }))
    expect(hook.result.current.everCached).toBe(true)
    expect(hook.result.current.shown).toEqual(['first'])

    act(() => hook.rerender({}))
    expect(hook.result.current.everCached).toBe(true)
    expect(hook.result.current.shown).toEqual(['first'])

    act(() => hook.rerender({ rows: ['second'] }))
    expect(hook.result.current.shown).toEqual(['second'])
  })
})

describe('stagedListPhase', () => {
  it('gates placeholders on settlement, not on in-flight refreshes', () => {
    expect(stagedListPhase({ firstLoadPending: true, rows: [] })).toBe('unloaded')
    expect(stagedListPhase({ firstLoadPending: false, rows: [] })).toBe('cached-empty')
    expect(stagedListPhase({ firstLoadPending: false, rows: ['row'] })).toBe('cached-rows')
  })
})
