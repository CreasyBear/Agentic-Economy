'use client'

/* Arc sortable-data-table authored table, sort tint and mobile fold.
 * Upstream TSX SHA-256 6115bc78d39abb4a3494e94f31259c93535b53fd5ebd1936c4cda2a95bb17241.
 * Requires stable caller rows/IDs and controlled selection/sort/filter contracts.
 * Ensures native table semantics and unchanged TanStack/RovingFocus callbacks.
 * Invariant: filtered-empty recovery never changes sorting, row identity or authority.
 * On violation: existing loading, empty and non-selectable states remain explicit. */

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type OnChangeFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table as TanStackTable,
} from '@tanstack/react-table'
import * as RovingFocusGroup from '@/components/ui/roving-focus'
import { Link } from '@tanstack/react-router'
import { type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AeViewBar } from '@/components/ae/data/AeViewBar'
import { Button } from '@/components/arc/button/button'
import buttonStyles from '@/components/arc/button/button.module.css'
import { SortableDataTable, SortableDataTableHeader, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
import './RecordTable.css'
import { Checkbox } from '@/components/arc/checkbox/checkbox'
import { useFirstLoadPending } from '@/components/ui/data-state'


export type AeRecordTableSelection<TData> = Readonly<{
  state: RowSelectionState
  onChange: OnChangeFn<RowSelectionState>
  getRowLabel: (row: TData) => string
  canSelectRow?: (row: TData) => boolean
  showSelectAll?: boolean
  showStatus?: boolean
}>

export type AeRecordTableRowAction<TData> =
  | Readonly<{
      kind: 'link'
      label: string
      getLabel?: (row: TData) => string
      getHref: (row: TData) => string
      getAccessibleLabel: (row: TData) => string
    }>
  | Readonly<{
      kind: 'button'
      label: string
      getLabel?: (row: TData) => string
      onOpen: (row: TData) => void
      getAccessibleLabel: (row: TData) => string
    }>

type AeRecordTableBaseProps<TData> = {
  columns: ColumnDef<TData, unknown>[]
  data: readonly TData[]
  filterPlaceholder?: string
  emptyMessage?: string
  caption?: string
  maxHeight?: string
  hideFilter?: boolean
  countLabel?: string
  action?: ReactNode
  rowAction?: AeRecordTableRowAction<TData>
  /**
   * True while a load is in flight. Skeletons render only before the first
   * settled result; refreshing an already-populated table keeps its rows.
   */
  loading?: boolean
  filterValue?: string
  onFilterChange?: (value: string) => void
  /** Caller-owned matching over supplied facts, retained by the existing engine. */
  globalFilterFn?: FilterFn<TData>
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  /**
   * Extra classes applied to rows in the selected state. Market compare
   * uses this for a brand connection to the comparison tray; operator
   * tables keep the default muted fill.
   */
  selectedRowClassName?: string
  /**
   * Roving row-action focus: when `restore` is true and `currentId` is set,
   * focus returns to that row's action on the next render it is visible.
   */
  rowActionFocus?: Readonly<{
    currentId?: string
    onCurrentIdChange?: (id: string) => void
    restore?: boolean
  }>
}

type AeRecordTableProps<TData> = AeRecordTableBaseProps<TData> &
  (
    | Readonly<{
        selection: AeRecordTableSelection<TData>
        getRowId: (row: TData, index: number, parent?: Row<TData>) => string
      }>
    | Readonly<{
        selection?: undefined
        getRowId?: (row: TData, index: number, parent?: Row<TData>) => string
      }>
  )

export function AeRecordTable<TData>({
  columns,
  data,
  filterPlaceholder = 'Filter rows…',
  emptyMessage = 'No rows match this filter.',
  caption = 'Records',
  maxHeight,
  hideFilter = false,
  countLabel = 'rows',
  action,
  getRowId,
  rowAction,
  selection,
  loading = false,
  filterValue,
  onFilterChange,
  globalFilterFn,
  sorting: controlledSorting,
  onSortingChange,
  selectedRowClassName,
  rowActionFocus,
}: AeRecordTableProps<TData>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('')
  const tableRootRef = useRef<HTMLDivElement>(null)
  const sorting = controlledSorting ?? internalSorting
  const globalFilter = filterValue ?? internalGlobalFilter
  const updateSorting = onSortingChange ?? setInternalSorting
  const updateGlobalFilter = onFilterChange ?? setInternalGlobalFilter
  const onCurrentRowActionIdChange = rowActionFocus?.onCurrentIdChange

  const selectionColumn = useMemo<ColumnDef<TData, unknown> | undefined>(
    () =>
      selection === undefined
        ? undefined
        : {
            id: '__ae_selection',
            meta: { label: 'Select' },
            enableSorting: false,
            enableHiding: false,
            header: ({ table }) => (
              <TableSelectionHeader
                table={table}
                caption={caption}
                {...(selection.showSelectAll === undefined
                  ? {}
                  : { showSelectAll: selection.showSelectAll })}
              />
            ),
            cell: ({ row }) => (
              <SelectionCheckbox
                checked={row.getIsSelected()}
                disabled={!row.getCanSelect()}
                onCheckedChange={(checked) => row.toggleSelected(checked === true)}
                aria-label={`Select ${selection.getRowLabel(row.original)}`}
              />
            ),
          },
    [caption, selection],
  )

  const actionColumn = useMemo<ColumnDef<TData, unknown> | undefined>(
    () =>
      rowAction === undefined
        ? undefined
        : {
            id: '__ae_action',
            meta: { label: rowAction.label },
            enableSorting: false,
            enableHiding: false,
            header: () => rowAction.label,
            cell: ({ row }) => <RecordTableAction row={row} action={rowAction} />,
          },
    [rowAction],
  )

  const resolvedColumns = useMemo(
    () => [selectionColumn, ...columns, actionColumn].filter(
      (column): column is ColumnDef<TData, unknown> => column !== undefined,
    ),
    [actionColumn, columns, selectionColumn],
  )

  const tableData = useMemo(() => [...data], [data])
  const table = useReactTable({
    data: tableData,
    columns: resolvedColumns,
    state: {
      sorting,
      globalFilter,
      ...(selection === undefined ? {} : { rowSelection: selection.state }),
    },
    onSortingChange: updateSorting,
    onGlobalFilterChange: updateGlobalFilter,
    ...(globalFilterFn === undefined ? {} : { globalFilterFn }),
    ...(selection === undefined
      ? {}
      : {
          onRowSelectionChange: selection.onChange,
          enableRowSelection: (row: Row<TData>) =>
            selection.canSelectRow?.(row.original) ?? true,
        }),
    ...(getRowId === undefined ? {} : { getRowId }),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const showFilter = !hideFilter && (data.length > 1 || globalFilter.length > 0)
  const rowCount = table.getRowModel().rows.length
  const leafColumns = table.getAllLeafColumns()
  const showSkeleton = useFirstLoadPending(loading)
  const hasActiveFilter = globalFilter.trim().length > 0
  const visibleRows = table.getRowModel().rows
  const selectableVisibleRows =
    selection === undefined ? [] : visibleRows.filter((row) => row.getCanSelect())
  const selectedVisibleCount = selectableVisibleRows.filter((row) => row.getIsSelected()).length
  const visibleRowKey = visibleRows.map((row) => row.id).join('\u0000')
  const handleCurrentTabStopIdChange = useCallback(
    (id: string | null) => {
      if (id !== null) onCurrentRowActionIdChange?.(id)
    },
    [onCurrentRowActionIdChange],
  )

  useEffect(() => {
    if (rowActionFocus?.restore !== true || rowActionFocus.currentId === undefined) return
    const action = Array.from(
      tableRootRef.current?.querySelectorAll<HTMLElement>('[data-ae-row-action-id]') ?? [],
    ).find((element) => element.dataset.aeRowActionId === rowActionFocus.currentId)
    if (action === undefined) return
    const frame = window.requestAnimationFrame(() => {
      action.focus({ preventScroll: true })
      action.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [rowActionFocus?.currentId, rowActionFocus?.restore, visibleRowKey])

  // The existing engine owns filtering, exact comparators and guarded selection.
  // Arc owns the complete table hierarchy; only typed cells/header callbacks cross.
  type ArcRecordRow = { id: string; record: Row<TData> }
  const arcRows: ArcRecordRow[] = visibleRows.map(record => ({ id: record.id, record }))
  const leafHeaders = table.getFlatHeaders().filter(header => header.subHeaders.length === 0)
  const arcColumns: DataColumn<ArcRecordRow>[] = leafColumns.map(column => {
    const header = leafHeaders.find(item => item.column.id === column.id)
    const meta = column.columnDef.meta as { label?: string; numeric?: boolean; truncate?: boolean } | undefined
    const values = visibleRows.map(row => row.getValue(column.id))
    const numeric = meta?.numeric ?? (values.some(value => typeof value === 'number' || typeof value === 'bigint') && values.every(value => value == null || value === '' || typeof value === 'number' || typeof value === 'bigint'))
    const width = column.id === '__ae_selection' ? 44 : column.id === '__ae_action' ? 104 : undefined
    return {
      key: column.id,
      label: meta?.label ?? (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id),
      sortable: column.getCanSort(),
      sortDirection: column.getIsSorted(),
      selection: column.id === '__ae_selection',
      numeric,
      truncate: meta?.truncate ?? false,
      ...(width === undefined ? {} : { width }),
      ...(typeof column.columnDef.header === 'function' ? {
        renderHeader: () => header === undefined || header.isPlaceholder ? null : flexRender(column.columnDef.header, header.getContext()),
      } : {}),
      render: (_value, { record }) => {
        const cell = record.getVisibleCells().find(item => item.column.id === column.id)
        return cell === undefined ? null : flexRender(cell.column.columnDef.cell, cell.getContext())
      },
    }
  })

  return (
    <div
      ref={tableRootRef}
      {...(showSkeleton ? { 'aria-busy': true } : {})}
      className="arc-market arc-record-root"
    >
      {showFilter || action !== undefined ? (
        <AeViewBar
          filterValue={globalFilter}
          {...(showFilter ? { onFilterChange: updateGlobalFilter } : {})}
          filterPlaceholder={filterPlaceholder}
          count={rowCount}
          countLabel={countLabel}
          {...(action === undefined ? {} : { action })}
        />
      ) : null}
      <div className="min-w-0">
        <SortableDataTable
          rows={arcRows}
          columns={arcColumns}
          rowKey="id"
          caption={caption}
          manualSorting
          onSortChange={({ key, direction }) => table.getColumn(key)?.toggleSorting(direction === 'desc')}
          animateRows={false}
          loading={showSkeleton}
          tableClassName="arc-record-table"
          {...(maxHeight === undefined ? {} : { maxHeight })}
          isRowSelected={({ record }) => record.getIsSelected()}
          getRowClassName={({ record }) => `has-[:focus-visible]:bg-muted/50${record.getIsSelected() && selectedRowClassName !== undefined ? ` ${selectedRowClassName}` : ''}`}
          renderBody={(body) => <RecordTableBody
            body={body}
            roving={rowAction !== undefined}
            {...(visibleRows[0] === undefined ? {} : { defaultTabStopId: visibleRows[0].id })}
            {...(onCurrentRowActionIdChange === undefined ? {} : {
              onCurrentTabStopChange: (target: EventTarget | null) => {
                const id = (target as HTMLElement | null)?.dataset.aeRowActionId ?? null
                handleCurrentTabStopIdChange(id)
              },
            })}
          />}
          emptyContent={<div className="flex flex-wrap items-center gap-related">
            <span>{emptyMessage}</span>
            {hasActiveFilter ? <Button type="button" variant="secondary" size="sm" onClick={() => updateGlobalFilter('')}>Clear filter</Button> : null}
          </div>}
        />
      </div>
      {selection === undefined || selection.showStatus === false ? null : (
        <p
          role="status"
          aria-live="polite"
          className="arc-record-footer"
        >
          {selectedVisibleCount.toLocaleString()} of{' '}
          {selectableVisibleRows.length.toLocaleString()} selected
        </p>
      )}
    </div>
  )
}

function RecordTableAction<TData>({
  row,
  action,
}: {
  row: Row<TData>
  action: AeRecordTableRowAction<TData>
}) {
  const accessibleLabel = action.getAccessibleLabel(row.original)
  const label = action.getLabel?.(row.original) ?? action.label
  const control =
    action.kind === 'link' ? (
      <Link
        to={action.getHref(row.original)}
        aria-label={accessibleLabel}
        data-ae-row-action-id={row.id}
        className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.sm} arc-record-action`}
      >
        {label}
      </Link>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="arc-record-action"
        aria-label={accessibleLabel}
        data-ae-row-action-id={row.id}
        onClick={() => action.onOpen(row.original)}
      >
        {label}
      </Button>
    )

  return (
    <div className="flex items-center">
      <RovingFocusGroup.Item render={control} tabStopId={row.id} />
    </div>
  )
}

function SelectionCheckbox({
  checked,
  disabled,
  onCheckedChange,
  'aria-label': ariaLabel,
}: Readonly<{
  checked: boolean | 'indeterminate'
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  'aria-label': string
}>) {
  return (
    <div className="arc-record-selection-hit">
      <Checkbox
        compact
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={ariaLabel}
      />
    </div>
  )
}

function RecordTableBody({
  body,
  roving,
  defaultTabStopId,
  onCurrentTabStopChange,
}: {
  body: ReactElement
  roving: boolean
  defaultTabStopId?: string
  onCurrentTabStopChange?: (target: EventTarget | null) => void
}) {
  return roving ? (
    <RovingFocusGroup.Root
      render={body}
      orientation="vertical"
      loop={false}
      {...(onCurrentTabStopChange === undefined
        ? {}
        : { onCurrentTabStopChange })}
      {...(defaultTabStopId === undefined ? {} : { defaultTabStopId })}
    />
  ) : (
    body
  )
}

function TableSelectionHeader<TData>({
  table,
  caption,
  showSelectAll,
}: {
  table: TanStackTable<TData>
  caption: string
  showSelectAll?: boolean
}) {
  if (showSelectAll === false) return <span className="sr-only">Select</span>

  return (
    <SelectionCheckbox
      checked={
        table.getIsAllPageRowsSelected()
          ? true
          : table.getIsSomePageRowsSelected()
            ? 'indeterminate'
            : false
      }
      disabled={!table.getRowModel().rows.some((row) => row.getCanSelect())}
      onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
      aria-label={`Select all ${caption}`}
    />
  )
}


export function AeOperatorSortableHeader({
  label,
  column,
}: {
  label: string
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | 'asc' | 'desc' }
}) {
  return <SortableDataTableHeader label={label} direction={column.getIsSorted()} onSort={() => column.toggleSorting(column.getIsSorted() === 'asc')} />
}
