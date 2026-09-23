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
    expect(text).toContain('Offerings')
    expect(text).toContain('Inspect the price, access path, and current readiness before you open one.')
    expect(markup).not.toContain('Ask this business')
    expect(markup).not.toContain('href="/demo-plumbing/inquiry"')
  })

  it('puts literal market facts before any access path', () => {
    const markup = renderFirstScreen(catalogFixture())

    expect(markup).toContain('Plumber')
    expect(markup).toContain('Last indexed')
    expect(markup).not.toContain('Tools')
    expect(markup).not.toContain('Ready now')
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
    expect(markup).toContain('Phone provider')
    expect(markup).toContain('href="/market"')
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

  it('emits listing hrefs only for public HTTPS hosts', () => {
    const publicMarkup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={catalogFixture({
          businessContext: {
            kind: 'programmable_provider',
            website: 'https://fc2.com/docs',
            providerIdentifier: 'provider:fc2',
          },
          accessPaths: [{
            accessPathRef: 'access:demo-plumbing:emergency-plumbing:web',
            offeringRevision: 1,
            kind: 'human_request',
            channel: 'website',
            disclosure: 'Open the published site.',
            url: 'https://fdic.gov/tools',
          }],
        })}
        agentJsonUrl="/api/businesses/demo-plumbing"
      />,
    )
    expect(publicMarkup).toContain('href="https://fc2.com/docs"')
    expect(publicMarkup).toContain('href="https://fdic.gov/tools"')

    const privateMarkup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={catalogFixture({
          businessContext: {
            kind: 'programmable_provider',
            website: 'https://[fd12:3456:789a::1]/admin',
            providerIdentifier: 'provider:ula',
          },
          accessPaths: [{
            accessPathRef: 'access:demo-plumbing:emergency-plumbing:web',
            offeringRevision: 1,
            kind: 'human_request',
            channel: 'website',
            disclosure: 'Open the published site.',
            url: 'https://[2002:c0a8:101::1]/admin',
          }],
        })}
        agentJsonUrl="/api/businesses/demo-plumbing"
      />,
    )
    expect(privateMarkup).not.toContain('href="https://[fd12:3456:789a::1]/admin"')
    expect(privateMarkup).not.toContain('href="https://[2002:c0a8:101::1]/admin"')
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
  overrides: Partial<{
    businessContext: PublicBusinessCatalogApiV2Dto['businessContext']
    accessPaths: PublicBusinessCatalogApiV2Dto['offerings'][number]['accessPaths']
    availabilitySummary: string
    serviceAreaSummary: string
  }> = {},
  publishedPhone?: string,
): PublicBusinessCatalogApiV2Dto {
  const offering: PublicBusinessCatalogApiV2Dto['offerings'][number] = {
    offeringRef: 'offering:demo-plumbing:emergency-plumbing',
    revision: 1,
    name: 'Emergency plumbing',
    category: 'Plumber',
    summary: 'Urgent plumbing support.',
    serviceAreaSummary: overrides.serviceAreaSummary ?? 'Parramatta and nearby suburbs',
    availabilitySummary: overrides.availabilitySummary ?? 'Mon–Fri, 8am–5pm',
    accessPaths: overrides.accessPaths ?? [{
      accessPathRef: 'access:demo-plumbing:emergency-plumbing:phone',
      offeringRevision: 1,
      kind: 'human_request',
      channel: 'phone',
      disclosure: 'Call the published number on the listing.',
    }],
    support: { integrated: false, aeSupportedAction: false },
  }

  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: 'business:listing-first-screen',
    slug: 'demo-plumbing',
    name: 'Demo listed provider',
    category: 'Plumber',
    businessContext: overrides.businessContext ?? {
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
  const marketRoute = createRoute({ getParentRoute: () => rootRoute, path: '/market' })
  const routeTree = rootRoute.addChildren([homeRoute, slugRoute, threadRoute, privacyRemoveRoute, marketRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return renderToStaticMarkup(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
