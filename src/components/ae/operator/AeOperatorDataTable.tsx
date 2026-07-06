'use client'

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDownIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@astryxdesign/core/Button'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table'
import { TextInput } from '@astryxdesign/core/TextInput'

type AeOperatorDataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[]
  data: readonly TData[]
  filterColumnId?: string
  filterPlaceholder?: string
  emptyMessage?: string
  maxHeight?: string
}

export function AeOperatorDataTable<TData>({
  columns,
  data,
  filterColumnId,
  filterPlaceholder = 'Filter rows…',
  emptyMessage = 'No rows match this filter.',
  maxHeight = 'min(70vh, 40rem)',
}: AeOperatorDataTableProps<TData>) {
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

  const showFilter = filterColumnId !== undefined || data.length > 6

  return (
    <div className="grid gap-3">
      {showFilter ? (
        <TextInput
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder={filterPlaceholder}
          label={filterPlaceholder}
          isLabelHidden
          width="min(24rem, 100%)"
        />
      ) : null}
      <div className="overflow-auto rounded-md border border-border" style={{ maxHeight }}>
        <Table density="compact" dividers="rows" hasHover>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHeaderCell
                    key={header.id}
                    scope="col"
                    className="sticky top-0 z-10 bg-surface"
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
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHeaderCell>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-secondary">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
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
      label={label}
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 px-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      endContent={<ArrowUpDownIcon aria-hidden="true" className="size-3.5" />}
    />
  )
}