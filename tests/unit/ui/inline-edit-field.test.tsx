// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InlineEditField } from '@/components/ui/inline-edit-field'

afterEach(cleanup)

function Harness(props: {
  initialValue: string
  onSave: (nextValue: string) => Promise<boolean>
  readOnly?: boolean
}) {
  const [committed, setCommitted] = useState(props.initialValue)
  return (
    <InlineEditField
      value={committed}
      label="Workspace name"
      readOnly={props.readOnly === true}
      errorMessage="Could not save. Try again."
      onSave={async (nextValue) => {
        const accepted = await props.onSave(nextValue)
        if (accepted) setCommitted(nextValue)
        return accepted
      }}
    />
  )
}

function openEditor(): HTMLInputElement {
  fireEvent.click(screen.getByRole('button', { name: 'Workspace name' }))
  return screen.getByRole('textbox', { name: 'Workspace name' }) as HTMLInputElement
}

describe('InlineEditField', () => {
  it('gates the edit affordance behind hover/focus reveal styling in display mode', () => {
    render(<Harness initialValue="Acme Operations" onSave={vi.fn(async () => true)} />)

    expect(screen.getByText('Acme Operations')).toBeTruthy()
    const affordance = screen.getByRole('button', { name: 'Workspace name' })
    // Desktop hover-reveal gate: hidden until the cell group is hovered/focused,
    // always reachable on touch-sized layouts.
    expect(affordance.className).toContain('opacity-100')
    expect(affordance.className).toContain('lg:group-hover/inline-edit:opacity-100')
    expect(affordance.className).toContain('lg:group-focus-within/inline-edit:opacity-100')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows an em-dash branch for empty values while staying editable unless readOnly', () => {
    const onSave = vi.fn(async () => true)
    const { rerender } = render(<Harness initialValue="   " onSave={onSave} />)

    expect(screen.getByLabelText('empty').textContent).toBe('—')
    expect(screen.getByRole('button', { name: 'Workspace name' })).toBeTruthy()

    rerender(<Harness initialValue="   " onSave={onSave} readOnly />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('commits a changed value and closes the editor on success', async () => {
    const onSave = vi.fn(async () => true)
    const view = render(<Harness initialValue="Acme Operations" onSave={onSave} />)

    const input = openEditor()
    expect(input.value).toBe('Acme Operations')
    fireEvent.change(input, { target: { value: 'Acme Renewed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Acme Renewed'))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    view.rerender(<Harness initialValue="Acme Renewed" onSave={onSave} />)
    await waitFor(() => expect(screen.getByText('Acme Renewed')).toBeTruthy())
  })

  it('rolls back the attempted value and surfaces an inline alert when the save fails', async () => {
    const onSave = vi.fn(async () => false)
    render(<Harness initialValue="Acme Operations" onSave={onSave} />)

    const input = openEditor()
    fireEvent.change(input, { target: { value: 'Hostile Rename' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not save. Try again.'))
    expect((screen.getByRole('textbox', { name: 'Workspace name' }) as HTMLInputElement).value)
      .toBe('Acme Operations')

    // A retried save that succeeds still exits cleanly.
    onSave.mockResolvedValueOnce(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Workspace name' }), { target: { value: 'Acme Renewed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })

  it('cancels cleanly on escape without touching the commit seam', async () => {
    const onSave = vi.fn(async () => true)
    render(<Harness initialValue="Acme Operations" onSave={onSave} />)

    const input = openEditor()
    fireEvent.change(input, { target: { value: 'Abandoned Edit' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Acme Operations')).toBeTruthy()
  })
})
