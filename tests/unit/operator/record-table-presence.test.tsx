import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { useState } from 'react'

import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'

import { AeSortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import { AeTablePreferencesProvider } from '@/components/ae/operator/AeTablePreferencesContext'

afterEach(() => { cleanup(); window.localStorage.clear() })

type Row = Readonly<{ id: string; name: string }>

const columns: ColumnDef<AeRecordTableFeatures, Row, unknown>[] = [
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

    const filter = screen.getByRole('searchbox', { name: 'Filter rows…' })
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

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter rows…' }), {
      target: { value: 'weather' },
    })
    expect(screen.getByText('weather.lookup')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter rows…' }), {
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

  it('clears a matched search while preserving rows, sort, selection, and focus', () => {
    const sortableColumns: ColumnDef<AeRecordTableFeatures, Row, unknown>[] = [
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
        getRowId={(row) => row.id}
        selection={{
          state: { 'row-1': true },
          onChange: () => undefined,
          getRowLabel: (row) => row.name,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    const table = screen.getByRole('table')
    const visibleNames = () => within(table).getAllByRole('row').slice(1).map((row) => {
      const cells = within(row).getAllByRole('cell')
      return cells[cells.length - 1]?.textContent
    })
    expect(visibleNames()).toEqual([
      'fx.convert',
      'weather.lookup',
    ])

    const filter = screen.getByRole('searchbox', { name: 'Filter rows…' })
    fireEvent.change(filter, {
      target: { value: 'weather' },
    })
    expect((filter as HTMLInputElement).value).toBe('weather')
    expect(visibleNames()).toEqual(['weather.lookup'])
    expect(screen.getByRole('checkbox', { name: 'Select weather.lookup' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect((filter as HTMLInputElement).value).toBe('')
    expect(document.activeElement).toBe(filter)
    expect(visibleNames()).toEqual([
      'fx.convert',
      'weather.lookup',
    ])
    expect(within(table).getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe('ascending')
    expect(screen.getByRole('checkbox', { name: 'Select weather.lookup' }).getAttribute('aria-checked')).toBe('true')
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
    expect(container.querySelector('[data-slot="data-grid"]')).not.toBeNull()
  })

  it('lets native roving focus follow row actions through Arrow and Home/End keys', async () => {
    const opened: string[] = []
    const sortableColumns: ColumnDef<AeRecordTableFeatures, Row, unknown>[] = [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        header: ({ column }) => <AeOperatorSortableHeader label="Name" column={column} />,
        cell: ({ row }) => row.original.name,
      },
    ]
    const { container } = render(
      <AeRecordTable
        columns={sortableColumns}
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

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    const sortedActions = screen.getAllByRole('button', { name: /^View / })
    expect(sortedActions.map((action) => action.getAttribute('aria-label'))).toEqual([
      'View fx.convert',
      'View weather.lookup',
    ])

    const fxAction = screen.getByRole('button', { name: 'View fx.convert' })
    const weatherAction = screen.getByRole('button', { name: 'View weather.lookup' })
    fxAction.focus()
    fireEvent.keyDown(fxAction, { key: 'ArrowDown', code: 'ArrowDown' })
    await waitFor(() => expect(document.activeElement).toBe(weatherAction))
    expect(opened).toEqual(['row-2'])

    fireEvent.keyDown(weatherAction, { key: 'ArrowUp', code: 'ArrowUp' })
    await waitFor(() => expect(document.activeElement).toBe(fxAction))
    fireEvent.keyDown(fxAction, { key: 'Home', code: 'Home' })
    await waitFor(() => expect(document.activeElement).toBe(fxAction))
    fireEvent.keyDown(fxAction, { key: 'End', code: 'End' })
    await waitFor(() => expect(document.activeElement).toBe(weatherAction))
    expect(opened).toEqual(['row-2'])
  })

  it('keeps identity first and gives the trailing action a visible label', () => {
    render(
      <AeRecordTable
        columns={columns}
        data={rows}
        caption="Operations"
        hideFilter
        getRowId={(row) => row.id}
        rowAction={{
          kind: 'button',
          label: 'Inspect',
          onOpen: () => undefined,
          getAccessibleLabel: (row) => `Inspect ${row.name}`,
        }}
      />,
    )

    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Name',
      'Inspect',
    ])
    expect(within(table).getAllByRole('cell').slice(0, 2).map((cell) => cell.textContent)).toEqual([
      'weather.lookup',
      'Inspect',
    ])
  })

  it('composes controlled selected, mixed, all, and clear states with stable IDs', () => {
    render(<SelectableRecordTable />)

    const first = screen.getByRole('checkbox', { name: 'Select weather.lookup' })

    fireEvent.click(first)
    expect(screen.getByRole('checkbox', { name: 'Select weather.lookup' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Select weather.lookup' }).closest('tr')?.getAttribute('data-state')).toBe('selected')
    const selectAll = screen.getByRole('checkbox', { name: 'Select all Operations' })
    expect(selectAll.getAttribute('aria-checked')).toBe('mixed')
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


describe('AeRecordTable server and scoped layout ownership', () => {
  it('keeps the server page order and matching intact while reporting a controlled sort change', () => {
    const onSort = vi.fn()
    render(<AeRecordTable columns={[{
      id: 'name', accessorFn: row => row.name,
      header: ({ column }) => <AeOperatorSortableHeader label="Name" column={column} />,
      cell: ({ row }) => row.original.name,
    }]} data={rows} serverControlled sorting={[]} onSortingChange={onSort}
      filterValue="does-not-match-this-page" getRowId={row => row.id} caption="Server page" />)
    const table = screen.getByRole('table', { name: 'Server page' })
    const names = () => within(table).getAllByRole('row').slice(1).map(row => row.textContent)
    expect(names()).toEqual(['weather.lookup', 'fx.convert'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    expect(onSort).toHaveBeenCalledTimes(1)
    expect(names()).toEqual(['weather.lookup', 'fx.convert'])
  })

  it('stores only bounded layout facts and resets on Account change while retaining exact actions', async () => {
    const layoutColumns: ColumnDef<AeRecordTableFeatures, Row, unknown>[] = [
      ...columns,
      { id: 'reference', accessorFn: row => row.id, header: 'Reference', cell: ({ row }) => row.original.id },
    ]
    const view = (accountRef: string) => <AeTablePreferencesProvider scope={{ actorRef: 'actor:one', accountRef }}>
      <AeRecordTable columns={layoutColumns} data={rows} getRowId={row => row.id} caption="Scoped records"
        rowAction={{ kind: 'button', label: 'Inspect', onOpen: () => undefined, getAccessibleLabel: row => `Inspect ${row.id}` }} />
    </AeTablePreferencesProvider>
    const { rerender } = render(view('account:one'))
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Reference' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Reference' })).toBeNull())
    const savedKey = Object.keys(window.localStorage).find(key => key.startsWith('ae:table-layout:'))
    expect(savedKey).toContain('account:one')
    const saved = JSON.parse(window.localStorage.getItem(savedKey!)!)
    expect(saved).toEqual({ version: 1, columnVisibility: { reference: false }, columnSizing: {}, density: 'comfortable' })
    expect(screen.getByRole('button', { name: 'Inspect row-1' })).toBeTruthy()
    rerender(view('account:two'))
    expect(screen.getByRole('columnheader', { name: 'Reference' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Inspect row-1' })).toBeTruthy()
  })

  it('drops unknown columns, invalid widths and protected action hiding from restored preferences', async () => {
    const key = `ae:table-layout:${JSON.stringify(['actor:one', 'account:one', 'Restored', 1, 'h:name\u0000p:__ae_action'])}`
    window.localStorage.setItem(key, JSON.stringify({ version: 1,
      columnVisibility: { name: false, __ae_action: false, unknown: false },
      columnSizing: { name: -1, __ae_action: 100, unknown: 9_999 }, density: 'invalid',
      command: { operationKey: 'not-a-layout-fact' },
    }))
    render(<AeTablePreferencesProvider scope={{ actorRef: 'actor:one', accountRef: 'account:one' }}>
      <AeRecordTable columns={columns} data={rows} getRowId={row => row.id} caption="Restored"
        rowAction={{ kind: 'button', label: 'Inspect', onOpen: () => undefined, getAccessibleLabel: row => `Inspect ${row.id}` }} />
    </AeTablePreferencesProvider>)
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Inspect row-1' })).toBeTruthy()
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({
      version: 1, columnVisibility: {}, columnSizing: { __ae_action: 100 }, density: 'comfortable',
    }))
  })
})

describe('AeRecordTable simple table rules', () => {
  it('folds rows into cards on phones by default and keeps the full value of truncated cells on hover', () => {
    const truncated: ColumnDef<AeRecordTableFeatures, Row, unknown>[] = [
      { id: 'name', accessorFn: (row) => row.name, header: 'Name', meta: { truncate: true } },
    ]
    render(<AeRecordTable columns={truncated} data={rows} caption="Operations" hideFilter layoutControls={false} />)
    const table = screen.getByRole('table', { name: 'Operations' })
    expect(table.closest('[data-mobile-layout]')?.getAttribute('data-mobile-layout')).toBe('cards')
    expect(screen.getByText('weather.lookup').getAttribute('title')).toBe('weather.lookup')
  })

  it('never uses an internal sort value as the hover title of a truncated cell', () => {
    const at = new Date('2026-10-01T00:00:00Z')
    render(<AeSortableDataTable rows={[{ id: 'row-1', at }]} rowKey="id" caption="Dated"
      columns={[{ key: 'at', label: 'Updated', truncate: true, render: () => 'Oct 1' }]} />)
    expect(screen.getByText('Oct 1').closest('[title]')?.getAttribute('title') ?? null).not.toBe(String(at.getTime()))
  })
})
