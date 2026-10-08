import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ColumnSizingState, ColumnVisibilityState, OnChangeFn } from '@tanstack/react-table'

export type AeTablePreferencesScope = Readonly<{ actorRef: string; accountRef: string }>
const PreferencesScope = createContext<AeTablePreferencesScope | undefined>(undefined)

/** Shell-owned scope; public tables and isolated consumers have no persistence owner. */
export function AeTablePreferencesProvider({ scope, children }: {
  scope?: AeTablePreferencesScope
  children: ReactNode
}) {
  return <PreferencesScope.Provider value={scope}>{children}</PreferencesScope.Provider>
}

type Layout = {
  columnVisibility: ColumnVisibilityState
  columnSizing: ColumnSizingState
  density: 'comfortable' | 'compact'
}
type Column = Readonly<{ id: string; canHide: boolean }>
const EMPTY_LAYOUT: Layout = { columnVisibility: {}, columnSizing: {}, density: 'comfortable' }
const MAX_COLUMNS = 128
const MAX_STORAGE_LENGTH = 16_000

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitize(value: unknown, columns: readonly Column[]): Layout {
  if (!record(value)) return EMPTY_LAYOUT
  const visibility: ColumnVisibilityState = {}
  const sizing: ColumnSizingState = {}
  for (const column of columns) {
    const hidden = record(value.columnVisibility) ? value.columnVisibility[column.id] : undefined
    if (column.canHide && hidden === false) visibility[column.id] = false
    const width = record(value.columnSizing) ? value.columnSizing[column.id] : undefined
    if (typeof width === 'number' && Number.isFinite(width) && width >= 40 && width <= 1_200) sizing[column.id] = width
  }
  // A malformed/stale preference cannot hide every data column.
  const hideable = columns.filter(column => column.canHide)
  const firstHideable = hideable[0]
  if (firstHideable !== undefined && hideable.every(column => visibility[column.id] === false)) {
    delete visibility[firstHideable.id]
  }
  return { columnVisibility: visibility, columnSizing: sizing, density: value.density === 'compact' ? 'compact' : 'comfortable' }
}

function read(key: string, columns: readonly Column[]): Layout {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null || raw.length > MAX_STORAGE_LENGTH) return EMPTY_LAYOUT
    const value: unknown = JSON.parse(raw)
    if (!record(value) || value.version !== 1) return EMPTY_LAYOUT
    return sanitize(value, columns)
  } catch { return EMPTY_LAYOUT }
}

/** Store presentation only. No rows, queries, selection, commands or authority enter storage. */
export function useAeTablePreferences(tableKey: string, columns: readonly Column[]) {
  const scope = useContext(PreferencesScope)
  const schema = columns.map(column => `${column.canHide ? 'h' : 'p'}:${column.id}`).join('\u0000')
  const key = scope === undefined || columns.length > MAX_COLUMNS ? undefined
    : `ae:table-layout:${JSON.stringify([scope.actorRef, scope.accountRef, tableKey, 1, schema])}`
  const stateKey = key ?? `local:${JSON.stringify([tableKey, 1, schema])}`
  const [retained, setRetained] = useState<{ key?: string; layout: Layout }>({ layout: EMPTY_LAYOUT })
  // A scope change drops the old layout synchronously, before the hydration effect.
  const layout = retained.key === stateKey ? retained.layout : EMPTY_LAYOUT
  const allowedColumns = columns

  useEffect(() => {
    setRetained(previous => previous.key === stateKey ? previous : { key: stateKey, layout: key === undefined ? EMPTY_LAYOUT : read(key, allowedColumns) })
  }, [key, stateKey, allowedColumns])

  useEffect(() => {
    if (key === undefined || retained.key !== stateKey) return
    try {
      window.localStorage.setItem(key, JSON.stringify({ version: 1, ...sanitize(retained.layout, allowedColumns) }))
    } catch { /* Unavailable browser storage does not block the table. */ }
  }, [key, stateKey, retained, allowedColumns])

  const update = (apply: (previous: Layout) => Layout) => {
    setRetained(previous => {
      const current = previous.key === stateKey ? previous.layout : EMPTY_LAYOUT
      const next = sanitize(apply(current), allowedColumns)
      return { key: stateKey, layout: next }
    })
  }
  const onColumnVisibilityChange: OnChangeFn<ColumnVisibilityState> = updater => update(previous => ({
    ...previous, columnVisibility: typeof updater === 'function' ? updater(previous.columnVisibility) : updater,
  }))
  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = updater => update(previous => ({
    ...previous, columnSizing: typeof updater === 'function' ? updater(previous.columnSizing) : updater,
  }))
  return {
    enabled: key !== undefined,
    ...layout,
    onColumnVisibilityChange,
    onColumnSizingChange,
    setDensity: (density: Layout['density']) => update(previous => ({ ...previous, density })),
    reset: () => update(() => EMPTY_LAYOUT),
  }
}
