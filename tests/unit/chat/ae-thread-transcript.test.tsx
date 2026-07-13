/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeThreadTranscript } from '@/components/ae/chat/AeThreadTranscript'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'

describe('AeThreadTranscript', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders the latest completed shortlist as a terminal decision surface', () => {
    let selectedQuery: string | null = null
    const first = provider()
    const second = provider({
      citationIndex: 2,
      slug: 'westmead-local-plumbing',
      name: 'Westmead Local Plumbing',
      detailUrl: '/westmead-local-plumbing',
      inquiryUrl: '/westmead-local-plumbing/inquiry',
    })

    render(
      <AeThreadTranscript
        projection={projectionWithShortlist([first, second], 'flexible')}
        onFollowUp={(query) => {
          selectedQuery = query
        }}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Your shortlist is ready' })).toBeTruthy()
    expect(screen.getByText('Compare the listed facts, then open a business page when you are ready.')).toBeTruthy()
    expect(screen.getAllByText('No reply history yet')).toHaveLength(2)

    const actions = screen.getByLabelText('Shortlist actions')
    const changeCriteria = within(actions).getByRole('button', { name: 'Change criteria' })
    expect(within(actions).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(first.detailUrl)
    expect(within(actions).getByRole('button', { name: 'Copy' }).hasAttribute('disabled')).toBe(false)
    expect(within(actions).getByRole('button', { name: 'Call' }).hasAttribute('disabled')).toBe(true)
    expect(within(actions).getByRole('link', { name: 'Close' }).getAttribute('href')).toBe('/')

    fireEvent.click(changeCriteria)
    expect(selectedQuery).toBe('Change my shortlist criteria')
    expect(screen.queryByText('Send request')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Continue this thread' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('copies an absolute business URL and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const source = provider()

    render(<AeThreadTranscript projection={projectionWithShortlist([source], 'flexible')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText).toHaveBeenCalledWith(
      `${source.name}\nLocation: Parramatta, NSW\nBusiness page: ${window.location.origin}${source.detailUrl}`,
    )
    expect(screen.getByText('Shortlist copied.', { selector: '[role="status"]' })).toBeTruthy()
  })

  it('puts a provider with a published inquiry path first when the need is today', () => {
    const { inquiryUrl: _inquiryUrl, ...listingOnly } = provider({
      citationIndex: 1,
      slug: 'listing-only-plumbing',
      name: 'Listing Only Plumbing',
      detailUrl: '/listing-only-plumbing',
    })
    const actionable = provider({
      citationIndex: 2,
      slug: 'actionable-plumbing',
      name: 'Actionable Plumbing',
      detailUrl: '/actionable-plumbing',
      inquiryUrl: '/actionable-plumbing/inquiry',
    })

    render(<AeThreadTranscript projection={projectionWithShortlist([listingOnly, actionable], 'today')} />)

    expect(
      screen.getByText(
        'For today, listings with a published contact path appear first. Phone details are shown only when published.',
      ),
    ).toBeTruthy()
    const orderedProviderLinks = screen
      .getAllByRole('link')
      .filter((link) => link.textContent === actionable.name || link.textContent === listingOnly.name)
    expect(orderedProviderLinks.map((link) => link.textContent)).toEqual([actionable.name, listingOnly.name])
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(actionable.detailUrl)
  })

  it('does not terminalize a selected-provider handoff without a shortlist', () => {
    stubDeterministicChips()
    const handoff = projectionWithSelectedProviderBoundaryTurn()
    const projection: PublicThreadProjection = {
      ...handoff,
      turns: handoff.turns.slice(0, 1),
    }

    render(<AeThreadTranscript projection={projection} />)

    expect(screen.getByText('Prepare a qualified inquiry for the first listed business')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Your shortlist is ready' })).toBeNull()
  })

  it('does not terminalize an earlier shortlist when a newer turn has errored', () => {
    stubDeterministicChips()
    const shortlist = projectionWithShortlist([provider()], 'flexible')
    const projection: PublicThreadProjection = {
      ...shortlist,
      turns: [
        ...shortlist.turns,
        {
          turnId: 'turn-error',
          seq: 2,
          query: 'Only businesses open now',
          intent: 'filter_known',
          status: 'error',
          oneLine: 'The answer could not be built right now.',
          workLog: [],
          artifacts: [],
        },
      ],
    }

    render(<AeThreadTranscript projection={projection} />)

    expect(screen.getByText('Parramatta Emergency Plumbing')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Your shortlist is ready' })).toBeNull()
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

function projectionWithShortlist(
  providers: readonly AnswerSource[],
  timing: 'today' | 'flexible',
): PublicThreadProjection {
  return {
    threadId: 'thread-shortlist',
    title: 'Plumbers near Parramatta',
    turns: [{
      turnId: 'turn-shortlist',
      seq: 1,
      query: 'Find plumbers near Parramatta',
      intent: 'refine_search',
      status: 'complete',
      oneLine: `${providers.length} listed businesses match.`,
      workLog: [],
      artifacts: [{ kind: 'provider-cards', providers }],
      timing,
    }],
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
