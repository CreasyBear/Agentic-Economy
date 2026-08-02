/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { ReactElement } from 'react'

describe('AeGenerativeAnswer selected provider confirmation', () => {
  afterEach(() => {
    cleanup()
  })

  it('leads with the grounded answer before the supporting shortlist', () => {
    const artifacts: AnswerArtifact[] = [
      { kind: 'one-line', text: 'One listed business matches this request.' },
      { kind: 'provider-cards', providers: [provider()] },
      {
        kind: 'prose',
        block: 'summary',
        text: 'The business handles timing, price, and availability.',
      },
      {
        kind: 'what-to-do-now',
        text: 'Open the listing or inquiry form once the fit looks right.',
      },
    ]

    renderWithRouter(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="plumber Parramatta"
        layoutProfile="discovery_full"
        phase="complete"
        threadId="thread-123"
      />,
    )

    const shortlist = screen.getByRole('region', { name: 'Business shortlist' })
    const summary = screen.getByText('The business handles timing, price, and availability.')

    expect(shortlist.contains(screen.getByText('These are the businesses AE found for this request.'))).toBe(true)
    expect(shortlist.contains(screen.getByText('Ask this business'))).toBe(true)
    expect(summary.compareDocumentPosition(shortlist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('How AE checked this').closest('details')?.open).toBe(false)
  })

  it('shows the chosen provider before routing to the inquiry form', () => {
    const selected = provider()
    const artifacts: AnswerArtifact[] = [
      { kind: 'one-line', text: "Ready to open Demo Plumbing's qualified inquiry form." },
      { kind: 'selected-provider', provider: selected },
      {
        kind: 'what-to-do-now',
        text: 'Open Demo Plumbing\'s inquiry form, describe the job, and submit it for owner review.',
      },
    ]

    renderWithRouter(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="message the first one"
        layoutProfile="refinement_compact"
        phase="complete"
        threadId="thread-123"
      />,
    )

    expect(screen.getByText('Selected business')).toBeTruthy()
    expect(screen.getByText('Demo Plumbing')).toBeTruthy()
    expect(screen.getByText('Choice 1 from this thread · Plumber · Parramatta')).toBeTruthy()
    expect(screen.getByText('Inquiry form published')).toBeTruthy()
    expect(screen.getByText(/AE can open this business's qualified inquiry form for owner review/)).toBeTruthy()
    expect(screen.getByText('Open inquiry form').closest('a')?.getAttribute('href')).toBe(
      '/demo-plumbing/inquiry?from=thread&id=thread-123',
    )
    expect(screen.getByText('Review business').closest('a')?.getAttribute('href')).toBe(
      '/demo-plumbing?from=thread&id=thread-123',
    )
  })

  it('keeps thread origin on comparison table listing links', () => {
    const artifacts: AnswerArtifact[] = [
      { kind: 'one-line', text: 'Compare these two listed businesses.' },
      {
        kind: 'provider-compare-table',
        providers: [
          provider(),
          provider({ citationIndex: 2, slug: 'northside-plumbing', name: 'Northside Plumbing', detailUrl: '/northside-plumbing' }),
        ],
      },
      {
        kind: 'what-to-do-now',
        text: 'Open the listing that fits, then use an inquiry path when published.',
      },
    ]

    renderWithRouter(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="compare the top two"
        layoutProfile="compare_pair"
        phase="complete"
        threadId="thread-compare"
      />,
    )

    expect(screen.getByText('Demo Plumbing').closest('a')?.getAttribute('href')).toBe(
      '/demo-plumbing?from=thread&id=thread-compare',
    )
    expect(screen.getByText('Northside Plumbing').closest('a')?.getAttribute('href')).toBe(
      '/northside-plumbing?from=thread&id=thread-compare',
    )
    expect(screen.queryByText('See full comparison')).toBeNull()
    expect(screen.getByText('Demo Plumbing')).toBeTruthy()
    expect(screen.getByText('Northside Plumbing')).toBeTruthy()
  })

  it('puts full comparison behind disclosure only when a summary leads', () => {
    const artifacts: AnswerArtifact[] = [
      { kind: 'one-line', text: 'Compare these two listed businesses.' },
      {
        kind: 'provider-compare-table',
        providers: [
          provider(),
          provider({ citationIndex: 2, slug: 'northside-plumbing', name: 'Northside Plumbing' }),
        ],
      },
      {
        kind: 'prose',
        block: 'summary',
        text: 'Demo Plumbing is the stronger fit on the facts currently supplied.',
      },
    ]

    renderWithRouter(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="compare the top two"
        layoutProfile="compare_pair"
        phase="complete"
      />,
    )

    const summary = screen.getByText('Demo Plumbing is the stronger fit on the facts currently supplied.')
    const disclosure = screen.getByText('See full comparison')

    expect(summary.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(disclosure.closest('details')?.open).toBe(false)
  })
})

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
  return {
    citationIndex: 1,
    slug: 'demo-plumbing',
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    serviceArea: 'Parramatta',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: 'Responds ~22m',
    trustCue: 'Responds ~22m - Checked',
    nextStepLabel: 'Send inquiry',
    detailUrl: '/demo-plumbing',
    services: [],
    inquiryUrl: '/demo-plumbing/inquiry',
    ...overrides,
  }
}

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$slug' })
  const inquiryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$slug/inquiry' })
  const routeTree = rootRoute.addChildren([slugRoute, inquiryRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
