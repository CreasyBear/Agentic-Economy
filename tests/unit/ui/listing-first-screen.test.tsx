/**
 * @vitest-environment jsdom
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { AeProviderListingPage, ListingFirstScreen } from '@/components/ae/listing/AeProviderListingPage'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { brandNonEmpty } from '@/modules/common/ids'

describe('ListingFirstScreen', () => {
  it('presents supplier supply as a compact Operation catalogue', () => {
    const catalog = catalogFixture()
    const markup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={catalog}
        agentJsonUrl="/api/businesses/demo-plumbing"
      />,
    )
    const text = fragmentFrom(markup).textContent ?? ''

    expect(text).toContain('Emergency plumbing')
    expect(text).toContain('Published Operations')
    expect(text).toContain('Inspect the price, access path, and current readiness before calling.')
    expect(markup).not.toContain('Ask this business')
    expect(markup).not.toContain('href="/demo-plumbing/inquiry"')
  })

  it('puts literal market facts before any access path', () => {
    const markup = renderFirstScreen(catalogFixture())

    expect(markup).toContain('Demo listed provider')
    expect(markup).toContain('Plumber')
    expect(markup).toContain('Compare this supplier’s published Operations, exact prices, and access paths.')
    expect(markup).toContain('Operations')
    expect(markup).toContain('Ready now')
    expect(markup).toContain('Last indexed')
    expect(markup).not.toContain('href="tel:')
    expect(markup).not.toContain('Ask this business')
  })

  it('uses a published phone only as the fallback access path', () => {
    const markup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={catalogFixture({}, '08 6111 2222')}
        agentJsonUrl="/api/businesses/demo-plumbing"
      />,
    )

    expect(markup).toContain('href="tel:0861112222"')
    expect(markup).toContain('Call supplier')
  })

  it('lets Offering v2 own visible supply without resurrecting inquiry cards', () => {
    const markup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={catalogFixture()}
        agentJsonUrl="/api/businesses/demo-plumbing"
        supply={{
          disposition: 'current',
          observedAt: 1_900_000_000_000,
          offerings: [{
            offering: {
              offeringRef: brandNonEmpty('offering:emergency-plumbing', 'OfferingRef'),
              revision: 1,
              name: 'Emergency plumbing visit',
              category: 'Plumber',
              summary: 'A published service.',
            },
            accessPaths: [],
            support: { integrated: false, routeable: false, reasons: [], observedAt: 1_900_000_000_000 },
          }],
        }}
      />,
    )

    expect(markup).toContain('Emergency plumbing visit')
    expect(markup).not.toContain('Ask this business')
    expect(markup).not.toContain('href="/demo-plumbing/inquiry"')
  })

  it('keeps phone supply disclosure on the listing', () => {
    const markup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={catalogFixture()}
        agentJsonUrl="/api/businesses/demo-plumbing"
        supply={{
          disposition: 'current',
          observedAt: 1_900_000_000_000,
          offerings: [{
            offering: {
              offeringRef: brandNonEmpty('offering:demo-plumbing:emergency-plumbing', 'OfferingRef'),
              revision: 1,
              name: 'Emergency plumbing visit',
              category: 'Plumber',
              summary: 'A published service.',
            },
            accessPaths: [
              {
                accessPathRef: brandNonEmpty('access:demo-plumbing:emergency-plumbing:phone', 'AccessPathRef'),
                offeringRevision: 1,
                descriptor: { kind: 'human_request', channel: 'phone', disclosure: 'Call the published number on the listing.' },
              },
            ],
            support: { integrated: false, routeable: false, reasons: [], observedAt: 1_900_000_000_000 },
          }],
        }}
      />,
    )
    const text = fragmentFrom(markup).textContent ?? ''
    expect(text).toContain('Call the published number on the listing.')
    expect(markup).not.toContain('href="/demo-plumbing/inquiry"')
  })

  it('renders a real href for the typed thread back link', () => {
    const markup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={catalogFixture()}
        agentJsonUrl="/api/businesses/demo-plumbing"
        backFrom="thread"
        backThreadId="thread-abc"
      />,
    )

    expect(fragmentFrom(markup).querySelector('nav a')?.getAttribute('href')).toBe('/t/thread-abc')
  })
})

function renderFirstScreen(catalog: PublicBusinessCatalogApiV2Dto): string {
  return renderListingToStaticMarkup(
    <ListingFirstScreen
      catalog={catalog}
    />,
  )
}

function catalogFixture(
  offeringOverrides: Partial<Pick<PublicBusinessCatalogApiV2Dto['offerings'][number], 'availabilitySummary' | 'serviceAreaSummary'>> = {},
  publishedPhone?: string,
): PublicBusinessCatalogApiV2Dto {
  const offering: PublicBusinessCatalogApiV2Dto['offerings'][number] = {
    offeringRef: 'offering:demo-plumbing:emergency-plumbing',
    revision: 1,
    name: 'Emergency plumbing',
    category: 'Plumber',
    summary: 'Urgent plumbing support.',
    serviceAreaSummary: 'Parramatta and nearby suburbs',
    availabilitySummary: 'Mon–Fri, 8am–5pm',
    accessPaths: [{
      accessPathRef: 'access:demo-plumbing:emergency-plumbing:phone',
      offeringRevision: 1,
      kind: 'human_request',
      channel: 'phone',
      disclosure: 'Call the published number on the listing.',
    }],
    support: { integrated: false, aeSupportedAction: false },
    ...offeringOverrides,
  }

  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: 'business:listing-first-screen',
    slug: 'demo-plumbing',
    name: 'Demo listed provider',
    category: 'Plumber',
    businessContext: {
      kind: 'local_human',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      ...(publishedPhone === undefined ? {} : { publishedPhone }),
    },
    publicUrl: '/demo-plumbing',
    trustTier: 'listed',
    photos: [],
    observedAt: 1_900_000_000_000,
    disposition: 'current',
    offerings: [offering],
    accessSummary: { humanRequest: true, externalOperation: false, aeSupportedAction: false },
  }
}

function fragmentFrom(markup: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = markup
  return template.content
}

function renderListingToStaticMarkup(ui: ReactElement): string {
  const rootRoute = createRootRoute()
  const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$slug' })
  const threadRoute = createRoute({ getParentRoute: () => rootRoute, path: '/t/$threadId' })
  const privacyRemoveRoute = createRoute({ getParentRoute: () => rootRoute, path: '/privacy/remove-business' })
  const routeTree = rootRoute.addChildren([homeRoute, slugRoute, threadRoute, privacyRemoveRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return renderToStaticMarkup(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
