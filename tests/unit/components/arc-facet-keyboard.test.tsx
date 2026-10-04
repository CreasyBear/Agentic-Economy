/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { ChipGroup } from '@/components/arc/chip-group/chip-group'
import { Combobox } from '@/components/arc/combobox/combobox'

afterEach(cleanup)

const CHIP_OPTIONS = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
  { value: 'omega', label: 'Omega' },
]

function StatefulChipGroup({ onValueChange }: { onValueChange: (value: string[]) => void }) {
  const [value, setValue] = useState<string[]>([])
  return <ChipGroup
    options={CHIP_OPTIONS}
    value={value}
    onValueChange={next => { onValueChange(next); setValue(next) }}
    label="Sources"
    maxVisible={1}
  />
}

function renderFullySelectedChipGroup(onValueChange: (value: string[]) => void) {
  const view = render(
    <>
      <button type="button">Outside filter</button>
      <StatefulChipGroup onValueChange={onValueChange} />
    </>,
  )
  fireEvent.click(screen.getByRole('button', { name: '+2 more' }), { detail: 1 })
  for (const option of CHIP_OPTIONS) fireEvent.click(screen.getByRole('button', { name: option.label }))
  return view
}

describe('Arc facet keyboard behavior', () => {
  it('starts at enabled boundaries, skips disabled options, commits Enter, and preserves selection on Escape', () => {
    const onValueChange = vi.fn()
    render(
      <Combobox
        label="Source"
        options={[
          { value: 'alpha', label: 'Alpha' },
          { value: 'disabled', label: 'Unavailable', disabled: true },
          { value: 'omega', label: 'Omega' },
        ]}
        onValueChange={onValueChange}
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Source' })
    act(() => input.focus())
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(input).toHaveAttribute('aria-activedescendant', `${input.id}-option-omega`)
    expect(screen.getByRole('option', { name: 'Omega' })).toHaveAttribute('data-active', 'true')
    expect(onValueChange).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('omega')
    expect(input).toHaveValue('Omega')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', `${input.id}-option-alpha`)
    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('data-active', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', `${input.id}-option-omega`)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input).toHaveAttribute('aria-activedescendant', `${input.id}-option-alpha`)

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('Omega')
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('omega')
  })

  it('moves keyboard focus before a collapsed overflow button exits', () => {
    const onValueChange = vi.fn()
    const { container } = renderFullySelectedChipGroup(onValueChange)

    const showLess = screen.getByRole('button', { name: 'Show less' })
    act(() => showLess.focus())
    expect(showLess).toHaveFocus()
    onValueChange.mockClear()
    fireEvent.click(showLess, { detail: 0 })

    const alpha = screen.getByRole('button', { name: 'Alpha' })
    expect(alpha).toHaveFocus()
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Show less' })).not.toBeInTheDocument()

    for (const outgoingMore of container.querySelectorAll('button[data-more][aria-hidden="true"]')) {
      expect(outgoingMore).toHaveAttribute('tabindex', '-1')
      expect(outgoingMore).toBeDisabled()
    }
  })

  it('also hands focus off when pointer activation removes the focused overflow button', () => {
    const onValueChange = vi.fn()
    const { container } = renderFullySelectedChipGroup(onValueChange)
    const showLess = screen.getByRole('button', { name: 'Show less' })
    act(() => showLess.focus())
    onValueChange.mockClear()
    fireEvent.click(showLess, { detail: 1 })

    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveFocus()
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Show less' })).not.toBeInTheDocument()
    for (const outgoingMore of container.querySelectorAll('button[data-more][aria-hidden="true"]')) {
      expect(outgoingMore).toHaveAttribute('tabindex', '-1')
      expect(outgoingMore).toBeDisabled()
    }
  })

  it('leaves focus on another control when pointer collapse removes the overflow button', () => {
    const onValueChange = vi.fn()
    renderFullySelectedChipGroup(onValueChange)

    const outside = screen.getByRole('button', { name: 'Outside filter' })
    act(() => outside.focus())
    onValueChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }), { detail: 1 })

    expect(outside).toHaveFocus()
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('hides exiting Combobox controls and keeps focus on the input after clear and close', () => {
    const { container } = render(
      <Combobox
        label="Source"
        defaultValue="alpha"
        options={[{ value: 'alpha', label: 'Alpha' }, { value: 'omega', label: 'Omega' }]}
      />,
    )

    const input = screen.getByRole('combobox', { name: 'Source' })
    act(() => input.focus())
    const clear = screen.getByRole('button', { name: 'Clear selection' })
    act(() => clear.focus())
    fireEvent.click(clear)
    expect(input).toHaveFocus()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()

    for (const listbox of container.querySelectorAll('[role="listbox"]')) {
      const popover = listbox.closest('[aria-hidden="true"]')
      expect(popover).toHaveAttribute('inert')
    }
    for (const exitingClear of container.querySelectorAll('button[aria-label="Clear selection"]')) {
      expect(exitingClear).toHaveAttribute('aria-hidden', 'true')
      expect(exitingClear).toHaveAttribute('tabindex', '-1')
      expect(exitingClear).toBeDisabled()
    }
  })
})
