// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import type { RowSelectionState } from '@tanstack/react-table'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeSortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import type { AeDataColumn } from '@/components/ae/shared/sortable-data-table/sortable-data-table.contracts'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'

afterEach(cleanup)

type RecordRow = { id: string; name: string; amount: bigint | undefined; display: string }
const rows: RecordRow[] = [
  { id: 'larger', name: 'Larger', amount: 9007199254740993n, display: '9,007,199,254,740,993' },
  { id: 'missing', name: 'Missing', amount: undefined, display: 'Not reported' },
  { id: 'smaller', name: 'Smaller', amount: 9007199254740992n, display: '9,007,199,254,740,992' },
  { id: 'negative', name: 'Negative', amount: -9007199254740993n, display: '-9,007,199,254,740,993' },
  { id: 'equal', name: 'Equal', amount: 9007199254740992n, display: '9,007,199,254,740,992' },
]
const columns: AeDataColumn<RecordRow>[] = [
  { key: 'name', label: 'Name' },
  { key: 'display', label: 'Amount', numeric: true, sortValue: row => row.amount },
]
const shownNames = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
  .map(row => within(row).getAllByRole('cell')[0]?.textContent)

describe('Shared ReUI table exact inputs', () => {
  it('sorts exact signed integers behind formatted values, keeps missing values last and ties stable', () => {
    render(<AeSortableDataTable rows={rows} columns={columns} rowKey="id" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Amount' }))
    expect(shownNames()).toEqual(['Negative', 'Smaller', 'Equal', 'Larger', 'Missing'])
    expect(screen.getByRole('status')).toHaveTextContent('Sorted by Amount, ascending')
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(screen.getByRole('button', { name: /Sort by Amount/ }))
    expect(shownNames()).toEqual(['Larger', 'Smaller', 'Equal', 'Negative', 'Missing'])
    expect(screen.getByRole('status')).toHaveTextContent('Sorted by Amount, descending')
    expect(rows.map(row => row.id)).toEqual(['larger', 'missing', 'smaller', 'negative', 'equal'])
    expect(screen.getByText('9,007,199,254,740,993')).toBeInTheDocument()
    expect(screen.getByText('Not reported')).toBeInTheDocument()
  })

  it('keeps caller order under controlled sorting and exposes the supplied direction', () => {
    const view = render(<AeSortableDataTable rows={rows} columns={[
      columns[0]!, { ...columns[1]!, sortDirection: 'asc' },
    ]} rowKey="id" manualSorting />)
    expect(shownNames()).toEqual(rows.map(row => row.name))
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('status')).toHaveTextContent('Sorted by Amount, ascending')
    fireEvent.click(screen.getByRole('button', { name: /Sort by Amount/ }))
    view.rerender(<AeSortableDataTable rows={rows} columns={columns} rowKey="id" manualSorting />)
    expect(shownNames()).toEqual(rows.map(row => row.name))
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'none')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('walks native header controls with arrows and Home/End without moving focus into rows', () => {
    render(<AeSortableDataTable rows={rows} columns={columns} rowKey="id" />)
    const first = screen.getByRole('button', { name: 'Sort by Name' })
    const last = screen.getByRole('button', { name: 'Sort by Amount' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Home' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'End' })
    expect(last).toHaveFocus()
    expect(screen.getByRole('table').querySelector('tbody tr[tabindex]')).toBeNull()
  })

  it('uses maintained ReUI sort controls for ordinary AE headers while the existing engine orders records', () => {
    render(<AeRecordTable data={rows} columns={[{ accessorKey: 'name', header: 'Name' }]}
      getRowId={row => row.id} hideFilter />)
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    expect(shownNames()).toEqual(['Equal', 'Larger', 'Missing', 'Negative', 'Smaller'])
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(screen.getByRole('button', { name: /Sort by Name/ }))
    expect(shownNames()).toEqual(['Smaller', 'Negative', 'Missing', 'Larger', 'Equal'])
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending')
    expect(rows.map(row => row.id)).toEqual(['larger', 'missing', 'smaller', 'negative', 'equal'])
  })
})

function SelectedRecords() {
  const [selected, setSelected] = useState<string[]>([])
  return <><AeSortableDataTable rows={rows.slice(0, 3)} columns={columns} rowKey="id"
    selectable selectedKeys={selected} onSelectionChange={setSelected} />
    <div aria-label="Selected record IDs">{selected.join(',')}</div></>
}

it('keeps shared selection tied to IDs through sorting, supports range selection and clears with Escape', async () => {
  render(<SelectedRecords />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Larger' }))
  fireEvent.click(within(screen.getByRole('table')).getAllByRole('row')[3]!, { shiftKey: true })
  expect(screen.getByLabelText('Selected record IDs')).toHaveTextContent('larger,missing,smaller')
  expect(screen.getByRole('checkbox', { name: 'Select all Data table' })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
  for (const name of ['Larger', 'Missing', 'Smaller']) expect(screen.getByRole('checkbox', { name: `Select ${name}` })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
  fireEvent.keyDown(await screen.findByRole('menuitemcheckbox', { name: 'Amount' }), { key: 'Escape' })
  expect(screen.getByLabelText('Selected record IDs')).toHaveTextContent('larger,missing,smaller')
  const last = screen.getByRole('checkbox', { name: 'Select Smaller' })
  last.focus()
  fireEvent.keyDown(last, { key: 'Escape' })
  expect(screen.getByLabelText('Selected record IDs')).toBeEmptyDOMElement()
  expect(last).toHaveFocus()
  expect(screen.getByRole('status')).toHaveTextContent('Selection cleared')
})

it('keeps anonymous layout controls local and preserves filtering while sorting and hiding a column', async () => {
  const view = render(<AeRecordTable data={rows} getRowId={row => row.id} caption="Local records" columns={[
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'display', header: 'Amount' },
  ]} />)
  const filter = screen.getByPlaceholderText('Filter rows…')
  fireEvent.change(filter, { target: { value: 'Larger' } })
  expect(shownNames()).toEqual(['Larger'])
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
  fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Amount' }))
  expect(screen.queryByRole('columnheader', { name: /Amount/ })).toBeNull()
  expect(filter).toHaveValue('Larger')
  expect(shownNames()).toEqual(['Larger'])
  expect(Object.keys(window.localStorage).filter(key => key.startsWith('ae:table-layout:'))).toEqual([])
  expect(screen.getByRole('table').querySelector('[data-slot="data-grid-table-resize-handle"]')).not.toBeNull()
  view.rerender(<AeRecordTable data={rows} getRowId={row => row.id} caption="Another local table" filterValue="Larger"
    columns={[{ accessorKey: 'name', header: 'Name' }, { accessorKey: 'display', header: 'Amount' }]} />)
  expect(screen.getByRole('columnheader', { name: /Amount/ })).toBeTruthy()
  expect(screen.getByPlaceholderText('Filter rows…')).toHaveValue('Larger')
})

it('keeps guarded rows out of range selection and lets keyboard traversal follow the current order', () => {
  function GuardedRows() {
    const [selected, setSelected] = useState<RowSelectionState>({})
    return <><AeRecordTable data={rows.slice(0, 3)} getRowId={row => row.id} caption="Guarded rows"
      columns={[{ accessorKey: 'name', header: 'Name' }]} hideFilter keyboardNavigation
      selection={{ state: selected, onChange: setSelected, getRowLabel: row => row.name,
        rowInteraction: true, canSelectRow: row => row.id !== 'missing' }} />
      <output aria-label="Guarded selection">{Object.keys(selected).filter(id => selected[id]).join(',')}</output></>
  }
  render(<GuardedRows />)
  const first = screen.getByRole('checkbox', { name: 'Select Larger' })
  fireEvent.click(first)
  fireEvent.click(within(screen.getByRole('table')).getAllByRole('row')[3]!, { shiftKey: true })
  expect(screen.getByLabelText('Guarded selection')).toHaveTextContent('larger,smaller')
  expect(screen.getByRole('checkbox', { name: 'Select Missing' })).toBeDisabled()
  first.focus()
  fireEvent.keyDown(first, { key: 'ArrowDown' })
  expect(screen.getByRole('checkbox', { name: 'Select Smaller' })).toHaveFocus()
})
