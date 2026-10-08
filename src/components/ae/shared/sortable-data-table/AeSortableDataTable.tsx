"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CellContext, ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table'
import { AeRecordTable, type AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import type { AeSortableDataTableProps } from './sortable-data-table.contracts'
import styles from './AeSortableDataTable.module.css'

const ColumnContent = createContext<((index: number, columnId: string) => ReactNode) | undefined>(undefined)
function AdaptedCell<T extends object>({ row, column }: CellContext<AeRecordTableFeatures, T, unknown>) {
  const render = useContext(ColumnContent)
  return render?.(row.index, column.id) ?? null
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
function sortInput(value: unknown): unknown {
  return value == null || value === '' ? undefined : value instanceof Date ? value.getTime() : value
}
function compare(left: unknown, right: unknown): number {
  if (typeof left === 'bigint' && typeof right === 'bigint') return left < right ? -1 : left > right ? 1 : 0
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : left > right ? 1 : 0
  return collator.compare(String(left), String(right))
}

/** Column-description adapter only. ReUI/v9 owns rendering, ordering and selection. */
export function AeSortableDataTable<T extends Record<string, unknown>>({
  rows, columns, rowKey, caption = 'Data table', ariaLabel, rowClassName,
  emptyMessage = 'No rows to show', defaultSort, onSortChange, selectable = false,
  selectedKeys, defaultSelectedKeys, onSelectionChange, itemName = { one: 'row', other: 'rows' },
  manualSorting = false, loading = false, maxHeight, tableClassName, mobileLayout = 'cards',
}: AeSortableDataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(() => defaultSort === undefined ? [] : [{ id: defaultSort.key, desc: defaultSort.direction === 'desc' }])
  const [internalKeys, setInternalKeys] = useState<string[]>(defaultSelectedKeys ?? [])
  const keys = selectedKeys ?? internalKeys
  const selected = useMemo<RowSelectionState>(() => Object.fromEntries(keys.map(key => [key, true])), [keys])
  const ownerSort = columns.find(column => column.sortDirection)
  const currentSorting = manualSorting
    ? ownerSort === undefined ? [] : [{ id: ownerSort.key, desc: ownerSort.sortDirection === 'desc' }]
    : sorting.filter(sort => columns.some(column => column.key === sort.id && column.sortable !== false))
  const definitions = useMemo<ColumnDef<AeRecordTableFeatures, T, unknown>[]>(() => columns.map(column => ({
    id: column.key,
    header: column.label,
    accessorFn: row => sortInput(column.sortValue === undefined ? row[column.key] : column.sortValue(row)),
    enableSorting: column.sortable !== false,
    enableHiding: column.key !== 'actions' && column.key !== 'details',
    sortUndefined: 'last',
    sortFn: (left, right, id) => compare(left.getValue(id), right.getValue(id)),
    ...(column.width === undefined ? {} : { size: column.width }),
    meta: { label: column.label, numeric: column.numeric ?? (rows.some(row => typeof row[column.key] === 'number') && rows.every(row => typeof row[column.key] === 'number' || sortInput(row[column.key]) === undefined)), ...(column.truncate === undefined ? {} : { truncate: column.truncate }) },
    cell: AdaptedCell,
  })), [columns, rows])

  const renderCell = useCallback((index: number, id: string) => {
    const row = rows[index]
    const column = columns.find(candidate => candidate.key === id)
    if (row === undefined || column === undefined) return null
    return column.render === undefined ? String(row[column.key] ?? '–') : column.render(row[column.key], row)
  }, [columns, rows])

  return <ColumnContent.Provider value={renderCell}><div className={styles.wrapper} data-mobile-layout={mobileLayout}>
    <AeRecordTable columns={definitions} data={rows} hideFilter announceChanges keyboardNavigation
      caption={caption} countLabel={itemName.other} loading={loading} serverControlled={manualSorting}
      sorting={currentSorting}
      onSortingChange={updater => {
        const next = typeof updater === 'function' ? updater(currentSorting) : updater
        if (!manualSorting) setSorting(next)
        const first = next[0]
        onSortChange?.(first === undefined ? undefined : { key: first.id, direction: first.desc ? 'desc' : 'asc' })
      }}
      getRowId={row => String(typeof rowKey === 'function' ? rowKey(row) : row[rowKey])}
      tableClassName={[styles.table, tableClassName].filter(Boolean).join(' ')}
      {...(ariaLabel === undefined ? {} : { ariaLabel })}
      {...(maxHeight === undefined ? {} : { maxHeight })}
      {...(rowClassName === undefined ? {} : { getRowClassName: () => rowClassName })}
      emptyMessage={emptyMessage}
      {...(selectable ? { selection: {
        state: selected, rowInteraction: true,
        getRowLabel: (row: T) => String(row[columns[0]?.key ?? ''] ?? (typeof rowKey === 'function' ? rowKey(row) : row[rowKey])),
        onChange: (updater: RowSelectionState | ((previous: RowSelectionState) => RowSelectionState)) => {
          const next = typeof updater === 'function' ? updater(selected) : updater
          const ids = Object.keys(next).filter(key => next[key] === true)
          if (selectedKeys === undefined) setInternalKeys(ids)
          onSelectionChange?.(ids)
        },
      } } : {})}
    />
  </div></ColumnContent.Provider>
}
