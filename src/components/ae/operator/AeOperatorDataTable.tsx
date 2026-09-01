'use client'

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
import * as RovingFocusGroup from '@radix-ui/react-roving-focus'
import { Link } from '@tanstack/react-router'
import { ArrowUpDownIcon } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AeViewBar } from '@/components/ae/data/AeViewBar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useFirstLoadPending } from '@/components/ui/data-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
      getHref: (row: TData) => string
      getAccessibleLabel: (row: TData) => string
    }>
  | Readonly<{
      kind: 'button'
      label: string
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
              <Checkbox
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
            header: () => <span className="sr-only">{rowAction.label}</span>,
            cell: ({ row }) => <RecordTableAction row={row} action={rowAction} />,
          },
    [rowAction],
  )

  const resolvedColumns = useMemo(
    () => [selectionColumn, actionColumn, ...columns].filter(
      (column): column is ColumnDef<TData, unknown> => column !== undefined,
    ),
    [actionColumn, columns, selectionColumn],
  )

  const table = useReactTable({
    data: [...data],
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
      className="grid"
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
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className="sticky top-0 z-10 bg-container"
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
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
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
                <TableRow key={`skeleton-${String(index)}`} className="hover:bg-transparent">
                  {leafColumns.map((column) => (
                    <TableCell key={`${column.id}-skeleton`}>
                      <span className="block h-4 w-24 max-w-full animate-pulse rounded-sm bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rowCount === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={leafColumns.length} className="h-24 text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-related">
                    <span>{emptyMessage}</span>
                    {hasActiveFilter ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateGlobalFilter('')}
                      >
                        Clear filter
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <RecordTableRow
                  key={row.id}
                  row={row}
                  {...(selectedRowClassName === undefined
                    ? {}
                    : { selectedRowClassName })}
                />
              ))
            )}
          </RecordTableBody>
        </Table>
      </div>
      {selection === undefined || selection.showStatus === false ? null : (
        <p
          role="status"
          aria-live="polite"
          className="py-intra font-mono text-xs tabular-nums text-muted-foreground"
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
}: {
  row: Row<TData>
  selectedRowClassName?: string
}) {
  return (
    <TableRow
      data-state={row.getIsSelected() ? 'selected' : undefined}
      className={`has-[:focus-visible]:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring${row.getIsSelected() && selectedRowClassName !== undefined ? ` ${selectedRowClassName}` : ''}`}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id} className="whitespace-normal">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
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
  const control =
    action.kind === 'link' ? (
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="min-h-touch sm:min-h-8"
        data-ae-row-action-id={row.id}
      >
        <Link to={action.getHref(row.original)} aria-label={accessibleLabel}>
          {action.label}
        </Link>
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-touch sm:min-h-8"
        aria-label={accessibleLabel}
        data-ae-row-action-id={row.id}
        onClick={() => action.onOpen(row.original)}
      >
        {action.label}
      </Button>
    )

  return (
    <RovingFocusGroup.Item asChild tabStopId={row.id}>
      {control}
    </RovingFocusGroup.Item>
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
  const body = <TableBody>{children}</TableBody>
  return roving ? (
    <RovingFocusGroup.Root
      asChild
      orientation="vertical"
      loop={false}
      {...(onCurrentTabStopChange === undefined
        ? {}
        : { onCurrentTabStopChange })}
      {...(defaultTabStopId === undefined ? {} : { defaultCurrentTabStopId: defaultTabStopId })}
    >
      {body}
    </RovingFocusGroup.Root>
  ) : body
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
    <Checkbox
      checked={
        table.getIsAllPageRowsSelected()
          ? true
          : table.getIsSomePageRowsSelected()
            ? 'indeterminate'
            : false
      }
      disabled={!table.getRowModel().rows.some((row) => row.getCanSelect())}
      onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
      aria-label={`Select all ${caption}`}
    />
  )
}

export function AeOperatorDataTable<TData>(props: AeRecordTableProps<TData>) {
  return <AeRecordTable {...props} />
}

export function AeOperatorSortableHeader({
  label,
  column,
}: {
  label: string
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | 'asc' | 'desc' }
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ms-2 h-8 min-h-8 px-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      <ArrowUpDownIcon aria-hidden="true" className="size-3.5" />
    </Button>
  )
}
