// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AeOwnerOfferingEditor,
  OWNER_OFFERING_DRAFT_STORAGE_KEY,
  emptyOwnerOfferingEditorValue,
  readStoredOfferingDraft,
} from '@/components/ae/offerings/AeOwnerOfferings'
import type { OwnerOfferingEditorValue, OwnerOfferingSaveResult } from '@/components/ae/offerings/AeOwnerOfferings'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

beforeEach(() => {
  // This repo does not enable testing-library auto-cleanup, so renders would
  // otherwise accumulate in document.body across cases.
  cleanup()
  window.sessionStorage.clear()
})

function saved(value: OwnerOfferingEditorValue): OwnerOfferingSaveResult {
  return { kind: 'saved', value, message: 'Saved.' }
}

describe('owner offering editor is draft-first', () => {
  it('saves a draft that has no name, category, or summary', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} />)

    // Dirty the form without filling any of the previously required fields.
    fireEvent.change(screen.getAllByLabelText(/Service area/i)[0] as HTMLElement, { target: { value: 'Adelaide' } })
    fireEvent.click(screen.getByRole('button', { name: /Save draft/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]?.name).toBe('')
  })

  it('refuses to publish and names the missing field', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    render(
      <AeOwnerOfferingEditor
        initialValue={{ ...emptyOwnerOfferingEditorValue, status: 'published' }}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getAllByLabelText(/Service area/i)[0] as HTMLElement, { target: { value: 'Adelaide' } })
    fireEvent.click(screen.getByRole('button', { name: /Publish Offering/i }))

    await waitFor(() => expect(screen.getAllByText(/Add a name before publishing/i).length).toBeGreaterThan(0))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('keeps a draft across a remount and clears it once saved', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    const first = render(
      <AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} draftKey="business-1" />,
    )

    fireEvent.change(screen.getAllByLabelText(/^Name/i)[0] as HTMLElement, { target: { value: 'Burst pipe repair' } })
    await waitFor(() => expect(readStoredOfferingDraft('business-1')?.name).toBe('Burst pipe repair'))
    expect(window.sessionStorage.getItem(`${OWNER_OFFERING_DRAFT_STORAGE_KEY}:business-1`)).not.toBeNull()

    first.unmount()
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} draftKey="business-1" />)
    await waitFor(() => expect(screen.getByDisplayValue('Burst pipe repair')).toBeDefined())

    fireEvent.change(screen.getAllByLabelText(/Service area/i)[0] as HTMLElement, { target: { value: 'Adelaide' } })
    fireEvent.click(screen.getByRole('button', { name: /Save draft/i }))
    await waitFor(() => expect(readStoredOfferingDraft('business-1')).toBeUndefined())
  })

  it('offers a one-click start from the owner previous category', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    render(
      <AeOwnerOfferingEditor
        initialValue={emptyOwnerOfferingEditorValue}
        onSave={onSave}
        seed={{ label: 'Emergency plumbing', value: { category: 'Emergency plumbing' } }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Start from Emergency plumbing/i }))

    await waitFor(() => expect(screen.getByDisplayValue('Emergency plumbing')).toBeDefined())
  })
})
