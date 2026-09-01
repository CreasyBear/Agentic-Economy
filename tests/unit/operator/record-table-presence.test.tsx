// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { useState } from 'react'

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

describe('AeRecordTable interaction composition', () => {
  it('keeps static tables semantic without checkboxes or focusable rows', () => {
    const { container } = render(
      <AeRecordTable columns={columns} data={rows} caption="Operations" hideFilter />,
    )

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(container.querySelector('tbody tr[tabindex]')).toBeNull()
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
    expect(container.querySelector('[data-slot="table-container"]')).not.toBeNull()
  })

  it('lets Radix rove one native row action through Arrow and Home/End keys', async () => {
    const opened: string[] = []
    const { container } = render(
      <AeRecordTable
        columns={columns}
        data={rows}
        caption="Operations"
        hideFilter
        getRowId={(row) => row.id}
        rowAction={{
          kind: 'button',
          label: 'View',
          onOpen: (row) => opened.push(row.id),
          getAccessibleLabel: (row) => `View ${row.name}`,
        }}
      />,
    )

    const actions = screen.getAllByRole('button', { name: /^View / })
    expect(actions.map((action) => action.getAttribute('tabindex'))).toEqual(['0', '-1'])
    expect(container.querySelector('tbody tr[tabindex]')).toBeNull()

    actions[0]?.focus()
    fireEvent.keyDown(actions[0]!, { key: 'ArrowDown', code: 'ArrowDown' })
    await waitFor(() => expect(document.activeElement).toBe(actions[1]))
    fireEvent.keyDown(actions[1]!, { key: 'Home', code: 'Home' })
    await waitFor(() => expect(document.activeElement).toBe(actions[0]))
    fireEvent.keyDown(actions[0]!, { key: 'End', code: 'End' })
    await waitFor(() => expect(document.activeElement).toBe(actions[1]))
    fireEvent.keyDown(actions[1]!, { key: 'ArrowDown', code: 'ArrowDown' })
    await waitFor(() => expect(document.activeElement).toBe(actions[1]))

    fireEvent.click(actions[1]!)
    expect(opened).toEqual(['row-2'])
    expect(actions[1]?.closest('tr')?.className).toContain('has-[:focus-visible]')
  })

  it('composes controlled selected, mixed, all, and clear states with stable IDs', () => {
    render(<SelectableRecordTable />)

    const first = screen.getByRole('checkbox', { name: 'Select weather.lookup' })

    fireEvent.click(first)
    expect(screen.getByRole('checkbox', { name: 'Select weather.lookup' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Select weather.lookup' }).closest('tr')?.getAttribute('data-state')).toBe('selected')
    const selectAll = screen.getByRole('checkbox', { name: 'Select all Operations' })
    expect(selectAll.getAttribute('aria-checked')).toBe('mixed')
    expect(selectAll.querySelector('.lucide-minus')).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('1 of 2 selected')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select fx.convert' }))
    expect(screen.getByRole('checkbox', { name: 'Select all Operations' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('2 of 2 selected')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all Operations' }))
    expect(screen.getByRole('checkbox', { name: 'Select weather.lookup' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('checkbox', { name: 'Select fx.convert' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('status').textContent).toBe('0 of 2 selected')
  })

  it('keeps external selected IDs while bulk selection changes visible selectable rows', () => {
    render(<SelectableRecordTable initialSelection={{ external: true }} disableSecond />)

    const selectAll = screen.getByRole('checkbox', { name: 'Select all Operations' })
    expect(screen.getByRole('checkbox', { name: 'Select fx.convert' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(selectAll)

    expect(screen.getByTestId('selection-state').textContent).toBe(
      JSON.stringify({ external: true, 'row-1': true }),
    )
    expect(screen.getByRole('status').textContent).toBe('1 of 1 selected')
  })

  it('can defer the live selection announcement to a shared cross-table surface', () => {
    render(<SelectableRecordTable showStatus={false} />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('applies selectedRowClassName only to selected rows (market compare seam)', () => {
    render(<SelectableRecordTable selectedRowClassName="bg-brand-muted" />)

    const first = screen.getByRole('checkbox', { name: 'Select weather.lookup' })
    const rowOf = (name: string) =>
      screen.getByRole('checkbox', { name }).closest('tr') as HTMLElement

    expect(rowOf('Select weather.lookup').className).not.toContain('bg-brand-muted')
    expect(rowOf('Select fx.convert').className).not.toContain('bg-brand-muted')

    fireEvent.click(first)
    expect(rowOf('Select weather.lookup').className).toContain('bg-brand-muted')
    expect(rowOf('Select fx.convert').className).not.toContain('bg-brand-muted')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select fx.convert' }))
    expect(rowOf('Select weather.lookup').className).toContain('bg-brand-muted')
    expect(rowOf('Select fx.convert').className).toContain('bg-brand-muted')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all Operations' }))
    expect(rowOf('Select weather.lookup').className).not.toContain('bg-brand-muted')
    expect(rowOf('Select fx.convert').className).not.toContain('bg-brand-muted')
  })
})

function SelectableRecordTable({
  initialSelection = {},
  disableSecond = false,
  showStatus,
  selectedRowClassName,
}: {
  initialSelection?: RowSelectionState
  disableSecond?: boolean
  showStatus?: boolean
  selectedRowClassName?: string
}) {
  const [selection, setSelection] = useState<RowSelectionState>(initialSelection)
  return (
    <>
      <AeRecordTable
        columns={columns}
        data={rows}
        caption="Operations"
        hideFilter
        getRowId={(row) => row.id}
        selection={{
          state: selection,
          onChange: setSelection,
          getRowLabel: (row) => row.name,
          ...(disableSecond ? { canSelectRow: (row: Row) => row.id !== 'row-2' } : {}),
          ...(showStatus === undefined ? {} : { showStatus }),
        }}
        {...(selectedRowClassName === undefined ? {} : { selectedRowClassName })}
      />
      <div data-testid="selection-state">{JSON.stringify(selection)}</div>
    </>
  )
}
