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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ llmChipsEnabled: false }))))
    const onSelect = vi.fn()

    render(<AeFollowUpChips turn={turn()} onSelect={onSelect} />)

    const panel = screen.getByRole('region', { name: 'Continue this thread' })
    expect(panel.contains(screen.getByText('Continue with these listings'))).toBe(true)
    expect(
      panel.contains(screen.getByText('Narrow, compare, or start a qualified inquiry from the listed businesses above.')),
    ).toBe(true)

    fireEvent.click(screen.getByText('Start qualified inquiry'))

    expect(onSelect).toHaveBeenCalledWith('Send a qualified inquiry to the first listed business')
  })
})

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
