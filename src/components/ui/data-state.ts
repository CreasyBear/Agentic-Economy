import { useEffect, useState } from 'react'

/**
 * One cache-aware vocabulary for list-shaped data, shared by every surface
 * that sits between a query and its placeholder UI. The rule it encodes:
 * a skeleton appears ONLY while nothing is cached yet. Refreshing data that
 * is already on screen never collapses back into skeletons or empty states,
 * and a resolved-but-empty result shows the canonical empty state once.
 */
export type ListDataPhase =
  | 'unloaded'
  | 'cached-empty'
  | 'cached-rows'

/** Classifies query-shaped rows where `undefined` means "nothing cached yet". */
export function listDataPhase(rows: readonly unknown[] | undefined): ListDataPhase {
  if (rows === undefined) return 'unloaded'
  return rows.length === 0 ? 'cached-empty' : 'cached-rows'
}

/**
 * For flag-driven callers (`loading` plus last-known rows) that cannot observe
 * `undefined`: true only until the first load settles. Afterwards, in-flight
 * refreshes keep whatever is on screen — skeleton is never allowed again.
 */
export function useFirstLoadPending(loading: boolean): boolean {
  const [settled, setSettled] = useState(!loading)
  useEffect(() => {
    if (!loading) setSettled(true)
  }, [loading])
  return loading && !settled
}

function shallowEqualRows<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

/**
 * Keeps the most recent cached page across query-key churn (Convex search
 * subscriptions restart as `undefined` per keystroke): the previous results
 * stay visible until the next page resolves, so neither an empty state nor a
 * skeleton can flash over known rows. Shallow-equal pages keep their state,
 * so reference-churny producers cannot drive re-render loops.
 */
export function useStickyRows<T>(rows: readonly T[] | undefined): {
  shown: readonly T[]
  everCached: boolean
} {
  const [sticky, setSticky] = useState<readonly T[]>([])
  const [everCached, setEverCached] = useState(false)
  useEffect(() => {
    if (rows === undefined || shallowEqualRows(rows, sticky)) return
    setSticky(rows)
    setEverCached(true)
  }, [rows, sticky])
  return {
    shown: rows ?? sticky,
    everCached: everCached || rows !== undefined,
  }
}

/** Combines a settlement signal with a cached page into the shared vocabulary. */
export function stagedListPhase(input: {
  firstLoadPending: boolean
  rows: readonly unknown[]
}): ListDataPhase {
  if (input.firstLoadPending) return 'unloaded'
  return listDataPhase(input.rows)
}
