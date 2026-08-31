// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ColumnDef } from '@tanstack/react-table'

import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'

afterEach(cleanup)

type Row = Readonly<{ id: string; name: string }>

const columns: ColumnDef<Row, unknown>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.name,
    header: () => 'Name',
    cell: ({ row }) => row.original.name,
  },
]

const rows: readonly Row[] = [
  { id: 'row-1', name: 'weather.lookup' },
  { id: 'row-2', name: 'fx.convert' },
]

describe('AeRecordTable cache-aware skeleton rule', () => {
  it('shows skeletons only when the first load has nothing cached yet', () => {
    const { container } = render(
      <AeRecordTable columns={columns} data={[]} caption="Operations" countLabel="operations" loading hideFilter />,
    )

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText('No rows match this filter.')).toBeNull()
  })

  it('never flashes skeletons over cached rows while a refresh is in flight', () => {
    const { container, rerender } = render(
      <AeRecordTable columns={columns} data={rows} caption="Operations" countLabel="operations" />,
    )
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()

    rerender(
      <AeRecordTable columns={columns} data={rows} caption="Operations" countLabel="operations" loading />,
    )

    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0)
    expect(screen.getByText('weather.lookup')).toBeTruthy()
    expect(screen.getByText('fx.convert')).toBeTruthy()
  })

  it('shows the canonical empty copy once a settled load resolves empty', () => {
    render(
      <AeRecordTable
        columns={columns}
        data={[]}
        caption="Operations"
        countLabel="operations"
        emptyMessage="No operations match these filters."
      />,
    )

    expect(screen.getByText('No operations match these filters.')).toBeTruthy()
  })
})

describe('AeRecordTable filtered-empty recovery', () => {
  it('restores existing rows in one action while keeping the provided empty message once', () => {
    render(
      <AeRecordTable
        columns={columns}
        data={rows}
        caption="Operations"
        countLabel="operations"
        emptyMessage="No operations match this filter."
      />,
    )

    const filter = screen.getByRole('textbox', { name: 'Filter rows…' })
    fireEvent.change(filter, { target: { value: 'no-such-operation' } })

    expect(screen.getAllByText('No operations match this filter.')).toHaveLength(1)
    expect(screen.getByText('0 operations')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))

    expect((filter as HTMLInputElement).value).toBe('')
    expect(screen.getByText('2 operations')).toBeTruthy()
    expect(screen.getByText('weather.lookup')).toBeTruthy()
    expect(screen.getByText('fx.convert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull()
  })

  it('does not offer filter recovery while rows match or when unfiltered data is truly empty', () => {
    const { rerender } = render(
      <AeRecordTable columns={columns} data={rows} caption="Operations" countLabel="operations" />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter rows…' }), {
      target: { value: 'weather' },
    })
    expect(screen.getByText('weather.lookup')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter rows…' }), {
      target: { value: '' },
    })

    rerender(
      <AeRecordTable
        columns={columns}
        data={[]}
        caption="Operations"
        countLabel="operations"
        emptyMessage="No operations yet."
      />,
    )
    expect(screen.getByText('No operations yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull()
  })

  it('preserves the current sort after clearing an unmatched filter', () => {
    const sortableColumns: ColumnDef<Row, unknown>[] = [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        header: ({ column }) => <AeOperatorSortableHeader label="Name" column={column} />,
        cell: ({ row }) => row.original.name,
      },
    ]

    render(
      <AeRecordTable
        columns={sortableColumns}
        data={rows}
        caption="Operations"
        countLabel="operations"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    expect(within(screen.getByRole('table')).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'fx.convert',
      'weather.lookup',
    ])

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter rows…' }), {
      target: { value: 'no-such-operation' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))

    expect(within(screen.getByRole('table')).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'fx.convert',
      'weather.lookup',
    ])
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('ascending')
  })
})
