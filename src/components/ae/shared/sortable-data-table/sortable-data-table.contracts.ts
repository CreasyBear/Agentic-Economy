import type { ReactNode } from 'react'

export type AeSortDirection = 'asc' | 'desc'
export type AeSortState = { key: string; direction: AeSortDirection }

/** Domain column descriptions adapted to the shared v9/ReUI foundation. */
export type AeDataColumn<T> = {
  key: string
  label: string
  sortable?: boolean
  render?: (value: unknown, row: T) => ReactNode
  numeric?: boolean
  width?: number
  /** Exact input independent of formatted content; BigInt is never coerced. */
  sortValue?: (row: T) => unknown
  /** Supplied owner state when ordering belongs outside this loaded page. */
  sortDirection?: AeSortDirection | false
  truncate?: boolean
}

export type AeSortableDataTableProps<T extends Record<string, unknown>> = {
  rows: readonly T[]
  columns: readonly AeDataColumn<T>[]
  rowKey: keyof T | ((row: T) => string)
  caption?: string
  ariaLabel?: string
  rowClassName?: string
  emptyMessage?: string
  defaultSort?: AeSortState
  onSortChange?: (sort: AeSortState | undefined) => void
  selectable?: boolean
  selectedKeys?: string[]
  defaultSelectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  itemName?: { one: string; other: string }
  manualSorting?: boolean
  loading?: boolean
  maxHeight?: string
  tableClassName?: string
  mobileLayout?: 'cards' | 'scroll'
}
