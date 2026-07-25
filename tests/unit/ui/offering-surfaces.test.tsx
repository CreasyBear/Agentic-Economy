/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeOfferingSupplyList } from '@/components/ae/offerings/AeOfferingSupplyList'
import { offeringApiDtoToSupplyView } from '@/components/ae/offerings/offering-presentation'
import { AeProviderCard } from '@/components/ae/primitives/AeProviderCard'
import {
  AeOwnerOfferingEditor,
  AeOwnerOfferingsList,
  emptyOwnerOfferingEditorValue,
  toOwnerOfferingSummary,
} from '@/components/ae/offerings/AeOwnerOfferings'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicOfferingSupplyProjection } from '@/modules/catalog/public'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

afterEach(cleanup)

describe('Offering market surfaces', () => {
  it('keeps a profile useful when no Offerings are published', () => {
    render(<AeOfferingSupplyList offerings={[]} />)
    expect(screen.getByRole('heading', { name: 'What this business offers' })).toBeTruthy()
    expect(screen.getByText('No offerings are published yet')).toBeTruthy()
  })

  it('separates declared endpoint provenance from earned AE support', () => {
    render(<AeOfferingSupplyList offerings={[projectionFixture()]} />)

    expect(screen.getByRole('heading', { name: 'Blockchain data query' })).toBeTruthy()
    expect(screen.getByText('Ways to get started')).toBeTruthy()
    expect(screen.getByText('Published by the business')).toBeTruthy()
    expect(screen.getByText('AE can carry out this action')).toBeTruthy()
    expect(screen.queryByText(/verified/i)).toBeNull()
    expect(screen.queryByText('POST')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }))
    expect(screen.getByText('POST')).toBeTruthy()
    expect(screen.getByText('https://example.com/api/query')).toBeTruthy()
  })

  it('adapts the safe v2 API without restoring internal support vocabulary', () => {
    const view = offeringApiDtoToSupplyView(v2BusinessFixture())
    render(<AeOfferingSupplyList {...view} />)
    expect(screen.getByRole('link', { name: 'Website' }).getAttribute('href')).toBe('https://example.com/start')
    expect(screen.queryByText(/routeable|binding|capability/i)).toBeNull()
  })

  it('uses the first two Offerings and compact access summary in registry cards', () => {
    render(<AeProviderCard variant="registry" item={{ ...v2BusinessFixture(), offerings: [
      ...v2BusinessFixture().offerings,
      { offeringRef: 'offering:second', revision: 1, name: 'Second Offering', category: 'Data', summary: 'Second.', accessPaths: [], support: { integrated: false, aeSupportedAction: false } },
      { offeringRef: 'offering:third', revision: 1, name: 'Hidden third Offering', category: 'Data', summary: 'Third.', accessPaths: [], support: { integrated: false, aeSupportedAction: false } },
    ] }} />)
    expect(screen.getByLabelText('Published services').textContent).toContain('Data lookup')
    expect(screen.getByLabelText('Published services').textContent).toContain('Second Offering')
    expect(screen.queryByText('Hidden third Offering')).toBeNull()
    // Every business can be contacted, so contactability is not a badge.
    expect(screen.queryByText('Contact available')).toBeNull()
  })

  it('keeps a profile-only business visible in the v2 registry card', () => {
    render(<AeProviderCard variant="registry" item={{ ...v2BusinessFixture(), offerings: [], accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false } }} />)
    expect(screen.getByText('V2 Business')).toBeTruthy()
    expect(screen.queryByText('No Offerings published yet')).toBeNull()
    expect(screen.queryByText('No contact or endpoint published yet')).toBeNull()
  })

  it('shows last-safe public facts when projection freshness degrades', () => {
    render(<AeOfferingSupplyList offerings={[projectionFixture()]} disposition="stale" observedAt={1_900_000_000_000} />)
    expect(screen.getByText('These are the last safely published details')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Blockchain data query' })).toBeTruthy()
  })

  it('teaches the owner the first useful action without requiring an access path', () => {
    render(<AeOwnerOfferingsList offerings={[]} />)
    expect(screen.getByRole('heading', { name: 'Show people what you do' })).toBeTruthy()
    expect(screen.getByLabelText('Offering summary').textContent).toContain('Published')
    expect(screen.getByRole('heading', { name: 'Add your first Offering' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add an Offering' }).getAttribute('href')).toBe('/owner/offerings/new')
  })

  it('renders compact owner Offering rows and an explicit projection-pending recovery', () => {
    const projection = projectionFixture()
    render(<AeOwnerOfferingsList offerings={[toOwnerOfferingSummary(projection)]} projectionState="projection_pending" onRetryProjection={vi.fn()} />)
    expect(screen.getByText('Public details are still updating')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry publishing' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy()
  })

  it('uses progressive disclosure for endpoint fields and blocks duplicate saves', async () => {
    let resolveSave: ((value: unknown) => void) | undefined
    const onSave = vi.fn(() => new Promise((resolve) => { resolveSave = resolve }))
    render(<AeOwnerOfferingEditor initialValue={{ ...emptyOwnerOfferingEditorValue, name: 'Data query', category: 'Data', summary: 'Query indexed data.' }} onSave={onSave as never} />)

    expect(screen.getByLabelText('Offering setup').textContent).toContain('Describe it')
    expect(screen.getByLabelText('Offering setup').textContent).toContain('Add ways to begin')
    expect(screen.getByLabelText('Offering setup').textContent).toContain('Publish')
    expect(screen.queryByLabelText('Endpoint URL')).toBeNull()
    fireEvent.click(screen.getByRole('combobox', { name: 'Add a way to get started' }))
    fireEvent.click(screen.getByRole('option', { name: 'API or agent endpoint' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add endpoint details' }))
    expect(screen.getByLabelText('Endpoint URL')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Data query updated' } })
    const save = screen.getByRole('button', { name: 'Save draft' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
    resolveSave?.({ kind: 'saved', value: { ...emptyOwnerOfferingEditorValue, name: 'Data query updated', category: 'Data', summary: 'Query indexed data.' }, message: 'Saved.' })
    await waitFor(() => expect(screen.getByText('Offering saved')).toBeTruthy())
  })

  it('requires an HTTPS website address and retains it in the human access descriptor', () => {
    const onSave = vi.fn(async (value) => ({ kind: 'saved' as const, value, message: 'Saved.' }))
    render(<AeOwnerOfferingEditor initialValue={emptyOwnerOfferingEditorValue} onSave={onSave} />)

    fireEvent.click(screen.getByRole('combobox', { name: 'Add a way to get started' }))
    fireEvent.click(screen.getByRole('option', { name: 'Website' }))
    fireEvent.change(screen.getByLabelText('Published instructions'), { target: { value: 'Start your request online.' } })
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
    },
    accessPaths: [{
      accessPathRef: brandNonEmpty('access:blockchain-query', 'AccessPathRef'),
      descriptor: {
        kind: 'external_operation',
        name: 'GraphQL endpoint',
        summary: 'Run a GraphQL query against a published index.',
        url: 'https://example.com/api/query',
        method: 'POST',
        documentationUrl: 'https://example.com/docs',
        provenance: 'business_declared',
      },
    }],
    support: { integrated: true, routeable: true, reasons: [], observedAt: 1_900_000_000_000 },
  }
}

function v2BusinessFixture() {
  return {
    schemaVersion: 'public-business-catalog-api:v2' as const,
    businessId: 'business:v2', slug: 'v2-business', name: 'V2 Business', category: 'Data', suburb: 'Perth', stateTerritory: 'WA', publicUrl: '/v2-business', observedAt: 1, disposition: 'current' as const,
    offerings: [{ offeringRef: 'offering:v2', revision: 1, name: 'Data lookup', category: 'Data', summary: 'Look up public data.', accessPaths: [{ accessPathRef: 'access:v2:web', kind: 'human_request' as const, channel: 'website' as const, disclosure: 'Start on the business website.', url: 'https://example.com/start' }], support: { integrated: false, aeSupportedAction: false } }],
    accessSummary: { humanRequest: true, externalOperation: false, aeSupportedAction: false },
  }
}
