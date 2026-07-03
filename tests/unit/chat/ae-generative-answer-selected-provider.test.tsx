/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'

describe('AeGenerativeAnswer selected provider confirmation', () => {
  afterEach(() => {
    cleanup()
  })

  it('presents provider matches as an actionable shortlist before answer prose', () => {
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

    render(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="plumber Parramatta"
        layoutProfile="discovery_full"
        phase="complete"
        threadId="thread-123"
      />,
    )

    const shortlist = screen.getByRole('region', { name: 'Provider shortlist' })
    const summary = screen.getByText('The business handles timing, price, and availability.')

    expect(shortlist.contains(screen.getByText('These are the listed businesses AE found for this request.'))).toBe(true)
    expect(shortlist.contains(screen.getByText('Open inquiry form'))).toBe(true)
    expect(shortlist.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the chosen provider before routing to the inquiry form', () => {
    const selected = provider()
    const artifacts: AnswerArtifact[] = [
      { kind: 'one-line', text: 'Ready to send a qualified inquiry to Demo Plumbing.' },
      { kind: 'selected-provider', provider: selected },
      {
        kind: 'what-to-do-now',
        text: 'Open Demo Plumbing\'s inquiry form, describe the job, and submit it for owner review.',
      },
    ]

    render(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="message the first one"
        layoutProfile="refinement_compact"
        phase="complete"
        threadId="thread-123"
      />,
    )

    expect(screen.getByText('Selected provider')).toBeTruthy()
    expect(screen.getByText('Demo Plumbing')).toBeTruthy()
    expect(screen.getByText('Choice 1 in this answer · Plumber · Parramatta')).toBeTruthy()
    expect(screen.getByText('Inquiry form published')).toBeTruthy()
    expect(screen.getByText('Open inquiry form').closest('a')?.getAttribute('href')).toBe(
      '/demo-plumbing/inquiry?from=thread&id=thread-123',
    )
    expect(screen.getByText('Review listing').closest('a')?.getAttribute('href')).toBe(
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

    render(
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
