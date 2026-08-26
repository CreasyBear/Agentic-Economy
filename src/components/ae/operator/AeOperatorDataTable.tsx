'use client'

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { useRouter } from '@tanstack/react-router'
import { ArrowUpDownIcon } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, type ReactNode, useState } from 'react'

import { AeViewBar } from '@/components/ae/data/AeViewBar'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type AeRecordTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[]
  data: readonly TData[]
  filterPlaceholder?: string
  emptyMessage?: string
  caption?: string
  maxHeight?: string
  hideFilter?: boolean
  countLabel?: string
  action?: ReactNode
  onRowClick?: (row: TData) => void
  getRowHref?: (row: TData) => string | undefined
  loading?: boolean
}

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
  onRowClick,
  getRowHref,
  loading = false,
}: AeRecordTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data: [...data],
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const showFilter = !hideFilter && (data.length > 1 || globalFilter.length > 0)
  const rowCount = table.getRowModel().rows.length
  const interactive = onRowClick !== undefined || getRowHref !== undefined

  return (
    <div className="grid">
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
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={`skeleton-${String(index)}`} className="hover:bg-transparent">
                  {columns.map((column, cellIndex) => (
                    <TableCell key={`${String(column.id ?? cellIndex)}-skeleton`}>
                      <span className="block h-4 w-24 max-w-full animate-pulse rounded-sm bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rowCount === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-24 text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const href = getRowHref?.(row.original)
                if (href === undefined) {
                  return (
                    <RecordTableRow
                      key={row.id}
                      row={row}
                      interactive={interactive}
                      {...(onRowClick === undefined ? {} : { onRowClick })}
                    />
                  )
                }
                return (
                  <RecordTableLinkRow
                    key={row.id}
                    row={row}
                    href={href}
                    {...(onRowClick === undefined ? {} : { onRowClick })}
                  />
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function isControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, input, select, textarea, [role="button"]') !== null
}

function RecordTableRow<TData>({
  row,
  interactive,
  onRowClick,
}: {
  row: Row<TData>
  interactive: boolean
  onRowClick?: (row: TData) => void
}) {
  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    if (!interactive || isControlTarget(event.target)) return
    onRowClick?.(row.original)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (!interactive) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onRowClick?.(row.original)
  }

  return (
    <TableRow
      {...(interactive ? { className: 'cursor-pointer', tabIndex: 0, onClick: handleClick, onKeyDown: handleKeyDown } : {})}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id} className="whitespace-normal">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  )
}

function RecordTableLinkRow<TData>({
  row,
  href,
  onRowClick,
}: {
  row: Row<TData>
  href: string
  onRowClick?: (row: TData) => void
}) {
  const router = useRouter()

  function followHref(event?: MouseEvent<HTMLTableRowElement>) {
    if (event !== undefined && (event.metaKey || event.ctrlKey)) {
      window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    void router.navigate({ to: href })
  }

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    if (isControlTarget(event.target)) return
    if (onRowClick !== undefined) {
      event.preventDefault()
      onRowClick(row.original)
      return
    }
    followHref(event)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (onRowClick !== undefined) {
      onRowClick(row.original)
      return
    }
    followHref()
  }

  return (
    <TableRow
      className="cursor-pointer"
      tabIndex={0}
      data-href={href}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id} className="whitespace-normal">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
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
      className="-ml-2 h-8 min-h-8 px-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      <ArrowUpDownIcon aria-hidden="true" className="size-3.5" />
    </Button>
  )
}
