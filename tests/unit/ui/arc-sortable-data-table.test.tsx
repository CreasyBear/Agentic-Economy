// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { SortableDataTable, type DataColumn } from '@/components/arc/sortable-data-table/sortable-data-table'
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
const columns: DataColumn<RecordRow>[] = [
  { key: 'name', label: 'Name' },
  { key: 'display', label: 'Amount', numeric: true, sortValue: row => row.amount },
]
const shownNames = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
  .map(row => within(row).getAllByRole('cell')[0]?.textContent)

describe('Arc sortable data table exact inputs', () => {
  it('sorts exact signed integers behind formatted values, keeps missing values last and ties stable', () => {
    render(<SortableDataTable rows={rows} columns={columns} rowKey="id" animateRows={false} />)
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
    const view = render(<SortableDataTable rows={rows} columns={[
      columns[0]!, { ...columns[1]!, sortDirection: 'asc' },
    ]} rowKey="id" manualSorting animateRows={false} />)
    expect(shownNames()).toEqual(rows.map(row => row.name))
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('status')).toHaveTextContent('Sorted by Amount, ascending')
    fireEvent.click(screen.getByRole('button', { name: /Sort by Amount/ }))
    view.rerender(<SortableDataTable rows={rows} columns={columns} rowKey="id" manualSorting animateRows={false} />)
    expect(shownNames()).toEqual(rows.map(row => row.name))
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'none')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('walks native header controls with arrows and Home/End without moving focus into rows', () => {
    render(<SortableDataTable rows={rows} columns={columns} rowKey="id" animateRows={false} />)
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

  it('uses native Arc sort controls for ordinary AE headers while the existing engine orders records', () => {
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
  return <><SortableDataTable rows={rows.slice(0, 3)} columns={columns} rowKey="id" animateRows={false}
    selectable selectedKeys={selected} onSelectionChange={setSelected} />
    <div aria-label="Selected record IDs">{selected.join(',')}</div></>
}

it('keeps native Arc selection tied to IDs through sorting, supports range selection and clears with Escape', () => {
  render(<SelectedRecords />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Larger' }))
  fireEvent.click(within(screen.getByRole('table')).getAllByRole('row')[3]!, { shiftKey: true })
  expect(screen.getByLabelText('Selected record IDs')).toHaveTextContent('larger,missing,smaller')
  expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
  for (const name of ['Larger', 'Missing', 'Smaller']) expect(screen.getByRole('checkbox', { name: `Select ${name}` })).toBeChecked()
  const last = screen.getByRole('checkbox', { name: 'Select Smaller' })
  last.focus()
  fireEvent.keyDown(last, { key: 'Escape' })
  expect(screen.getByLabelText('Selected record IDs')).toBeEmptyDOMElement()
  expect(last).toHaveFocus()
  expect(screen.getByRole('status')).toHaveTextContent('Selection cleared')
})
