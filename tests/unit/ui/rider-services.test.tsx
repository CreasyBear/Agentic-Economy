/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeInstantQuote } from '@/components/ae/services/AeInstantQuote'
import { AeServiceList } from '@/components/ae/services/AeServiceList'
import { AeServiceRow } from '@/components/ae/services/AeServiceRow'
import type { ConsumerPlan } from '@/modules/customer-request/application/public'
import type { ServiceEndpointDto, ServiceDto } from '@/modules/registry/public'

type QuoteResponse = Readonly<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

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
      ...serviceWithDemoQuote,
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
    expect(screen.getAllByText('Price')).toHaveLength(5)
    expect(screen.getAllByText('Preview').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1)
    expect(container.querySelector('[data-variant="primary"]')?.getAttribute('aria-label')).toBe('Get a quote')
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
          price: { kind: 'published', published: serviceWithDemoQuote.ae.offerings[0]!.price!, summary: 'From $95' },
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

  it('keeps quote actions tappable, labels pending work, and demotes refresh', async () => {
    let resolveQuote: ((response: QuoteResponse) => void) | undefined
    const responsePromise = new Promise<QuoteResponse>((resolve) => {
      resolveQuote = resolve
    })
    vi.stubGlobal('fetch', vi.fn(() => responsePromise))

    render(<AeInstantQuote {...quoteProps} />)

    const getQuote = screen.getByRole('button', { name: 'Get a quote' })
    expect(getQuote.className).toContain('min-h-11')
    expect(getQuote.getAttribute('data-variant')).toBe('primary')
    fireEvent.click(getQuote)

    const pending = screen.getByRole('button', { name: 'Getting your quote…' })
    expect(pending.textContent).toContain('Getting your quote…')
    expect(pending.hasAttribute('disabled')).toBe(true)

    if (resolveQuote === undefined) throw new Error('quote response resolver was not installed')
    resolveQuote({
      ok: true,
      status: 200,
      json: async () => ({
        provenance: 'ae_sandbox_provider',
        service: 'Dental check-up',
        price: { amount: { currency: 'AUD', units: '12000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
        nextAvailable: '2030-01-01T10:00:00.000Z',
        validUntil: '2030-01-02T10:00:00.000Z',
      }),
    })

    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy())
    const quoteCard = document.querySelector('[role="status"][tabindex="-1"]')
    if (quoteCard === null) throw new Error('quote card was not rendered')
    await waitFor(() => expect(document.activeElement).toBe(quoteCard))
    const contact = screen.getByRole('link', { name: 'Contact Demo Dental' })
    expect(contact.getAttribute('href')).toBe('/demo-dental')
    expect(contact.getAttribute('data-variant')).toBe('primary')
    expect(contact.className).toContain('min-h-11')
    const refresh = screen.getByRole('button', { name: 'Refresh quote' })
    expect(refresh.className).toContain('min-h-11')
    expect(refresh.getAttribute('data-variant')).toBe('ghost')
    expect(refresh.getAttribute('data-size')).toBe('sm')
    expect(screen.getByText('Price')).toBeTruthy()
  })

  it('makes a refused quote recoverable through the business page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ kind: 'refused', reason: 'quote_refused_internal' }),
    } satisfies QuoteResponse))

    render(<AeInstantQuote {...quoteProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get a quote' }))

    await waitFor(() => expect(screen.getByText('No quote returned')).toBeTruthy())
    expect(screen.queryByText('quote_refused_internal')).toBeNull()
    const contact = screen.getByRole('link', { name: 'See business details' })
    expect(contact.getAttribute('href')).toBe('/demo-dental')
    expect(contact.getAttribute('data-variant')).toBe('primary')
    expect(contact.className).toContain('min-h-11')
    expect(screen.getByRole('button', { name: 'Try again' }).getAttribute('data-variant')).toBe('ghost')
  })
})


const quoteEndpoint = {
  url: '/api/demo-quote',
  description: 'Returns a price for the selected service.',
  providerName: 'Demo Dental',
  serviceName: 'Demo Dental',
  tags: [],
  parameters: [],
  quality: null,
  ae: {
    offeringRef: 'offering:demo-dental:checkup',
    provenance: 'business_declared',
    access: 'open',
    authentication: { kind: 'keyless' },
    execution: 'request_route',
    settlementSupport: 'unpriced',
  },
} satisfies ServiceEndpointDto
const quoteProps = {
  endpoint: quoteEndpoint,
  businessName: 'Demo Dental',
  businessSlug: 'demo-dental',
}

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
    suburb: 'Adelaide',
    stateTerritory: 'SA',
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

const serviceWithDemoQuote = {
  ...serviceWithNoQuotePath,
  ae: {
    ...serviceWithNoQuotePath.ae,
    source: 'ae_sandbox' as const,
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
  endpoints: [quoteEndpoint],
} satisfies ServiceDto

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
  const claimRoute = createRoute({ getParentRoute: () => rootRoute, path: '/claim' })
  const routeTree = rootRoute.addChildren([indexRoute, claimRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}