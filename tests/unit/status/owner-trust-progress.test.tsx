/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'
import {
  R1TargetAdmissionVersion,
  type AdmissionBlocker,
  type R1TargetAdmission,
} from '@/modules/inquiries/public'

afterEach(cleanup)

const businessId = brandNonEmpty('business:status-card', 'BusinessId')
const serviceId = brandNonEmpty('service:status-card:emergency-plumbing', 'ServiceId')
const slug = brandNonEmpty('status-card-plumbing', 'Slug')

const blockerExpectations = [
  {
    blocker: { kind: 'not_published', ownerLabel: 'Publish this business page' },
    action: { kind: 'link', href: '/claim' },
  },
  {
    blocker: { kind: 'not_claimed', ownerLabel: 'Complete the business claim' },
    action: { kind: 'instruction', text: 'Contact AE support to repair this business claim.' },
  },
  {
    blocker: { kind: 'destination_unverified', ownerLabel: 'Verify the inquiry destination' },
    action: { kind: 'instruction', text: 'Contact AE support to record a destination check.' },
  },
  {
    blocker: { kind: 'recipient_unresolvable', ownerLabel: 'Add a usable owner notification email' },
    action: { kind: 'instruction', text: 'Contact AE support to refresh the owner email proof.' },
  },
  {
    blocker: { kind: 'suppressed', ownerLabel: 'Turn inquiry receiving back on' },
    action: { kind: 'instruction', text: 'Contact AE support to restore inquiry receiving.' },
  },
  {
    blocker: { kind: 'not_ready', ownerLabel: 'Finish inquiry setup' },
    action: { kind: 'instruction', text: 'AE must finish inquiry setup before requests can be received.' },
  },
] satisfies readonly Readonly<{
  blocker: AdmissionBlocker
  action: Readonly<{ kind: 'link'; href: string }> | Readonly<{ kind: 'instruction'; text: string }>
}>[]

describe('owner request admission', () => {
  it('renders every canonical blocker label with only actions the owner can take', () => {
    const admission: R1TargetAdmission = {
      version: R1TargetAdmissionVersion,
      admitted: false,
      blockers: blockerExpectations.map(({ blocker }) => blocker),
    }

    render(<AeStatusCard readback={ownerReadback(admission)} />)

    for (const { blocker, action } of blockerExpectations) {
      if (action.kind === 'link') {
        expect(screen.getByRole('link', { name: blocker.ownerLabel }).getAttribute('href')).toBe(action.href)
      } else {
        expect(screen.getByText(blocker.ownerLabel)).toBeTruthy()
        expect(screen.getByText(action.text)).toBeTruthy()
        expect(screen.queryByRole('link', { name: blocker.ownerLabel })).toBeNull()
        expect(screen.queryByRole('link', { name: action.text })).toBeNull()
      }
    }
  })

  it('states plainly when the business page can receive requests without blocked actions', () => {
    const admission: R1TargetAdmission = {
      version: R1TargetAdmissionVersion,
      admitted: true,
      proof: {
        kind: 'claimed_owner',
        claimRef: 'claim:status-card-plumbing',
        recipientRef: 'recipient:status-card-plumbing',
      },
    }

    render(<AeStatusCard readback={ownerReadback(admission)} />)

    expect(screen.getByText('Your business page can receive requests.')).toBeTruthy()
    for (const { blocker } of blockerExpectations) {
      expect(screen.queryByRole('link', { name: blocker.ownerLabel })).toBeNull()
    }
  })
})

function ownerReadback(admission: R1TargetAdmission): PublicOwnerStatusRouteReadback {
  return {
    admission,
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
