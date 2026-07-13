/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeProviderCard } from '@/components/ae/primitives/AeProviderCard'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'

describe('AeProviderCard answer variant', () => {
  afterEach(() => {
    cleanup()
  })

  it('makes the selected listing and published inquiry path explicit', () => {
    render(<AeProviderCard variant="answer" source={provider({ citationIndex: 2 })} threadId="thread-abc" />)

    expect(screen.getByText('Choice 2 in this answer')).toBeTruthy()
    expect(screen.getByText('Inquiry path')).toBeTruthy()
    expect(
      screen.getByText(
        'AE inquiry form published for owner review. The business still confirms timing, quote, and availability.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Open inquiry form').closest('a')?.getAttribute('href')).toBe(
      '/demo-plumbing/inquiry?from=thread&id=thread-abc',
    )
    expect(screen.getByText('Review listing').closest('a')?.getAttribute('href')).toBe(
      '/demo-plumbing?from=thread&id=thread-abc',
    )
  })

  it('does not imply an AE inquiry form when the listing has no inquiry URL', () => {
    const { inquiryUrl: _inquiryUrl, ...source } = provider({ nextStepLabel: 'Use published contact' })

    render(<AeProviderCard variant="answer" source={source} />)

    expect(
      screen.getByText('No AE inquiry form is published yet. Review the listing before using its contact guidance.'),
    ).toBeTruthy()
    expect(screen.queryByText('Open inquiry form')).toBeNull()
    expect(screen.getByText('Use published contact')).toBeTruthy()
  })
})

describe('AeProviderCard registry variant', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows source-backed decision facts and explicit missing trust facts', () => {
    render(<AeProviderCard variant="registry" item={registryBusiness()} />)

    expect(screen.getByText('Demo Plumbing')).toBeTruthy()
    expect(screen.getByText('Plumber')).toBeTruthy()
    expect(screen.getByText('Joondalup, WA')).toBeTruthy()
    expect(screen.getByText('Joondalup and nearby suburbs')).toBeTruthy()
    expect(screen.getByText('No reply history yet')).toBeTruthy()
    expect(screen.getByText('Phone not published here')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Call/ })).toBeNull()

    const view = screen.getByRole('link', { name: 'View Demo Plumbing' })
    const copy = screen.getByRole('button', { name: 'Copy details' })
    expect(view.className).toContain('min-h-11')
    expect(copy.className).toContain('min-h-11')
  })

  it('copies only the published card details', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeProviderCard variant="registry" item={registryBusiness()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText.mock.calls[0]?.[0]).toContain('Service area: Joondalup and nearby suburbs')
    expect(writeText.mock.calls[0]?.[0]).toContain('Phone: Phone not published here')
    expect(screen.getByRole('button', { name: 'Details copied' })).toBeTruthy()
  })
})

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
  return {
    citationIndex: 1,
    slug: 'demo-plumbing',
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    serviceArea: 'Parramatta',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: 'Responds ~22m',
    trustCue: 'Responds ~22m - Checked',
    freshnessLabel: 'Updated recently',
    nextStepLabel: 'Send inquiry',
    detailUrl: '/demo-plumbing',
    services: [{ name: 'Emergency plumbing', category: 'Plumber', summary: 'Urgent plumbing support.' }],
    inquiryUrl: '/demo-plumbing/inquiry',
    ...overrides,
  }
}

function registryBusiness(): PublicBusinessCatalogApiDto {
  return {
    slug: 'demo-plumbing',
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Joondalup',
    stateTerritory: 'WA',
    publicUrl: '/demo-plumbing',
    trustTier: 'listed',
    publicStatus: 'published',
    indexStatus: 'indexed',
    discoveryStatus: 'available',
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: 1_700_000_000_000,
    photos: [],
    services: [{
      slug: 'emergency-plumbing',
      name: 'Emergency plumbing',
      category: 'Plumber',
      summary: 'Urgent plumbing support.',
      serviceArea: 'Joondalup and nearby suburbs',
      hoursOrUnknown: 'Unknown',
      firstRequest: {
        mode: 'not_available_yet',
        publicDisclosure: 'Contact details are not published here.',
        publicChannel: 'not_available',
        noContactReason: 'No public contact path.',
      },
      status: 'published',
      capabilities: [],
    }],
  }
}
