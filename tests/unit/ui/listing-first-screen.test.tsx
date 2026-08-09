/**
 * @vitest-environment jsdom
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { AeProviderListingPage, ListingFirstScreen } from '@/components/ae/listing/AeProviderListingPage'
import {
  AE_EXPLAINER_FULL,
  AE_EXPLAINER_NO_PHONE,
  NO_CONTACT_EXPLAINER,
  buildListingTrustProjection,
} from '@/lib/ui/trust-projection'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  projectPublicInquiryAvailability,
  type PublicInquiryAffordance,
} from '@/modules/inquiries/route-readbacks'

const BUSINESS_ID = brandNonEmpty('business:listing-first-screen', 'BusinessId')
const OFFERING_REF = brandNonEmpty('offering:emergency-plumbing', 'OfferingRef')
const NO_REPLY_HISTORY = 'No reply history yet'

const availableInquiry: PublicInquiryAffordance = {
  kind: 'available',
  label: 'Send inquiry',
  href: '/demo-plumbing/inquiry',
  businessName: 'Demo Plumbing',
  offeringName: 'Emergency plumbing',
  disclosure: 'Send a written inquiry for owner review.',
  target: {
    businessId: BUSINESS_ID,
    offeringRef: OFFERING_REF,
  },
}

const unavailableInquiry: PublicInquiryAffordance = {
  kind: 'unavailable',
  label: 'Inquiry unavailable',
  reason: 'No public inquiry path is published.',
  businessName: 'Demo Plumbing',
  offeringName: 'Emergency plumbing',
}

/** The exact copy the dev seed and the v1 catalog stamp onto every human channel. */
const STORED_INQUIRY_DISCLOSURE = 'Use the inquiry form for a first contact.'

