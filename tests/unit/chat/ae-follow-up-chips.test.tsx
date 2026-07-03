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
      panel.contains(screen.getByText('Narrow, compare, or prepare a qualified inquiry from the listed businesses above.')),
    ).toBe(true)

    fireEvent.click(screen.getByText('Prepare qualified inquiry with Parramatta Emergency Plumbing'))

    expect(onSelect).toHaveBeenCalledWith('Prepare a qualified inquiry for Parramatta Emergency Plumbing')
  })

  it('submits compare chips as carried thread follow-ups', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ llmChipsEnabled: false }))))
    const onSelect = vi.fn()

    render(<AeFollowUpChips turn={turn()} onSelect={onSelect} />)

    fireEvent.click(screen.getByText('Compare the top two listings'))

    expect(onSelect).toHaveBeenCalledWith('Compare the top two')
  })

  it('keeps the inquiry loop available after a compare-table answer', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ llmChipsEnabled: false }))))
    const onSelect = vi.fn()

    render(<AeFollowUpChips turn={turn({
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
    })} onSelect={onSelect} />)

    expect(screen.getByRole('region', { name: 'Continue this thread' })).toBeTruthy()
    fireEvent.click(screen.getByText('Prepare qualified inquiry with Top Inquiry Ready'))

    expect(onSelect).toHaveBeenCalledWith('Prepare a qualified inquiry for Top Inquiry Ready')
  })

  it('states the contact boundary when listed businesses lack an inquiry path', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ llmChipsEnabled: false }))))

    render(<AeFollowUpChips turn={turn({
      artifacts: [
        {
          kind: 'provider-cards',
          providers: [providerWithoutInquiry()],
        },
      ],
    })} onSelect={vi.fn()} />)

    const panel = screen.getByRole('region', { name: 'Continue this thread' })
    expect(panel.contains(screen.getByText(
      'These listings need a published inquiry path before AE can route contact. Narrow, compare, or review a listing.',
    ))).toBe(true)
    expect(screen.queryByText(/Prepare qualified inquiry/)).toBeNull()
  })

  it('keeps the follow-up panel available after a selected-provider handoff', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ llmChipsEnabled: false }))))
    const onSelect = vi.fn()

    render(<AeFollowUpChips turn={turn({
      intent: 'inquiry_handoff',
      query: 'Prepare a qualified inquiry for the first listed business',
      artifacts: [
        {
          kind: 'selected-provider',
          provider: provider({ slug: 'top-inquiry-ready', name: 'Top Inquiry Ready' }),
        },
      ],
    })} onSelect={onSelect} />)

    const panel = screen.getByRole('region', { name: 'Continue this thread' })
    expect(panel.contains(screen.getByText('Continue with these listings'))).toBe(true)
    expect(panel.contains(screen.getByText('Use the selected inquiry path above, or keep narrowing this thread.'))).toBe(true)
    expect(screen.queryByText(/Prepare qualified inquiry/)).toBeNull()
    fireEvent.click(screen.getByText('Only inquiry-ready listings'))

    expect(onSelect).toHaveBeenCalledWith('Show only businesses that accept inquiries')
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
