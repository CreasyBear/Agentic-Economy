import type { ReactElement, ReactNode, RefObject } from 'react'

export type AeSortDirection = 'asc' | 'desc'
export type AeSortState = { key: string; direction: AeSortDirection }

export type AeDataColumn<T> = {
  key: string
  label: string
  sortable?: boolean
  render?: (value: unknown, row: T) => ReactNode
  /** Right-aligns the column with tabular numerals. Detected when every value is a number. */
  numeric?: boolean
  /** Fixed width such as 120 or "20%". Other columns are measured once and held, so sorting never reflows them. */
  width?: number | string
  /** Exact sort input, independent of the formatted cell content. */
  sortValue?: (row: T) => unknown
  /** Controlled table engines can retain their existing header controls. */
  renderHeader?: () => ReactNode
  sortDirection?: AeSortDirection | false
  selection?: boolean
  /** Opt in for short text summaries; controls and full facts remain unclipped. */
  truncate?: boolean
}

export type AeSortableDataTableProps<T extends Record<string, unknown>> = {
  rows: readonly T[]
  columns: readonly AeDataColumn<T>[]
  density?: 'comfortable' | 'compact'
  mobileLayout?: 'cards' | 'scroll'
  rowKey: keyof T | ((row: T) => string)
  caption?: string
  ariaLabel?: string
  /** Catalogue callers can retain native rows without sort motion or column measurements. */
  animateRows?: boolean
  rowClassName?: string
  emptyMessage?: string
  /** Sort applied on the first render. */
  defaultSort?: AeSortState
  onSortChange?: (sort: AeSortState) => void
  /** Adds a checkbox column, row click selection, and a count line with a clear action. */
  selectable?: boolean
  selectedKeys?: string[]
  defaultSelectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  /** Noun for the count line, as in "6 projects". */
  itemName?: { one: string; other: string }
  /** Rows are already sorted by the caller's typed engine. */
  manualSorting?: boolean
  isRowSelected?: (row: T) => boolean
  getRowClassName?: (row: T) => string
  /** Retain the caller's native roving-focus group around the table body. */
  renderBody?: (body: ReactElement) => ReactNode
  emptyContent?: ReactNode
  loading?: boolean
  maxHeight?: string
  tableClassName?: string
}

export type SwapProps = { value: string; direction: number; reduced: boolean; className?: string | undefined }
export type SortGlyphProps = { active: boolean; descending: boolean; reduced: boolean }
export type SelectBoxProps = { checked: boolean; mixed?: boolean; label: string; nav: 'head' | 'row'; reduced: boolean; onToggle: (extend: boolean) => void; inputRef?: RefObject<HTMLInputElement | null> }
export type AeSortableDataTableHeaderProps = { label: string; direction: AeSortDirection | false; onSort: () => void }
