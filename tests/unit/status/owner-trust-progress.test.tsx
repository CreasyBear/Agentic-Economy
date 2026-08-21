/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicOwnerStatusRouteReadback } from '@/modules/catalog/public'

afterEach(cleanup)

const businessId = brandNonEmpty('business:status-card', 'BusinessId')
const slug = brandNonEmpty('status-card-plumbing', 'Slug')
const offeringRef = brandNonEmpty('offering:status-card-plumbing:emergency-plumbing', 'OfferingRef')
const accessPathRef = brandNonEmpty(
  'access:status-card-plumbing:emergency-plumbing:phone',
  'AccessPathRef',
)

describe('owner status card', () => {
  it('renders the published business identity without request admission', () => {
    render(<AeStatusCard readback={ownerReadback()} />)

    expect(screen.getByText('Status Card Plumbing')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open page' }).getAttribute('href')).toBe('/status-card-plumbing')
    expect(screen.queryByText('Request admission')).toBeNull()
    expect(screen.queryByText('Your business page can receive requests.')).toBeNull()
  })

  it('labels local fixture readbacks as preview and withholds discoverable controls', () => {
    render(
      <AeStatusCard
        readback={{
          ...ownerReadback(),
          projectionMode: 'local_preview',
          nextAction: 'Preview only. Connect the public source before sharing this page.',
        }}
      />,
    )

    expect(screen.getByText('Preview')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open preview' }).getAttribute('href')).toBe('/status-card-plumbing')
    expect(screen.queryByRole('button', { name: 'Copy public URL' })).toBeNull()
    expect(screen.getByText('Preview only. Connect the public source before sharing this page.')).toBeTruthy()
  })
})

function ownerReadback(): PublicOwnerStatusRouteReadback {
  return {
    publicUrl: '/status-card-plumbing',
    noindex: true,
    projectionMode: 'public_source',
    catalog: {
      schemaVersion: 'public-business-catalog-api:v2',
      businessId,
      slug,
      name: 'Status Card Plumbing',
      category: 'Emergency plumbing',
      businessContext: {
        kind: 'local_human',
        suburb: 'Parramatta',
        stateTerritory: 'NSW',
      },
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
              kind: 'human_request',
              channel: 'phone',
              disclosure: 'Call the published number on the listing.',
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
