// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { RouteReviewCard } from '@/components/ae/customer-request/panels/routes'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'

/**
 * The confirm gate is the only irreversible decision a customer makes, so it
 * has to stay scannable. These cases lock the three visibility tiers in place:
 * the facts needed to decide stay immediate, the commitment detail stays
 * expanded, and registered background detail stays reachable but out of the
 * way. Astryx Collapsible keeps collapsed content mounted, so every assertion
 * here is about visibility, never about absence.
 */

const noop = () => undefined
const asyncNoop = async () => undefined

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { /* layout observation is not exercised in jsdom */ }
    unobserve() { /* layout observation is not exercised in jsdom */ }
    disconnect() { /* layout observation is not exercised in jsdom */ }
  })
})

beforeEach(() => {
  // This repo does not enable testing-library auto-cleanup.
  cleanup()
})

describe('route review keeps one decision immediate', () => {
  it('shows result, cost, expiry, and a sharing summary without opening anything', () => {
    renderReview()

    expect(screen.getByText('Same-day burst pipe repair')).toBeDefined()
    expect(screen.getByText('Maximum $420.00')).toBeDefined()
    expect(screen.getByText('Cost')).toBeDefined()
    expect(screen.getByText(/Confirm before/)).toBeDefined()
    // The summary counts what leaves, so the customer can judge exposure at a
    // glance instead of reading the recipient list.
    expect(screen.getByText('2 details to North Star Services')).toBeDefined()
  })

  it('gives the surface exactly one primary action', () => {
    renderReview()

    const primary = screen.getAllByRole('button').filter((button) => button.textContent === 'Confirm this choice')
    expect(primary.length).toBe(1)
    // Starting an unrelated Request is not a decision this surface offers.
    expect(screen.queryByRole('button', { name: /Start a new Request/i })).toBeNull()
  })

  it('keeps commitment detail expanded because it is what confirming buys', () => {
    renderReview()

    expect(insideCollapsedRegion(screen.getByText('What would be shared'))).toBe(false)
    expect(insideCollapsedRegion(screen.getByText('What starting could change'))).toBe(false)
    expect(insideCollapsedRegion(screen.getByText('Cancellation'))).toBe(false)
  })

  it('parks registered background detail behind one trigger, still reachable', () => {
    renderReview()

    const trigger = screen.getByRole('button', {
      name: /Uncertainty, commercial relationships, recovery, and evidence/i,
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(insideCollapsedRegion(screen.getByText('What remains uncertain'))).toBe(true)

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(insideCollapsedRegion(screen.getByText('What remains uncertain'))).toBe(false)
    expect(insideCollapsedRegion(screen.getByText('Commercial relationships'))).toBe(false)
    expect(insideCollapsedRegion(screen.getByText('Evidence expected'))).toBe(false)
    expect(insideCollapsedRegion(screen.getByText(/Choice code/))).toBe(false)
  })

  it('hides the second form until the customer says the option does not work', () => {
    renderReview()

    const trigger = screen.getByRole('button', { name: /This option does not work\?/i })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(insideCollapsedRegion(screen.getByLabelText(/Why does this option not work\?/i))).toBe(true)

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(insideCollapsedRegion(screen.getByLabelText(/Why does this option not work\?/i))).toBe(false)
  })

  it('never drops disclosure from the accessibility tree', () => {
    renderReview()

    // Collapsed is not deleted. Every registered section is still present for a
    // screen reader and for the copy scans that police these claims.
    for (const label of [
      'What remains uncertain',
      'Commercial relationships',
      'If something goes wrong',
      'Evidence expected',
    ]) {
      expect(screen.getByText(label)).toBeDefined()
    }
  })
})

/**
 * Astryx Collapsible expresses collapsed state through `aria-expanded` on the
 * trigger and a StyleX class on the region it controls. jsdom applies no
 * stylesheet, so the honest assertion is the ARIA contract: is this text inside
 * a region whose trigger is currently collapsed?
 */
function insideCollapsedRegion(element: HTMLElement): boolean {
  const regionIds = new Set(
    screen.getAllByRole('button')
      .filter((button) => button.getAttribute('aria-expanded') === 'false')
      .map((button) => button.getAttribute('aria-controls'))
      .filter((id): id is string => id !== null),
  )
  for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
    if (node.id !== '' && regionIds.has(node.id)) return true
  }
  return false
}

function renderReview() {
  return render(
    <RouteReviewCard
      projection={projection}
      routeRef="route:one"
      turns={[]}
      confirm={asyncNoop}
      reportUnavailable={asyncNoop}
      routeFeedback=""
      setRouteFeedback={noop}
      decline={noop}
      edit={noop}
    />,
  )
}

const route = {
  routeRef: 'route:one',
  availability: 'current',
  result: {
    summary: 'Same-day burst pipe repair',
    deliverables: ['Repair report'],
  },
  businesses: [{ businessRef: 'business:one', name: 'North Star Services' }],
  maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 42_000 },
  validUntil: 1_800_000_000_000,
  quoteDigest: 'digest:choice',
  dataUse: {
    recipients: [{
      recipientRef: 'business:one',
      name: 'North Star Services',
      purposes: ['service_delivery'],
      fields: [
        { label: 'Street address', classification: 'contact' },
        { label: 'Phone number', classification: 'contact' },
      ],
    }],
  },
  effects: [{ kind: 'information_shared', reversibility: 'not_applicable' }],
  uncertainty: ['price_needs_confirmation'],
  comparison: {
    duration: 'not_declared',
    commercialInfluence: { status: 'none' },
  },
  recovery: [{ step: 1, businessName: 'North Star Services', posture: 'retry_safe' }],
  fallback: { available: false, alternatives: [] },
  cancellation: { summary: 'Cancel free until a plumber is dispatched.' },
  evidence: [{ label: 'Completion photo' }],
} as unknown as NonNullable<CustomerRequestView['decision']>['routes'][number]

const projection = {
  kind: 'request',
  requestRef: 'request:one',
  revision: 3,
  state: 'options_ready',
  summary: 'Burst pipe at home, needs a plumber today.',
  nextAction: 'review_options',
  missingFields: [],
  criteria: [],
  options: [],
  decision: {
    generationRef: 'generation:1',
    requestRevision: 3,
    routes: [route],
    actions: {
      start: { summary: 'Starting contacts the business and begins the repair.' },
    },
  },
} as unknown as CustomerRequestView
