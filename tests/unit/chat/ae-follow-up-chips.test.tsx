/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeFollowUpChips } from '@/components/ae/chat/AeSuggestionChips'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

describe('AeFollowUpChips', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('frames follow-up choices as the next loop from the listed businesses', () => {
    stubDeterministicChips()
    let selectedQuery: string | null = null

    render(<AeFollowUpChips turn={turn()} onSelect={(query) => {
      selectedQuery = query
    }} />)

    const panel = screen.getByRole('region', { name: 'Continue this thread' })
    expect(panel.contains(screen.getByText('Continue with these options'))).toBe(true)
    expect(
      panel.contains(
        screen.getByText('Narrow or compare the options above, or ask the business about them.'),
      ),
    ).toBe(true)

    fireEvent.click(screen.getByText('Ask Parramatta Emergency Plumbing about this'))

    expect(selectedQuery).toBe('Message Parramatta Emergency Plumbing')
  })

  it('submits compare chips as carried thread follow-ups', () => {
    stubDeterministicChips()
    let selectedQuery: string | null = null

    render(<AeFollowUpChips turn={turn()} onSelect={(query) => {
      selectedQuery = query
    }} />)

    fireEvent.click(screen.getByText('Compare the top two matches'))

    expect(selectedQuery).toBe('Compare the top two')
  })

  it('keeps the inquiry loop available after a compare-table answer', () => {
    stubDeterministicChips()
    let selectedQuery: string | null = null

    render(
      <AeFollowUpChips
        turn={turn({
          intent: 'compare_known',
          artifacts: [
            {
              kind: 'provider-compare-table',
              providers: [
                provider({ citationIndex: 1, slug: 'top-inquiry-ready', name: 'Top Inquiry Ready' }),
                providerWithoutInquiry({ citationIndex: 2, slug: 'review-only', name: 'Review Only Plumbing' }),
              ],
            },
          ],
        })}
        onSelect={(query) => {
          selectedQuery = query
        }}
      />,
    )

    expect(screen.getByRole('region', { name: 'Continue this thread' })).toBeTruthy()
    fireEvent.click(screen.getByText('Ask Top Inquiry Ready about this'))

    expect(selectedQuery).toBe('Message Top Inquiry Ready')
  })

  it('states the contact boundary when listed businesses lack an inquiry path', () => {
    stubDeterministicChips()

    render(
      <AeFollowUpChips
        turn={turn({
          artifacts: [
            {
              kind: 'provider-cards',
              providers: [providerWithoutInquiry()],
            },
          ],
        })}
        onSelect={() => undefined}
      />,
    )

    const panel = screen.getByRole('region', { name: 'Continue this thread' })
    expect(
      panel.contains(
        screen.getByText(
          'These options do not have a request form yet. Narrow, compare, or review a business.',
        ),
      ),
    ).toBe(true)
    expect(screen.queryByText(/Ask .* about this/)).toBeNull()
  })

  it('keeps the follow-up panel available after a selected-provider handoff', () => {
    stubDeterministicChips()
    let selectedQuery: string | null = null

    render(
      <AeFollowUpChips
        turn={turn({
          intent: 'inquiry_handoff',
          query: 'Message the first listed business',
          artifacts: [
            {
              kind: 'selected-provider',
              provider: provider({ slug: 'top-inquiry-ready', name: 'Top Inquiry Ready' }),
            },
          ],
        })}
        onSelect={(query) => {
          selectedQuery = query
        }}
      />,
    )

    const panel = screen.getByRole('region', { name: 'Continue this thread' })
    expect(panel.contains(screen.getByText('Continue with these options'))).toBe(true)
    expect(panel.contains(screen.getByText('Use the selected business\'s request form above, or keep narrowing the options.'))).toBe(true)
    expect(screen.queryByText(/Ask .* about this/)).toBeNull()
    fireEvent.click(screen.getByText('Businesses accepting requests'))

    expect(selectedQuery).toBe('Show only businesses accepting requests')
  })
})

function stubDeterministicChips() {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ llmChipsEnabled: false })))
}

function turn(overrides: Partial<PublicThreadTurn> = {}): PublicThreadTurn {
  return {
    turnId: 'turn-1',
    seq: 1,
    query: 'emergency plumber parramatta',
    intent: 'refine_search',
    status: 'complete',
    oneLine: 'One listed business matches.',
    workLog: [],
    artifacts: [
      {
        kind: 'provider-cards',
        providers: [
          {
            citationIndex: 1,
            slug: 'parramatta-emergency-plumbing',
            name: 'Parramatta Emergency Plumbing',
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
            detailUrl: '/parramatta-emergency-plumbing',
            services: [],
            inquiryUrl: '/parramatta-emergency-plumbing/inquiry',
          },
          {
            citationIndex: 2,
            slug: 'westmead-plumbing',
            name: 'Westmead Plumbing',
            category: 'Plumber',
            suburb: 'Westmead',
            stateTerritory: 'NSW',
            serviceArea: 'Westmead',
            hoursLabel: 'Hours supplied',
            availabilityLabel: 'Published',
            trustLabel: 'Checked',
            responseTimeLabel: 'Responds ~22m',
            trustCue: 'Responds ~22m - Checked',
            nextStepLabel: 'Review listing',
            detailUrl: '/westmead-plumbing',
            services: [],
          },
        ],
      },
    ],
    ...overrides,
  }
}

function provider(
  overrides: Partial<Extract<PublicThreadTurn['artifacts'][number], { kind: 'provider-cards' }>['providers'][number]> = {},
) {
  return {
    citationIndex: 1,
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
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
    detailUrl: '/parramatta-emergency-plumbing',
    services: [],
    inquiryUrl: '/parramatta-emergency-plumbing/inquiry',
    ...overrides,
  }
}

function providerWithoutInquiry(
  overrides: Partial<Extract<PublicThreadTurn['artifacts'][number], { kind: 'provider-cards' }>['providers'][number]> = {},
) {
  const { inquiryUrl: _inquiryUrl, ...source } = provider(overrides)
  return source
}
