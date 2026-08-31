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
import { type ReactNode, useMemo, useState } from 'react'

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
}: AeRecordTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

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
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
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

  return (
    <div {...(showSkeleton ? { 'aria-busy': true } : {})} className="grid">
      {showFilter || action !== undefined ? (
        <AeViewBar
          filterValue={globalFilter}
          {...(showFilter ? { onFilterChange: setGlobalFilter } : {})}
          filterPlaceholder={filterPlaceholder}
          count={rowCount}
          countLabel={countLabel}
          {...(action === undefined ? {} : { action })}
        />
      ) : null}
      <div
        {...(maxHeight === undefined ? {} : { className: 'overflow-auto', style: { maxHeight } })}
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
                        onClick={() => setGlobalFilter('')}
                      >
                        Clear filter
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <RecordTableRow key={row.id} row={row} />
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
}: {
  row: Row<TData>
}) {
  return (
    <TableRow
      data-state={row.getIsSelected() ? 'selected' : undefined}
      className="has-[:focus-visible]:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring"
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
      <Button asChild variant="ghost" size="sm" className="min-h-touch sm:min-h-8">
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
}: {
  children: ReactNode
  roving: boolean
  defaultTabStopId?: string
}) {
  const body = <TableBody>{children}</TableBody>
  return roving ? (
    <RovingFocusGroup.Root
      asChild
      orientation="vertical"
      loop={false}
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
