/**
 * @vitest-environment jsdom
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ListingFirstScreen } from '@/components/ae/listing/AeProviderListingPage'
import {
  AE_EXPLAINER_FULL,
  AE_EXPLAINER_NO_PHONE,
  NO_CONTACT_EXPLAINER,
  buildListingTrustProjection,
} from '@/lib/ui/trust-projection'
import type { PublicRouteCatalogContract, PublicRouteServiceContract } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'

const BUSINESS_ID = brandNonEmpty('business:listing-first-screen', 'BusinessId')
const SERVICE_ID = brandNonEmpty('service:emergency-plumbing', 'ServiceId')
const NO_REPLY_HISTORY = 'No reply history yet'

const availableInquiry: PublicInquiryAffordance = {
  kind: 'available',
  label: 'Send inquiry',
  href: '/demo-plumbing/inquiry',
  businessName: 'Demo Plumbing',
  serviceName: 'Emergency plumbing',
  disclosure: 'Send a written inquiry for owner review.',
  target: {
    businessId: BUSINESS_ID,
    serviceId: SERVICE_ID,
    capabilityKind: 'phone_inquiry',
  },
}

const unavailableInquiry: PublicInquiryAffordance = {
  kind: 'unavailable',
  label: 'Inquiry unavailable',
  reason: 'No public inquiry path is published.',
  businessName: 'Demo Plumbing',
  serviceName: 'Emergency plumbing',
}

describe('ListingFirstScreen', () => {
  it('puts source-backed trust facts and posture before the available ask action', () => {
    const markup = renderFirstScreen(catalogFixture(), availableInquiry)

    expect(markup).toContain('Demo Plumbing')
    expect(markup).toContain('Plumber')
    expect(markup).toContain('Phone not published here')
    expect(markup).toContain('Mon–Fri, 8am–5pm')
    expect(markup).toContain('Parramatta and nearby suburbs')
    expect(markup).toContain(AE_EXPLAINER_NO_PHONE)
    expect(markup).not.toContain('call directly')
    expect(markup).toContain(NO_REPLY_HISTORY)
    expect(markup).not.toContain('href="tel:')

    expectStringsInOrder(markup, [
      'Phone not published here',
      'Mon–Fri, 8am–5pm',
      'Parramatta and nearby suburbs',
      AE_EXPLAINER_NO_PHONE,
      NO_REPLY_HISTORY,
      'Ask this business',
    ])
    expect(peerActions(markup)).toEqual([
      { action: 'copy-details', variant: 'secondary' },
      { action: 'ask', variant: 'secondary' },
    ])
    expectForbiddenCopyAbsent(markup)
  })

  it('renders the direct-call explainer only with a published phone', () => {
    const markup = renderFirstScreen(catalogFixture({}, '08 6111 2222'), availableInquiry)

    expect(markup).toContain(AE_EXPLAINER_FULL)
    expect(markup).toContain('href="tel:08 6111 2222"')
    expect(markup).not.toContain(AE_EXPLAINER_NO_PHONE)
  })

  it('states each unpublished trust fact instead of inventing contact or operating details', () => {
    const catalog = catalogFixture({ hoursOrUnknown: 'Unknown', serviceArea: 'unknown' })
    const markup = renderFirstScreen(catalog, availableInquiry)

    expect(markup).toContain('Phone not published here')
    expect(markup).toContain('Hours not published here')
    expect(markup).toContain('Service area not published here')
    expect(markup).not.toContain('href="tel:')
    expectForbiddenCopyAbsent(markup)
  })

  it('replaces the ask action with the exact not-joined posture when inquiry is unavailable', () => {
    const markup = renderFirstScreen(catalogFixture(), unavailableInquiry)
    const actions = fragmentFrom(markup).querySelector('[aria-label="Actions for this business"]')

    expect(actions?.textContent).toBe('Copy detailsThis business hasn’t joined AE yet')
    expect(markup).not.toContain('Ask this business')
    expect(markup).toContain(NO_CONTACT_EXPLAINER)
    expect(markup).not.toContain(AE_EXPLAINER_NO_PHONE)
    expect(peerActions(markup)).toEqual([
      { action: 'copy-details', variant: 'secondary' },
    ])
    expectForbiddenCopyAbsent(markup)
  })
})

function renderFirstScreen(
  catalog: PublicRouteCatalogContract,
  inquiryAffordance: PublicInquiryAffordance,
): string {
  return renderToStaticMarkup(
    <ListingFirstScreen
      catalog={catalog}
      trust={buildListingTrustProjection(catalog, inquiryAffordance.kind === 'available')}
      inquiryAffordance={inquiryAffordance}
      inquiryHref={inquiryAffordance.kind === 'available' ? inquiryAffordance.href : ''}
    />,
  )
}

function catalogFixture(
  serviceOverrides: Partial<Pick<PublicRouteServiceContract, 'hoursOrUnknown' | 'serviceArea'>> = {},
  publishedPhone?: string,
): PublicRouteCatalogContract {
  const service: PublicRouteServiceContract = {
    serviceId: SERVICE_ID,
    serviceSlug: brandNonEmpty('emergency-plumbing', 'Slug'),
    businessId: BUSINESS_ID,
    name: 'Emergency plumbing',
    category: 'Plumber',
    summary: 'Urgent plumbing support.',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursOrUnknown: 'Mon–Fri, 8am–5pm',
    firstRequest: {
      mode: 'inquiry_available',
      publicChannel: 'public_business_contact',
      publicDisclosure: 'Send a written inquiry for owner review.',
      rawContactExcluded: true,
    },
    status: 'published',
    capabilities: [],
    ...serviceOverrides,
  }

  return {
    businessId: BUSINESS_ID,
    slug: brandNonEmpty('demo-plumbing', 'Slug'),
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/demo-plumbing',
    ...(publishedPhone === undefined ? {} : { publishedPhone }),
    publicStatus: 'published',
    trustTier: 'listed',
    indexStatus: 'indexed',
    discoveryStatus: 'available',
    photos: [],
    services: [service],
    schemaVersion: 'public-catalog:v1',
    updatedAt: 1_900_000_000_000,
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
  expect(text).not.toMatch(/\b(?:live|open|available|availability|routing|readiness)\b/i)
}
