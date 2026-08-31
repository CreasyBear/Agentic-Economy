// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import '../../setup/jsdom-platform'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'

afterEach(cleanup)

describe('AeConfirmDialog', () => {
  it('composes the maintained alert-dialog primitive and returns focus on cancel', async () => {
    render(<ConfirmHarness />)
    const trigger = screen.getByRole('button', { name: 'Disconnect agent' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('alertdialog', { name: 'Disconnect this agent?' })
    expect(dialog.getAttribute('data-slot')).toBe('alert-dialog-content')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep connected' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('blocks duplicate confirmation and dismissal while work is pending', () => {
    const onConfirm = vi.fn()
    render(
      <AeConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Disconnect this agent?"
        description="The agent will lose access."
        confirmLabel="Disconnect"
        pending
        onConfirm={onConfirm}
      />,
    )

    const dialog = screen.getByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: 'Working…' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('blocks duplicate pointer and keyboard activation before pending state propagates', async () => {
    const confirmation = deferred<void>()
    const onConfirm = vi.fn(() => confirmation.promise)
    render(
      <AeConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Disconnect this agent?"
        description="The agent will lose access."
        confirmLabel="Disconnect"
        onConfirm={onConfirm}
      />,
    )

    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Disconnect',
    })
    fireEvent.click(confirm, { detail: 1 })
    fireEvent.click(confirm, { detail: 2 })
    fireEvent.click(confirm, { detail: 0 })

    expect(onConfirm).toHaveBeenCalledTimes(1)

    confirmation.resolve()
    await confirmation.promise
    await Promise.resolve()
    fireEvent.click(confirm, { detail: 0 })
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })
})

function ConfirmHarness() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Disconnect agent</button>
      <AeConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Disconnect this agent?"
        description="The agent will lose access."
        confirmLabel="Disconnect"
        cancelLabel="Keep connected"
        onConfirm={() => setOpen(false)}
        returnFocusRef={triggerRef}
      />
    </>
  )
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}
