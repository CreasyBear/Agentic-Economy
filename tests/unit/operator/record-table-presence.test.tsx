// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ColumnDef } from '@tanstack/react-table'

import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'

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
