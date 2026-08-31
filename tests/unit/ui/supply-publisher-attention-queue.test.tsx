// @vitest-environment jsdom

import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AeSupplyPublisherHome } from '@/components/ae/supply/AeSupplyPublisherHome'
import type { OwnerSupplyOfferingReadback } from '@/modules/capability-supply/supply-funnel.functions'
import { offeringAt, renderWithRouter } from './supply-funnel-harness'

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal()),
  useServerFn: (serverFn: unknown) => serverFn,
}))

function namedOffering(
  name: string,
  offering: OwnerSupplyOfferingReadback,
  patch: Partial<OwnerSupplyOfferingReadback> = {},
): OwnerSupplyOfferingReadback {
  return {
    ...offering,
    offeringRef: `offering:${name.toLowerCase().replaceAll(' ', '-')}`,
    name,
    ...patch,
  }
}

function renderOfferings(offerings: readonly OwnerSupplyOfferingReadback[]) {
  return renderWithRouter(
    <AeSupplyPublisherHome
      readback={{
        kind: 'available',
        businessId: 'business-1',
        business: { name: 'Provider', slug: 'provider' },
        offerings,
        callLog: [],
        activityTruncated: false,
        liquidity: {
          fillCount: 0,
          zeroCount: 0,
          depthSamples: 0,
          environment: 'production',
        },
      }}
      earnings={{ kind: 'not_found' }}
    />,
  )
}

describe('published Operation attention region', () => {
  it('lists only published nonterminal unavailable Operations with their existing repair continuations', () => {
    const healthy = offeringAt('test')
    const currentUnready = namedOffering('Needs readiness', offeringAt('readiness'))
    const authorityDrift = namedOffering('Authority drift', offeringAt('readiness'), {
      actionableReason: 'authority_stale',
      authority: {
        mode: 'provider_owned',
        kind: 'provider_connection',
        connectionRef: 'connection:stale',
        providerRef: 'provider:stale',
        authorityGeneration: 2,
        authorityDigest: 'sha256:stale',
      },
    })
    const credentialDrift = namedOffering('Credential drift', offeringAt('readiness'), {
      actionableReason: 'credential_rejected',
      readiness: { outcome: 'credential_rejected', evidenceRefs: [] },
    })
    const incompatibleBase = offeringAt('test')
    if (incompatibleBase.publication === undefined) throw new Error('test_publication_missing')
    const incompatible = namedOffering('Incompatible route', incompatibleBase, {
      publication: {
        ...incompatibleBase.publication,
        state: 'incompatible',
        lifecycle: { state: 'incompatible', reasons: ['incompatible_revision'] },
      },
      lifecycle: { state: 'incompatible', reasons: ['incompatible_revision'] },
      live: { available: false, reason: 'incompatible_revision' },
    })
    const withdrawnBase = offeringAt('test')
    if (withdrawnBase.publication === undefined) throw new Error('test_publication_missing')
    const withdrawn = namedOffering('Withdrawn route', withdrawnBase, {
      status: 'paused',
      publication: {
        ...withdrawnBase.publication,
        state: 'withdrawn',
        lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
      },
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
      live: { available: false, reason: 'withdrawn' },
    })
    const retiredBase = offeringAt('test')
    if (retiredBase.publication === undefined) throw new Error('test_publication_missing')
    const retired = namedOffering('Retired route', retiredBase, {
      status: 'retired',
      live: { available: false },
    })
    const superseded = namedOffering('Superseded route', retiredBase, {
      status: 'paused',
      publication: { ...retiredBase.publication, state: 'superseded' },
      live: { available: false },
    })
    const unpublishedDraft = namedOffering('Unpublished draft', offeringAt('describe'))

    renderOfferings([
      currentUnready,
      authorityDrift,
      credentialDrift,
      incompatible,
      withdrawn,
      namedOffering('Healthy route', healthy),
      unpublishedDraft,
      retired,
      superseded,
    ])

    const region = screen.getByRole('region', {
      name: '5 published Operations need attention',
    })
    const list = within(region).getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    for (const name of [
      'Needs readiness',
      'Authority drift',
      'Credential drift',
      'Incompatible route',
      'Withdrawn route',
    ]) {
      expect(within(list).getByText(name)).toBeDefined()
    }
    for (const excluded of [
      'Healthy route',
      'Unpublished draft',
      'Retired route',
      'Superseded route',
    ]) {
      expect(within(list).queryByText(excluded)).toBeNull()
    }

    const expectedActions = [
      ['Recheck readiness for Needs readiness', '/owner/supply/offering%3Aneeds-readiness#readiness'],
      ['Refresh and re-admit for Authority drift', '/owner/supply?rebind=offering%3Aauthority-drift#provider-connection-connection%3Astale'],
      ['Choose replacement connection for Credential drift', '/owner/supply/offering%3Acredential-drift#credential-recovery'],
      ['Inspect incompatibility for Incompatible route', '/owner/supply/offering%3Aincompatible-route#incompatibility'],
      ['Republish Operation for Withdrawn route', '/owner/supply/offering%3Awithdrawn-route#publication-maintenance'],
    ] as const
    for (const [name, href] of expectedActions) {
      expect(within(region).getByRole('link', { name }).getAttribute('href')).toBe(href)
    }

    expect(screen.queryByRole('alert')).toBeNull()
    expect(region.querySelector('[aria-live]')).toBeNull()

    const table = screen.getByRole('table', { name: 'Operations' })
    expect(within(table).getByText('Healthy route')).toBeDefined()
    expect(within(table).getByText('Unpublished draft')).toBeDefined()
    expect(within(table).getByText('Retired route')).toBeDefined()
    expect(within(table).getByText('Superseded route')).toBeDefined()
    expect(within(table).getByRole('link', { name: 'Recheck readiness' }).getAttribute('href'))
      .toBe('/owner/supply/offering%3Aneeds-readiness#readiness')
    expect(within(table).getByRole('link', { name: 'View live Operation' }).getAttribute('href'))
      .toBe('/operations/operation:one')
  })

  it('uses singular copy for one affected published Operation', () => {
    renderOfferings([namedOffering('One repair', offeringAt('readiness'))])

    expect(screen.getByRole('region', {
      name: '1 published Operation needs attention',
    })).toBeDefined()
  })

  it.each([
    ['healthy', [namedOffering('Healthy route', offeringAt('test'))]],
    ['draft', [namedOffering('Unpublished draft', offeringAt('describe'))]],
    ['retired', [namedOffering('Retired route', offeringAt('readiness'), { status: 'retired' })]],
  ])('renders no attention region for %s-only data', (_kind, offerings) => {
    renderOfferings(offerings)

    expect(screen.queryByRole('region', { name: /published Operations? need/ })).toBeNull()
    expect(screen.getByRole('table', { name: 'Operations' })).toBeDefined()
  })
})
