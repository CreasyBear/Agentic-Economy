/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeThreadTranscript } from '@/components/ae/chat/AeThreadTranscript'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'

describe('AeThreadTranscript', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('keeps follow-up chips connected after a providerless boundary turn', () => {
    stubDeterministicChips()
    let selectedQuery: string | null = null

    render(
      <AeThreadTranscript
        projection={projectionWithBoundaryTurn()}
        onFollowUp={(query) => {
          selectedQuery = query
        }}
      />,
    )

    const panel = screen.getByRole('region', { name: 'Continue this thread' })
    expect(panel.contains(screen.getByText('Continue with these listings'))).toBe(true)
    expect(
      panel.contains(
        screen.getByText(
          'Narrow, compare, or prepare a qualified inquiry from the businesses already found in this thread.',
        ),
      ),
    ).toBe(true)

    fireEvent.click(screen.getByText('Prepare qualified inquiry with Parramatta Emergency Plumbing'))

    expect(selectedQuery).toBe('Prepare a qualified inquiry for Parramatta Emergency Plumbing')
  })

  it('labels selected-provider follow-ups as carried from the thread after a boundary turn', () => {
    stubDeterministicChips()
    let selectedQuery: string | null = null

    render(
      <AeThreadTranscript
        projection={projectionWithSelectedProviderBoundaryTurn()}
        onFollowUp={(query) => {
          selectedQuery = query
        }}
      />,
    )

    const panel = screen.getByRole('region', { name: 'Continue this thread' })
    expect(
      panel.contains(
        screen.getByText('Use the selected inquiry path from this thread, or keep narrowing this thread.'),
      ),
    ).toBe(true)
    expect(screen.queryByText(/Prepare qualified inquiry/)).toBeNull()

    fireEvent.click(screen.getByText('Only inquiry-ready listings'))

    expect(selectedQuery).toBe('Show only businesses that accept inquiries')
  })
})

function stubDeterministicChips() {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ llmChipsEnabled: false })))
}

function projectionWithBoundaryTurn(): PublicThreadProjection {
  const source = provider()

  return {
    threadId: 'thread-1',
    title: 'Emergency plumber Parramatta',
    turns: [
      {
        turnId: 'turn-1',
        seq: 1,
        query: 'Emergency plumber Parramatta',
        intent: 'refine_search',
        status: 'complete',
        oneLine: 'One listed business matches.',
        workLog: [],
        artifacts: [{ kind: 'provider-cards', providers: [source] }],
      },
      {
        turnId: 'turn-2',
        seq: 2,
        query: 'Can AE book this for me?',
        intent: 'explain_boundary',
        status: 'complete',
        oneLine: 'AE cannot book, charge, or dispatch.',
        workLog: [],
        artifacts: [
          { kind: 'one-line', text: 'AE cannot book, charge, or dispatch.' },
          {
            kind: 'prose',
            block: 'summary',
            text: 'AE can route you back to a listed provider page.',
          },
          {
            kind: 'what-to-do-now',
            text: 'Use a published inquiry path when the listing offers one.',
          },
        ],
      },
    ],
  }
}

function projectionWithSelectedProviderBoundaryTurn(): PublicThreadProjection {
  const source = provider()

  return {
    threadId: 'thread-1',
    title: 'Emergency plumber Parramatta',
    turns: [
      {
        turnId: 'turn-1',
        seq: 1,
        query: 'Prepare a qualified inquiry for the first listed business',
        intent: 'inquiry_handoff',
        status: 'complete',
        oneLine: 'Parramatta Emergency Plumbing is ready for inquiry review.',
        workLog: [],
        artifacts: [{ kind: 'selected-provider', provider: source }],
      },
      {
        turnId: 'turn-2',
        seq: 2,
        query: 'Can AE book this for me?',
        intent: 'explain_boundary',
        status: 'complete',
        oneLine: 'AE cannot book, charge, or dispatch.',
        workLog: [],
        artifacts: [
          { kind: 'one-line', text: 'AE cannot book, charge, or dispatch.' },
          {
            kind: 'prose',
            block: 'summary',
            text: 'AE can keep the inquiry context, but the business confirms details.',
          },
          {
            kind: 'what-to-do-now',
            text: 'Use the selected inquiry path for owner review.',
          },
        ],
      },
    ],
  }
}

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
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
