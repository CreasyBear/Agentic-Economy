/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeServiceList } from '@/components/ae/services/AeServiceList'
import { AeServiceRow } from '@/components/ae/services/AeServiceRow'
import type { ConsumerPlan } from '@/modules/customer-request/application/public'
import type { ServiceDto } from '@/modules/registry/public'


afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('rider service surfaces', () => {
  it('uses plain-language copy and a contact action when a service has no instant quote path', () => {
    render(<AeServiceRow service={serviceWithNoQuotePath} />)

    expect(screen.getByText('Dental check-up · Adelaide, SA')).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    const contact = screen.getByRole('link', { name: 'See business details' })
    expect(contact.getAttribute('href')).toBe('/demo-dental')
    expect(contact.getAttribute('data-variant')).toBe('secondary')
    expect(contact.className).toContain('min-h-11')
    expect(document.body.textContent?.match(/endpoint|sandbox|offering|capability|provenance|slug|revision|projection/gi)).toBeNull()
  })

  it('turns an ask into three comparable options with one recommended action', () => {
    const services = Array.from({ length: 5 }, (_, index) => ({
      ...serviceWithPublishedPrice,
      id: `service:dental-checkup-${index}`,
      name: `Dental check-up option ${index + 1}`,
    }))
    const { container } = renderWithRouter(
      <AeServiceList services={services} query="dental check-up in Adelaide" />,
    )

    expect(screen.getByRole('heading', { name: 'Compare your options' })).toBeTruthy()
    expect(screen.getByText('Best match for your ask')).toBeTruthy()
    const answerList = container.querySelector('section > ol')
    expect(answerList?.children).toHaveLength(3)
    const moreMatches = container.querySelector('details > ol')
    expect(moreMatches?.children).toHaveLength(2)
    expect(screen.getByText('More matches (2)')).toBeTruthy()
    expect(screen.getAllByText('Published price')).toHaveLength(5)
    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1)
    expect(container.querySelector('[data-variant="primary"]')?.textContent).toContain('See business details')
  })

  it('renders one-step frontier and comparable plan options with accessible state text', () => {
    const plan: ConsumerPlan = {
      kind: 'plan',
      destination: { label: 'Dental check-up in Adelaide', request: 'Dental check-up in Adelaide' },
      steps: [{
        step: 1,
        title: 'Find a dental check-up',
        purpose: 'Compare the published options.',
        state: 'frontier',
        dependsOn: [],
        options: [{
          optionRef: 'option-1',
          business: { slug: 'demo-dental', name: 'Demo Dental', location: 'Adelaide, SA' },
          offering: { name: 'Dental check-up', summary: 'A routine check-up.' },
          price: { kind: 'published', published: serviceWithPublishedPrice.ae.offerings[0]!.price!, summary: 'From $95' },
          availability: { kind: 'needs_confirmation' },
          nextAction: { kind: 'inspect', label: 'See business details', href: '/demo-dental' },
          evidence: { source: 'business_published' },
        }],
        nextAction: { kind: 'compare', label: 'Compare these options' },
      }],
      frontier: {
        step: 1,
        availableActions: [{ kind: 'compare', label: 'Compare these options' }],
      },
      decisions: [],
      authority: 'inspect_only',
    }

    renderWithRouter(<AeServiceList services={[]} query="dental check-up in Adelaide" plan={plan} />)

    expect(screen.getByRole('heading', { name: 'Dental check-up in Adelaide' })).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.getByText('Timing is not published; ask the business')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See business details' }).getAttribute('href')).toBe('/demo-dental')
    expect(document.body.textContent?.match(/booking|reservation|checkout|payment|dispatch|fulfil/gi)).toBeNull()
  })

  it('gives an unmatched ask a useful retry and clear browsing boundary', () => {
    const { container } = renderWithRouter(
      <AeServiceList services={[]} query="moon dentist in Adelaide" />,
    )

    expect(screen.getByRole('heading', { name: 'Expand the network for this ask' })).toBeTruthy()
    expect(screen.getByText(/Businesses publish what they do here so people and agents can bring them work/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'List your business' }).getAttribute('href')).toBe('/claim?source=supply')
    expect(screen.getByRole('link', { name: 'Try another ask' }).getAttribute('href')).toBe('/')
    expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1)
  })

})



const baseOffering = {
  offeringRef: 'offering:demo-dental:checkup',
  revision: 1,
  name: 'Dental check-up',
  category: 'Dental care',
  summary: 'A routine dental check-up.',
  support: { integrated: false, routeable: false },
} satisfies ServiceDto['ae']['offerings'][number]

const serviceWithNoQuotePath = {
  id: 'demo-dental',
  name: 'Demo Dental',
  category: 'Dental care',
  networks: [],
  enriched: false,
  integrationType: '3P',
  serviceName: 'Demo Dental',
  tags: [],
  ae: {
    businessContext: { kind: 'local_human', suburb: 'Adelaide', stateTerritory: 'SA' },
    publicUrl: '/demo-dental',
    trustTier: 'claimed',
    photos: [] as const,
    observedAt: 1,
    disposition: 'current',
    source: 'business_published',
    offerings: [baseOffering],
    links: { business: '/demo-dental', manifest: '/demo-dental.txt' },
  },
  endpoints: [],
} satisfies ServiceDto

const serviceWithPublishedPrice = {
  ...serviceWithNoQuotePath,
  ae: {
    ...serviceWithNoQuotePath.ae,
    offerings: [
      {
        ...baseOffering,
        price: {
          kind: 'fixed',
          amount: { currency: 'AUD', units: '9500', exponent: 2 },
          unit: 'visit',
          taxTreatment: 'inclusive',
        },
      },
    ],
  },
} satisfies ServiceDto

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
  const claimRoute = createRoute({ getParentRoute: () => rootRoute, path: '/claim' })
  const routeTree = rootRoute.addChildren([indexRoute, claimRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}