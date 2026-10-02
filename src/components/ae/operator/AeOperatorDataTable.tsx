'use client'

/* Arc sortable-data-table authored table, sort tint, mobile fold and FLIP row composition.
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
  type OnChangeFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table as TanStackTable,
} from '@tanstack/react-table'
import * as RovingFocusGroup from '@/components/ui/roving-focus'
import { Link } from '@tanstack/react-router'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AeViewBar } from '@/components/ae/data/AeViewBar'
import { Button } from '@/components/arc/button/button'
import { motion, useReducedMotion } from 'motion/react'
import { motionTokens } from '@/components/arc/motion-tokens'
import './RecordTable.css'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
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
  /**
   * Mobile-only content rendered above the table (compact cards). The table
   * itself is hidden on small screens when provided.
   */
  compactContent?: ReactNode
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
  sorting: controlledSorting,
  onSortingChange,
  selectedRowClassName,
  rowActionFocus,
  compactContent,
}: AeRecordTableProps<TData>) {
  const reduced = useReducedMotion() === true
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
      {compactContent === undefined ? null : (
        <div className="md:hidden">{compactContent}</div>
      )}
      <div
        {...(maxHeight === undefined
          ? {
              className:
                compactContent === undefined ? 'min-w-0' : 'hidden min-w-0 md:block',
            }
          : {
              className:
                compactContent === undefined
                  ? 'overflow-auto'
                  : 'hidden overflow-auto md:block',
              style: { maxHeight },
            })}
      >
        <div data-slot="table-container" className="arc-record-wrapper"><table role="table" className="arc-record-table" data-selectable={selection === undefined ? undefined : true}>
          <caption className="sr-only">{caption}</caption>
          <thead role="rowgroup">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr role="row" key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <th role="columnheader"
                    key={header.id}
                    scope="col"
                    className={header.column.id === '__ae_selection' ? 'arc-record-select-cell' : undefined}
                    data-sorted={header.column.getIsSorted() || undefined}
                    data-sortable={header.column.getCanSort() || undefined}
                    aria-sort={
                      !header.column.getCanSort()
                        ? undefined
                        : header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <RecordTableBody
            roving={rowAction !== undefined}
            {...(visibleRows[0] === undefined ? {} : { defaultTabStopId: visibleRows[0].id })}
            {...(onCurrentRowActionIdChange === undefined
              ? {}
              : {
                  onCurrentTabStopChange: (target: EventTarget | null) => {
                    const id = (target as HTMLElement | null)?.dataset.aeRowActionId ?? null
                    handleCurrentTabStopIdChange(id)
                  },
                })}
          >
            {showSkeleton ? (
              Array.from({ length: 5 }, (_, index) => (
                <tr role="row" key={`skeleton-${String(index)}`} className="hover:bg-transparent">
                  {leafColumns.map((column) => (
                    <td role="cell" key={`${column.id}-skeleton`}>
                      <span className="block h-4 w-24 max-w-full animate-pulse rounded-sm bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rowCount === 0 ? (
              <tr role="row" className="hover:bg-transparent">
                <td role="cell" colSpan={leafColumns.length} className="arc-record-empty">
                  <div className="flex flex-wrap items-center gap-related">
                    <span>{emptyMessage}</span>
                    {hasActiveFilter ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => updateGlobalFilter('')}
                      >
                        Clear filter
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <RecordTableRow
                  key={row.id}
                  row={row}
                  reduced={reduced}
                  order={visibleRowKey}
                  {...(selectedRowClassName === undefined
                    ? {}
                    : { selectedRowClassName })}
                />
              ))
            )}
          </RecordTableBody>
        </table></div>
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

function RecordTableRow<TData>({
  row,
  selectedRowClassName,
  reduced,
  order,
}: {
  row: Row<TData>
  reduced: boolean
  order: string
  selectedRowClassName?: string
}) {
  return (
    <motion.tr role="row"
      layout={reduced ? false : 'position'}
      layoutDependency={order}
      transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}
      data-state={row.getIsSelected() ? 'selected' : undefined}
      className={`has-[:focus-visible]:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring${row.getIsSelected() && selectedRowClassName !== undefined ? ` ${selectedRowClassName}` : ''}`}
    >
      {row.getVisibleCells().map((cell, index, cells) => (
        <td role="cell" key={cell.id}
          className={cell.column.id === '__ae_selection' ? 'arc-record-select-cell' : undefined}
          data-primary={index === (cells[0]?.column.id === '__ae_selection' ? 1 : 0) || undefined}
          data-sorted={cell.column.getIsSorted() || undefined}
          data-label={typeof cell.column.columnDef.header === 'string' ? cell.column.columnDef.header : cell.column.id}
          data-column={cell.column.id}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </motion.tr>
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
        className="arc-record-action"
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
    <div className="flex size-9 min-h-touch min-w-touch items-center justify-center">
      <Checkbox
        className="size-4"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={ariaLabel}
      />
    </div>
  )
}

function RecordTableBody({
  children,
  roving,
  defaultTabStopId,
  onCurrentTabStopChange,
}: {
  children: ReactNode
  roving: boolean
  defaultTabStopId?: string
  onCurrentTabStopChange?: (target: EventTarget | null) => void
}) {
  const body = <tbody role="rowgroup">{children}</tbody>
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
  const sorted = column.getIsSorted()
  const SortIcon =
    sorted === 'asc' ? ArrowUpIcon : sorted === 'desc' ? ArrowDownIcon : ArrowUpDownIcon

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'arc-record-sort',
        sorted ? 'text-foreground' : 'text-muted-foreground',
      )}
      onClick={() => column.toggleSorting(sorted === 'asc')}
      aria-label={`Sort by ${label}${sorted ? `, ${sorted === 'asc' ? 'ascending' : 'descending'}` : ''}`}
    >
      <span>{label}</span>
      <SortIcon
        aria-hidden="true"
        className={cn('size-3.5 shrink-0', sorted ? 'text-foreground' : 'opacity-50')}
      />
    </Button>
  )
}
