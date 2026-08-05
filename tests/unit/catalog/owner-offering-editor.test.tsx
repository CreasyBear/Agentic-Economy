// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AeOwnerOfferingEditor,
} from '@/components/ae/offerings/AeOwnerOfferings'
import {
  OWNER_OFFERING_DRAFT_STORAGE_KEY,
  emptyOwnerOfferingEditorValue,
  readStoredOfferingDraft,
} from '@/components/ae/offerings/AeOwnerOfferings.exports'
import type { OwnerOfferingEditorValue, OwnerOfferingSaveResult } from '@/components/ae/offerings/AeOwnerOfferings'


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
    fireEvent.click(screen.getByRole('button', { name: /Publish service/i }))

    await waitFor(() => expect(screen.getAllByText(/Add a service name before publishing/i).length).toBeGreaterThan(0))
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

/** The Select trigger opens a listbox, so choosing an option takes two clicks. */
function choose(select: string, option: string): void {
  fireEvent.click(screen.getByRole('combobox', { name: select }))
  fireEvent.click(screen.getByRole('option', { name: option }))
}

describe('owner offering editor publishes a comparable price beside the note', () => {
  it('turns entered dollars into a minor-unit price', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} />)

    // Nothing structured until the owner says what kind of price this is.
    expect(screen.queryByLabelText('Amount')).toBeNull()
    choose('Price type', 'Fixed price')
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '129.50' } })
    choose('Charged per', 'Hour')
    choose('Tax', 'Includes tax')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]?.price).toEqual({
      kind: 'fixed',
      currency: 'AUD',
      amountMinor: 12_950,
      unit: 'hour',
      taxTreatment: 'inclusive',
    })
  })

  it('leaves the free-text pricing note untouched', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Pricing'), { target: { value: 'Call-out fee waived for regulars.' } })
    choose('Price type', 'From')
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const value = onSave.mock.calls[0]?.[0]
    expect(value?.pricingSummary).toBe('Call-out fee waived for regulars.')
    expect(value?.price).toEqual({ kind: 'from', currency: 'AUD', amountMinor: 9_000, taxTreatment: 'unstated' })
  })

  it('reveals a second amount for a range and drops the group until both bounds exist', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} />)

    choose('Price type', 'Fixed price')
    expect(screen.queryByLabelText('Maximum amount')).toBeNull()
    choose('Price type', 'Range')
    expect(screen.getByLabelText('Maximum amount')).toBeTruthy()

    // A lower bound alone would sort and filter against a ceiling the business
    // never published, so the whole group is dropped rather than half-sent.
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]?.price).toBeUndefined()

    fireEvent.change(screen.getByLabelText('Maximum amount'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(onSave.mock.calls[1]?.[0]?.price).toEqual({
      kind: 'range',
      currency: 'AUD',
      amountMinor: 8_000,
      maximumAmountMinor: 15_000,
      taxTreatment: 'unstated',
    })
  })

  it('publishes a quote-only price without asking for an amount', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} />)

    choose('Price type', 'Quoted on request')
    expect(screen.queryByLabelText('Amount')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]?.price).toEqual({ kind: 'quote_only', currency: 'AUD', taxTreatment: 'unstated' })
  })

  it('restores the price group from a parked draft', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    const first = render(
      <AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} draftKey="business-price" />,
    )

    choose('Price type', 'Fixed price')
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '250' } })
    await waitFor(() => expect(readStoredOfferingDraft('business-price')?.price).toEqual({
      kind: 'fixed', currency: 'AUD', amountMinor: 25_000, taxTreatment: 'unstated',
    }))

    first.unmount()
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} draftKey="business-price" />)
    await waitFor(() => expect(screen.getByLabelText('Amount')).toHaveProperty('value', '250'))
  })
})

describe('owner offering editor publishes the external operation contract', () => {
  it('carries the name, method, interface, and authentication the owner gave', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} />)

    choose('Add a contact route', 'Assistant request')
    fireEvent.change(screen.getByLabelText('What this request does'), { target: { value: 'Run a quote query.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add request details' }))
    fireEvent.change(screen.getByLabelText('Request name'), { target: { value: 'Quote query API' } })
    fireEvent.change(screen.getByLabelText('Request URL'), { target: { value: 'https://example.com/api/quote' } })
    choose('Method', 'POST')
    choose('Interface description', 'OpenAPI')
    fireEvent.change(screen.getByLabelText('Authentication'), { target: { value: 'Bearer token issued on request.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add this way' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const descriptor = onSave.mock.calls[0]?.[0]?.accessPaths[0]?.descriptor
    if (descriptor?.kind !== 'external_operation') throw new Error('external operation access path missing')
    expect(descriptor).toEqual({
      kind: 'external_operation',
      name: 'Quote query API',
      summary: 'Run a quote query.',
      url: 'https://example.com/api/quote',
      method: 'POST',
      interfaceDescription: { format: 'OpenAPI' },
      authenticationSummary: 'Bearer token issued on request.',
      provenance: 'business_declared',
    })
    // An untouched field is absent, not an empty string: a caller must be able
    // to tell "not stated" apart from "stated as nothing".
    expect(Object.keys(descriptor)).not.toContain('documentationUrl')
    expect(Object.keys(descriptor)).not.toContain('pricingSummary')
    expect(Object.keys(descriptor.interfaceDescription ?? {})).not.toContain('url')
  })

  it('keeps the published default name when the owner names nothing', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => saved(value))
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} />)

    choose('Add a contact route', 'Assistant request')
    fireEvent.change(screen.getByLabelText('What this request does'), { target: { value: 'Run a quote query.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add request details' }))

    // The gate is still summary plus URL, so a nameless request can be added.
    expect(screen.getByRole('button', { name: 'Add this way' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Request URL'), { target: { value: 'https://example.com/api/quote' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add this way' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0]?.[0]?.accessPaths[0]?.descriptor).toEqual({
      kind: 'external_operation',
      name: 'Assistant request',
      summary: 'Run a quote query.',
      url: 'https://example.com/api/quote',
      provenance: 'business_declared',
    })
  })
})
