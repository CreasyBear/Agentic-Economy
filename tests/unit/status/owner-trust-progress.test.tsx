/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  AeStatusCard,
  buildOwnerTrustTierProgress,
} from '@/components/ae/status/AeStatusCard'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'

const businessId = brandNonEmpty('business:status-card', 'BusinessId')
const serviceId = brandNonEmpty('service:status-card:emergency-plumbing', 'ServiceId')
const slug = brandNonEmpty('status-card-plumbing', 'Slug')

const expectedActions = [
  'Owner claim recorded.',
  'Contact evidence recorded.',
  'Publish at least one service with service area, hours, and first-request instructions.',
  'Ask AE to run and record the registry check for this page.',
]

describe('owner trust-tier progress', () => {
  it('marks the current trust tier and keeps unreached action text tied to real owner-page requirements', () => {
    expect(buildOwnerTrustTierProgress('contact_confirmed')).toEqual([
      { tier: 'claimed', label: 'Claimed', state: 'reached', action: expectedActions[0] },
      { tier: 'contact_confirmed', label: 'Contact confirmed', state: 'current', action: expectedActions[1] },
      { tier: 'listed', label: 'Listed', state: 'next', action: expectedActions[2] },
      { tier: 'registry_verified', label: 'Registry checked', state: 'next', action: expectedActions[3] },
    ])
  })

  it('renders the current business tier without exposing a verified badge', () => {
    const { container } = render(<AeStatusCard readback={ownerReadback()} />)

    expect(screen.getByRole('list', { name: 'Business page progress' })).toBeTruthy()
    expect(container.querySelector('[data-tier="contact_confirmed"]')?.getAttribute('aria-current')).toBe('step')
    expect(container.querySelector('[data-tier="listed"]')?.textContent).toContain(expectedActions[2])
    expect(container.querySelector('[data-tier="registry_verified"]')?.textContent).toContain('Registry checked')
    expect(container.querySelector('[data-tier="registry_verified"]')?.textContent).not.toContain('Registry verified')
  })
})

function ownerReadback(): PublicOwnerStatusRouteReadback {
  return {
    publicUrl: '/status-card-plumbing',
    noindex: true,
    catalog: {
      businessId,
      slug,
      name: 'Status Card Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      publicUrl: '/status-card-plumbing',
      publicStatus: 'published',
      trustTier: 'contact_confirmed',
      indexStatus: 'queued',
      discoveryStatus: 'degraded',
      photos: [],
      services: [
        {
          serviceId,
          serviceSlug: brandNonEmpty('emergency-plumbing', 'Slug'),
          businessId,
          name: 'Emergency plumbing',
          category: 'Emergency plumbing',
          summary: 'Urgent plumbing help.',
          serviceArea: 'Parramatta',
          hoursOrUnknown: 'Hours supplied by owner',
          firstRequest: {
            mode: 'inquiry_available',
            publicDisclosure: 'Use the inquiry form for first contact.',
            publicChannel: 'public_business_contact',
            rawContactExcluded: true,
          },
          status: 'published',
          capabilities: [],
        },
      ],
      schemaVersion: 'public-catalog:v1',
      updatedAt: 1,
    },
    unavailableCapabilities: [],
    nextAction: 'Share the public page and keep service facts current.',
  }
}
