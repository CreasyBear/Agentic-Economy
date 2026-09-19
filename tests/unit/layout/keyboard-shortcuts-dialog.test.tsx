// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import {
  KeyboardShortcutsDialog,
  useGlobalShortcuts,
} from '@/components/ae/shortcuts/KeyboardShortcutsDialog'

afterEach(() => {
  cleanup()
})

describe('KeyboardShortcutsDialog', () => {
  it('renders shortcut chips for navigation and traversal', () => {
    render(<KeyboardShortcutsDialog open onOpenChange={() => {}} />)

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(dialog).toBeTruthy()
    expect(screen.getByText('⌘K')).toBeTruthy()
    expect(screen.getByText('⌘B')).toBeTruthy()
    expect(screen.getByText('/')).toBeTruthy()
    expect(screen.getByText('?')).toBeTruthy()
    expect(screen.getByText('Esc')).toBeTruthy()
    expect(screen.getByText('↑ / ↓')).toBeTruthy()
    expect(screen.getByText('↵')).toBeTruthy()
  })

  it('opens when pressing ? on the document', async () => {
    render(<ShortcutsHarness />)

    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()

    fireEvent.keyDown(document, { key: '?' })

    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()
  })

  it('does not open when pressing ? inside an input', () => {
    render(
      <>
        <ShortcutsHarness />
        <input aria-label="Search field" />
      </>,
    )

    const input = screen.getByRole('textbox', { name: 'Search field' })
    input.focus()

    fireEvent.keyDown(input, { key: '?' })

    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
  })

  it('dismisses when pressing Escape', async () => {
    render(<ShortcutsHarness initialOpen />)

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
    })
  })
})

function ShortcutsHarness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  useGlobalShortcuts({
    onOpenShortcuts: () => setOpen(true),
    isShortcutsOpen: open,
  })

  return <KeyboardShortcutsDialog open={open} onOpenChange={setOpen} />
}
