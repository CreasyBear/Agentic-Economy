/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'

afterEach(cleanup)

function DialogFixture() {
  const [open, setOpen] = useState(true)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Dialog fixture</DialogTitle>
        <button type="button">Dialog action</button>
      </DialogContent>
    </Dialog>
  )
}

function SheetFixture() {
  const [open, setOpen] = useState(true)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent showCloseButton={false}>
        <SheetTitle>Sheet fixture</SheetTitle>
        <button type="button">Sheet action</button>
      </SheetContent>
    </Sheet>
  )
}

describe('shared modal lifecycle', () => {
  it('exposes truthful aria-modal semantics on Dialog and Sheet content', () => {
    const dialogView = render(<DialogFixture />)
    expect(screen.getByRole('dialog', { name: 'Dialog fixture' }).getAttribute('aria-modal')).toBe('true')
    dialogView.unmount()

    render(<SheetFixture />)
    expect(screen.getByRole('dialog', { name: 'Sheet fixture' }).getAttribute('aria-modal')).toBe('true')
  })

  it('closes a Dialog on Escape and removes its portal from the tab and hit trees', async () => {
    render(<DialogFixture />)

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Dialog fixture' })).toBeNull()
      expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull()
      expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    })
  })

  it('closes a Sheet on Escape and removes its portal from the tab and hit trees', async () => {
    render(<SheetFixture />)

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Sheet fixture' })).toBeNull()
      expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull()
      expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
    })
  })
})