describe('ListingFirstScreen', () => {
  it('does not present catalog readiness or provenance beyond the unavailable inquiry path', () => {
    const catalog = catalogFixture()
    const offering = catalog.offerings[0]
    if (offering === undefined) throw new Error('listing offering fixture missing')
    const sandboxLikeCatalog: PublicBusinessCatalogApiV2Dto = {
      ...catalog,
      offerings: [{
        ...offering,
        support: { integrated: true, aeSupportedAction: true },
      }],
    }

    const projectedCatalog = projectPublicInquiryAvailability(sandboxLikeCatalog, undefined)
    expect(projectedCatalog.offerings[0]?.accessPaths.some(
      (path) => path.kind === 'human_request' && path.channel === 'ae_inquiry',
    )).toBe(false)

    const markup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={projectedCatalog}
        inquiryAffordance={unavailableInquiry}
        agentJsonUrl="/api/businesses/demo-plumbing"
      />,
    )
    const text = fragmentFrom(markup).textContent ?? ''

    expect(text).toContain('Emergency plumbing')
    expect(text).toContain('What this business offers')
    expect(text).toContain('This business hasn’t joined AE yet')
    expect(text).toContain('published details')
    expect(markup).not.toContain('Send inquiry</')
    expect(markup).not.toContain('href="/demo-plumbing/inquiry"')
  })

  it('puts the published trust facts and posture before the available ask action', () => {
    const markup = renderFirstScreen(catalogFixture(), availableInquiry)

    expect(markup).toContain('Demo Plumbing')
    expect(markup).toContain('Plumber')
    expect(markup).toContain('Mon–Fri, 8am–5pm')
    expect(markup).toContain('Parramatta and nearby suburbs')
    expect(markup).toContain(AE_EXPLAINER_NO_PHONE)
    expect(markup).not.toContain('call directly')
    expect(markup).not.toContain('href="tel:')
    // An unpublished phone and an absent reply history are omitted, not named.
    expect(markup).not.toContain('Phone not published here')
    expect(markup).not.toContain(NO_REPLY_HISTORY)

    expectStringsInOrder(markup, [
      'Mon–Fri, 8am–5pm',
      'Parramatta and nearby suburbs',
      AE_EXPLAINER_NO_PHONE,
      'Ask this business',
    ])
    expect(peerActions(markup)).toEqual([
      { action: 'copy-details', variant: 'secondary' },
      { action: 'ask', variant: 'secondary' },
    ])
    expectForbiddenCopyAbsent(markup)
  })

  it('renders the direct-call explainer with a dialable target only when a phone is published', () => {
    const markup = renderFirstScreen(catalogFixture({}, '08 6111 2222'), availableInquiry)

    expect(markup).toContain(AE_EXPLAINER_FULL)
    // The reading format keeps its spaces; the tel: target must not, or the
    // dialer refuses the link on the device where calling is the whole point.
    expect(markup).toContain('href="tel:0861112222"')
    expect(markup).toContain('Call now: 08 6111 2222')
    expect(markup).not.toContain(AE_EXPLAINER_NO_PHONE)
    expect(peerActions(markup)).toEqual([
      { action: 'call', variant: 'primary' },
      { action: 'copy-details', variant: 'secondary' },
      { action: 'ask', variant: 'secondary' },
    ])
  })

  it('hides the call affordance when the published phone has no dialable digits', () => {
    const markup = renderFirstScreen(catalogFixture({}, 'ask reception'), availableInquiry)

    expect(markup).not.toContain('href="tel:')
  })

  it('omits every unpublished trust fact instead of naming its absence', () => {
    const catalog = catalogFixture({ availabilitySummary: 'Unknown', serviceAreaSummary: 'unknown' })
    const markup = renderFirstScreen(catalog, availableInquiry)

    expect(markup).not.toContain('Phone not published here')
    expect(markup).not.toContain('Hours not published here')
    expect(markup).not.toContain('Service area not published here')
    expect(markup).not.toContain('href="tel:')
    expect(markup).toContain('Demo Plumbing')
    expectForbiddenCopyAbsent(markup)
  })

  it('replaces the ask action with the exact not-joined posture when inquiry is unavailable', () => {
    const markup = renderFirstScreen(catalogFixture(), unavailableInquiry)
    const actions = fragmentFrom(markup).querySelector('[aria-label="Actions for this business"]')

    expect(actions?.textContent).toBe('Copy detailsThis business has not enabled messages here yet')
    expect(markup).not.toContain('Ask this business')
    expect(markup).toContain(NO_CONTACT_EXPLAINER)
    expect(markup).not.toContain(AE_EXPLAINER_NO_PHONE)
    expect(peerActions(markup)).toEqual([
      { action: 'copy-details', variant: 'secondary' },
    ])
    expectForbiddenCopyAbsent(markup)
  })

  it('lets Offering v2 own visible supply without resurrecting legacy inquiry cards', () => {
    const markup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={catalogFixture()}
        inquiryAffordance={availableInquiry}
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
    expect(markup).not.toContain('What you can do here')
    expect(markup).not.toContain('What happens when you reach out')
    expect(markup).not.toContain('Your request')
    expect(markup).not.toContain('Ask this business')
    expect(markup).not.toContain('href="/demo-plumbing/inquiry"')
  })

  it('withdraws the stored inquiry instruction when the inquiry route would refuse', () => {
    const markup = renderOfferingListing(unavailableInquiry)
    const text = fragmentFrom(markup).textContent ?? ''

    expect(text).toContain('How to start this service')
    expect(text).not.toContain(STORED_INQUIRY_DISCLOSURE)
    expect(text).not.toContain('Ask through AE')
    expect(text).toContain('Call the business directly.')
  })

  it('renders one reachable inquiry link when the inquiry route would accept', () => {
    const markup = renderOfferingListing(availableInquiry)
    const links = Array.from(
      fragmentFrom(markup).querySelectorAll<HTMLAnchorElement>('a[href="/demo-plumbing/inquiry"]'),
    )

    expect(links).toHaveLength(1)
    expect(links[0]?.textContent).toBe('Send a message')
    // The clickable channel and the sentence describing it are the same path.
    expect(fragmentFrom(markup).textContent ?? '').toContain(STORED_INQUIRY_DISCLOSURE)
  })
  it('renders a real href for the typed thread back link', () => {
    const markup = renderListingToStaticMarkup(
      <AeProviderListingPage
        catalog={catalogFixture()}
        inquiryAffordance={availableInquiry}
        agentJsonUrl="/api/businesses/demo-plumbing"
        backFrom="thread"
        backThreadId="thread-abc"
      />,
    )

    expect(fragmentFrom(markup).querySelector('nav a')?.getAttribute('href')).toBe('/t/thread-abc')
  })
})

