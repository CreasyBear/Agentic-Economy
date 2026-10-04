/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { ConsentToolAccessFieldset } from '@/components/ae/agent-access/authorize-form/components/ConsentToolAccessFieldset'
import type { ConsentToolAccessFieldsetProps } from '@/components/ae/agent-access/authorize-form/authorize-form.contracts'

function props(overrides: Partial<ConsentToolAccessFieldsetProps> = {}): ConsentToolAccessFieldsetProps {
  return {
    pending: false,
    toolAccess: 'all_admitted',
    approvedToolAccess: 'selected_tools',
    approvedToolRefs: [],
    toolQuery: 'invoice',
    toolSearch: { pending: false },
    approvedToolRefSet: new Set<string>(),
    onApprovedToolAccessChange: vi.fn(),
    onToolQueryChange: vi.fn(),
    onFindTools: vi.fn(),
    onContinueSearch: vi.fn(),
    onAddApprovedTool: vi.fn(),
    onRemoveApprovedTool: vi.fn(),
    ...overrides,
  }
}

function Harness({ initial }: { initial: ConsentToolAccessFieldsetProps }) {
  const [query, setQuery] = useState(initial.toolQuery)
  return <ConsentToolAccessFieldset {...initial} toolQuery={query} onToolQueryChange={value => {
    initial.onToolQueryChange(value)
    setQuery(value)
  }} />
}

afterEach(cleanup)

it('clears only the draft query and returns focus without searching or changing approved Tools', () => {
  const initial = props()
  render(<Harness initial={initial} />)
  const query = screen.getByRole('searchbox', { name: 'Find an admitted Tool' })

  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

  expect(query).toHaveValue('')
  expect(query).toHaveFocus()
  expect(initial.onToolQueryChange).toHaveBeenCalledExactlyOnceWith('')
  expect(initial.onFindTools).not.toHaveBeenCalled()
  expect(initial.onApprovedToolAccessChange).not.toHaveBeenCalled()
  expect(initial.onAddApprovedTool).not.toHaveBeenCalled()
  expect(initial.onRemoveApprovedTool).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Search Tools' })).toBeDisabled()
})

it('searches once on Enter without submitting the containing consent form', () => {
  const initial = props()
  const submit = vi.fn()
  render(<form onSubmit={event => { event.preventDefault(); submit() }}><Harness initial={initial} /></form>)
  const query = screen.getByLabelText('Find an admitted Tool')
  fireEvent.change(query, { target: { value: 'invoice prices' } })
  expect(initial.onFindTools).not.toHaveBeenCalled()

  expect(fireEvent.keyDown(query, { key: 'Enter' })).toBe(false)

  expect(initial.onFindTools).toHaveBeenCalledOnce()
  expect(submit).not.toHaveBeenCalled()
  expect(query).toHaveValue('invoice prices')
})

it('keeps the query, clear and search controls disabled while consent is pending', () => {
  const initial = props({ pending: true })
  render(<Harness initial={initial} />)
  const query = screen.getByLabelText('Find an admitted Tool')
  expect(query).toBeDisabled()
  act(() => { query.focus(); screen.getByRole('button', { name: 'Search Tools' }).click() })
  expect(query).not.toHaveFocus()
  const clear = screen.queryByRole('button', { name: 'Clear search' })
  if (clear !== null) {
    expect(clear).toBeDisabled()
    act(() => { clear.click() })
  }
  expect(query).toHaveValue('invoice')
  expect(initial.onToolQueryChange).not.toHaveBeenCalled()
  expect(initial.onFindTools).not.toHaveBeenCalled()
})

it('preserves both empty-selection and search-error descriptions on the query', () => {
  render(<Harness initial={props({ toolSearch: { pending: false, error: 'Search is unavailable.' } })} />)
  const query = screen.getByLabelText('Find an admitted Tool')
  expect(query).toHaveAttribute('aria-invalid', 'true')
  expect(query).toHaveAttribute('aria-describedby', 'tool-selection-empty tool-search-error')
  expect(document.getElementById('tool-selection-empty')).toBeInTheDocument()
  expect(document.getElementById('tool-search-error')).toHaveTextContent('Search is unavailable.')
})
