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
const slug = brandNonEmpty('status-card-plumbing', 'Slug')
const offeringRef = brandNonEmpty('offering:status-card-plumbing:emergency-plumbing', 'OfferingRef')
const accessPathRef = brandNonEmpty(
  'access:status-card-plumbing:emergency-plumbing:inquiry',
  'AccessPathRef',
)
const inquiryPathDescriptor = {
  kind: 'human_request' as const,
  channel: 'ae_inquiry' as const,
  disclosure: 'Use the inquiry form for first contact.',
}

const blockerExpectations = [
  {
    blocker: { kind: 'not_published', ownerLabel: 'Publish this business page' },
    action: { kind: 'link', href: '/owner/offerings', text: 'Open Offerings' },
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
  action: Readonly<{ kind: 'link'; href: string; text: string }> | Readonly<{ kind: 'instruction'; text: string }>
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
        // The blocker label is the heading; a CTA that repeats it reads as a
        // duplicate line and hides where the owner is actually being sent.
        expect(action.text).not.toBe(blocker.ownerLabel)
        expect(screen.getByRole('link', { name: action.text }).getAttribute('href')).toBe(action.href)
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
  it('labels local fixture readbacks as preview and withholds discoverable controls', () => {
    const readback = ownerReadback({
      version: R1TargetAdmissionVersion,
      admitted: true,
      proof: {
        kind: 'claimed_owner',
        claimRef: 'claim:status-card-plumbing',
        recipientRef: 'recipient:status-card-plumbing',
      },
    })

    render(
      <AeStatusCard
        readback={{
          ...readback,
          projectionMode: 'local_preview',
          nextAction: 'Preview only. Connect the public source before sharing this page.',
        }}
      />,
    )

    expect(screen.getByText('Preview')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open preview' }).getAttribute('href')).toBe('/status-card-plumbing')
    expect(screen.queryByRole('button', { name: 'Copy public URL' })).toBeNull()
    expect(screen.queryByText('Your business page can receive requests.')).toBeNull()
    expect(screen.getByText('Preview can receive requests in local testing only.')).toBeTruthy()
  })
})


function ownerReadback(admission: R1TargetAdmission): PublicOwnerStatusRouteReadback {
  return {
    admission,
    publicUrl: '/status-card-plumbing',
    noindex: true,
    projectionMode: 'public_source',
    catalog: {
      schemaVersion: 'public-business-catalog-api:v2',
      businessId,
      slug,
      name: 'Status Card Plumbing',
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      publicUrl: '/status-card-plumbing',
      trustTier: 'contact_confirmed',
      observedAt: 1,
      disposition: 'current',
      photos: [],
      offerings: [
        {
          offeringRef,
          revision: 1,
          name: 'Emergency plumbing',
          category: 'Emergency plumbing',
          summary: 'Urgent plumbing help.',
          serviceAreaSummary: 'Parramatta',
          availabilitySummary: 'Hours supplied by owner',
          accessPaths: [
            {
              accessPathRef,
              offeringRevision: 1,
              ...inquiryPathDescriptor,
            },
          ],
          support: {
            integrated: false,
            aeSupportedAction: false,
          },
        },
      ],
      accessSummary: {
        humanRequest: true,
        externalOperation: false,
        aeSupportedAction: false,
      },
    },
    unavailableCapabilities: [],
    nextAction: 'Share the public page and keep service facts current.',
  }
}