function renderOfferingListing(inquiryAffordance: PublicInquiryAffordance): string {
  return renderListingToStaticMarkup(
    <AeProviderListingPage
      catalog={catalogFixture()}
      inquiryAffordance={inquiryAffordance}
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
              descriptor: { kind: 'human_request', channel: 'phone', disclosure: STORED_INQUIRY_DISCLOSURE },
            },
            {
              accessPathRef: brandNonEmpty('access:demo-plumbing:emergency-plumbing:inquiry', 'AccessPathRef'),
              offeringRevision: 1,
              descriptor: { kind: 'human_request', channel: 'ae_inquiry', disclosure: STORED_INQUIRY_DISCLOSURE },
            },
          ],
          support: { integrated: false, routeable: false, reasons: [], observedAt: 1_900_000_000_000 },
        }],
      }}
    />,
  )
}

function renderFirstScreen(
  catalog: PublicBusinessCatalogApiV2Dto,
  inquiryAffordance: PublicInquiryAffordance,
): string {
  return renderListingToStaticMarkup(
    <ListingFirstScreen
      catalog={catalog}
      trust={buildListingTrustProjection(catalog, inquiryAffordance.kind === 'available')}
      inquiryAffordance={inquiryAffordance}
      inquirySearch={{}}
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
      accessPathRef: 'access:demo-plumbing:emergency-plumbing:inquiry',
      offeringRevision: 1,
      kind: 'human_request',
      channel: 'ae_inquiry',
      disclosure: 'Send a written inquiry for owner review.',
    }],
    support: { integrated: false, aeSupportedAction: false },
    ...offeringOverrides,
  }

  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: 'business:listing-first-screen',
    slug: 'demo-plumbing',
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/demo-plumbing',
    ...(publishedPhone === undefined ? {} : { publishedPhone }),
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

function peerActions(markup: string): Array<{ action: string | undefined; variant: string | undefined }> {
  return Array.from(fragmentFrom(markup).querySelectorAll<HTMLElement>('[data-peer-action]'), (element) => ({
    action: element.dataset.peerAction,
    variant: element.dataset.variant,
  }))
}

function expectStringsInOrder(markup: string, values: readonly string[]): void {
  let precedingIndex = -1
  for (const value of values) {
    const index = markup.indexOf(value)
    expect(index, `Expected rendered markup to contain ${JSON.stringify(value)}`).toBeGreaterThanOrEqual(0)
    expect(index, `Expected ${JSON.stringify(value)} to follow the preceding first-screen contract item`).toBeGreaterThan(precedingIndex)
    precedingIndex = index
  }
}

function expectForbiddenCopyAbsent(markup: string): void {
  const text = fragmentFrom(markup).textContent ?? ''
  expect(text).not.toMatch(/\b(?:live|open|available|availability|routing|readiness|endpoint|sandbox|offering|capability|provenance|slug|revision)\b/i)
}

function renderListingToStaticMarkup(ui: ReactElement): string {
  const rootRoute = createRootRoute()
  const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$slug' })
  const inquiryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$slug/inquiry' })
  const threadRoute = createRoute({ getParentRoute: () => rootRoute, path: '/t/$threadId' })
  const privacyRemoveRoute = createRoute({ getParentRoute: () => rootRoute, path: '/privacy/remove-business' })
  const routeTree = rootRoute.addChildren([homeRoute, slugRoute, inquiryRoute, threadRoute, privacyRemoveRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return renderToStaticMarkup(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
