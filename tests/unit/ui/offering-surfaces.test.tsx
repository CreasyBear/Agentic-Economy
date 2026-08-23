/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AeOwnerOfferingEditor,
  AeOwnerOfferingsList,
} from '@/components/ae/offerings/AeOwnerOfferings'
import { emptyOwnerOfferingEditorValue, toOwnerOfferingSummary } from '@/components/ae/offerings/AeOwnerOfferings.exports'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { PublicOfferingSupplyProjection } from '@/modules/catalog/public'


afterEach(cleanup)

describe('Offering market surfaces', () => {
  it('teaches the owner the first useful action without requiring a contact route', () => {
    render(<AeOwnerOfferingsList offerings={[]} />)
    expect(screen.getByRole('heading', { name: 'Publish your first Operation' })).toBeTruthy()
    expect(screen.getByLabelText('Operation summary').textContent).toContain('Published')
    expect(screen.getByRole('heading', { name: 'No Operations yet' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add Operation' }).getAttribute('href')).toBe('/owner/offerings/new')
  })

  it('renders compact owner service rows and an explicit page-update recovery', () => {
    const projection = projectionFixture()
    render(<AeOwnerOfferingsList offerings={[toOwnerOfferingSummary(projection)]} projectionState="projection_pending" onRetryProjection={vi.fn()} />)
    expect(screen.getByText('Your public page is still updating')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try publishing again' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy()
  })
  it('uses progressive disclosure for request fields and blocks duplicate saves', async () => {
    let resolveSave: ((value: unknown) => void) | undefined
    const onSave = vi.fn(() => new Promise((resolve) => { resolveSave = resolve }))
    render(<AeOwnerOfferingEditor initialValue={{ ...emptyOwnerOfferingEditorValue, name: 'Data query', category: 'Data', summary: 'Query indexed data.' }} onSave={onSave as never} />)

    expect(screen.getByLabelText('Operation setup').textContent).toContain('Describe')
    expect(screen.getByLabelText('Operation setup').textContent).toContain('Connect')
    expect(screen.getByLabelText('Operation setup').textContent).toContain('Publish')
    expect(screen.queryByLabelText('Request URL')).toBeNull()
    fireEvent.click(screen.getByRole('combobox', { name: 'Add a contact route' }))
    fireEvent.click(screen.getByRole('option', { name: 'Agent request' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add request details' }))
    expect(screen.getByLabelText('Request URL')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Data query updated' } })
    const save = screen.getByRole('button', { name: 'Save draft' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
    resolveSave?.({ kind: 'saved', value: { ...emptyOwnerOfferingEditorValue, name: 'Data query updated', category: 'Data', summary: 'Query indexed data.' }, message: 'Saved.' })
    await waitFor(() => expect(screen.getByText('Operation saved')).toBeTruthy())
  })

  it('requires an HTTPS website address and retains it in the human access descriptor', () => {
    const onSave = vi.fn(async (value) => ({ kind: 'saved' as const, value, message: 'Saved.' }))
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} />)

    fireEvent.click(screen.getByRole('combobox', { name: 'Add a contact route' }))
    fireEvent.click(screen.getByRole('option', { name: 'Website' }))
    fireEvent.change(screen.getByLabelText('Access instructions'), { target: { value: 'Start your request online.' } })
    fireEvent.change(screen.getByLabelText('Website URL'), { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add this way' }))

    expect(screen.getByRole('alert').textContent).toContain('full HTTPS website address')
    expect(screen.getByLabelText('Website URL').getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByText('Start your request online.', { selector: 'li *' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Website URL'), { target: { value: 'https://example.com/start' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add this way' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Online service' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Services' } })
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Request the service online.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      accessPaths: [expect.objectContaining({
        descriptor: {
          kind: 'human_request',
          channel: 'website',
          disclosure: 'Start your request online.',
          url: 'https://example.com/start',
        },
      })],
    }))
  })

  it('locks a partially saved payload so retry replays the identical operation', async () => {
    const value = { ...emptyOwnerOfferingEditorValue, name: 'Data query', category: 'Data', summary: 'Query indexed data.' }
    const onSave = vi.fn()
      .mockResolvedValueOnce({ kind: 'refused', message: 'The public state was not changed.', retry: { offeringRef: 'offering:1', currentRevision: 1, completedSteps: ['details'] } })
      .mockResolvedValueOnce({ kind: 'saved', value: { ...value, offeringRef: brandNonEmpty('offering:1', 'OfferingRef'), expectedRevision: 1 }, message: 'Saved.' })
    render(<AeOwnerOfferingEditor initialValue={value} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Data query updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry save' })).toBeTruthy())

    expect(screen.getByLabelText('Name')).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect(onSave.mock.calls[1]?.[0]).toEqual(onSave.mock.calls[0]?.[0])
  })
})

function projectionFixture(): PublicOfferingSupplyProjection {
  return {
    offering: {
      offeringRef: brandNonEmpty('offering:blockchain-query', 'OfferingRef'),
      revision: 2,
      name: 'Blockchain data query',
      category: 'Data',
      summary: 'Query indexed blockchain data.',
      pricingSummary: 'Usage based',
      price: { kind: 'fixed', amount: { currency: 'AUD', units: '4200', exponent: 2 }, unit: 'item', taxTreatment: 'inclusive' },
    },
    accessPaths: [{
      accessPathRef: brandNonEmpty('access:blockchain-query', 'AccessPathRef'),
      offeringRevision: 2,
      offeringSourceHash: canonicalDigest('offering-surfaces:blockchain-query'),
      sourceHash: canonicalDigest('offering-surfaces:access:blockchain-query'),
      descriptor: {
        kind: 'external_operation',
        name: 'GraphQL endpoint',
        summary: 'Quotes this published offering through the labelled sandbox provider.',
        url: 'https://example.com/api/query',
        method: 'POST',
        documentationUrl: 'https://example.com/docs',
        provenance: 'business_declared',
      },
    }],
    support: { integrated: true, routeable: true, reasons: [], observedAt: 1_900_000_000_000 },
  }
}
