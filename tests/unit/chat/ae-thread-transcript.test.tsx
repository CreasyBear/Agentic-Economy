/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-dialog'

import { AeThreadTranscript } from '@/components/ae/chat/AeThreadTranscript'
import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { AeThreadScroller } from '@/components/ae/chat/AeThreadScroller'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'

/**
 * The transcript renders provider cards, which link to business pages with
 * TanStack `Link`. `Link` needs router context, so every render in this file
 * goes through a memory router rather than bare `render`.
 */
function render(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/$slug' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/t/$threadId' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <RouterContextProvider router={router}>{children}</RouterContextProvider>
    ),
  })
}

describe('AeThreadTranscript', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders the latest completed shortlist as a terminal decision surface', () => {
    const onChangeCriteria = vi.fn()
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
        onChangeCriteria={onChangeCriteria}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Your options are ready' })).toBeTruthy()
    expect(screen.getByText('Compare the published details, then open a business page when you are ready.')).toBeTruthy()
    expect(screen.queryByText('No reply history yet')).toBeNull()

    const actions = screen.getByLabelText('Shortlist actions')
    const changeCriteria = within(actions).getByRole('button', { name: 'Change criteria' })
    expect(within(actions).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(first.detailUrl)
    expect(within(actions).getByRole('button', { name: 'Copy' }).hasAttribute('disabled')).toBe(false)
    expect(within(actions).getByRole('button', { name: 'Call' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Open the business page for its published contact options.')).toBeTruthy()

    fireEvent.click(changeCriteria)
    expect(onChangeCriteria).toHaveBeenCalledOnce()
    expect(screen.queryByText('Send request')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Continue this thread' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('renders a published phone as a sanitized direct-call link', () => {
    render(
      <AeThreadTranscript
        projection={projectionWithShortlist([provider({ publishedPhone: '0412 345 678' })], 'flexible')}
      />,
    )

    const actions = screen.getByLabelText('Shortlist actions')
    expect(
      within(actions).getByRole('link', { name: 'Call 0412 345 678' }).getAttribute('href'),
    ).toBe('tel:0412345678')
    expect(screen.getByText('Calls go directly to the published business number.')).toBeTruthy()
  })

  it('previews the exact shortlist payload before copying it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const source = provider()

    render(<AeThreadTranscript projection={projectionWithShortlist([source], 'flexible')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    expect(writeText).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Export preview' })
    const visiblePayload = within(dialog).getByLabelText('Export preview text').textContent
    expect(visiblePayload).toContain(source.name)
    expect(visiblePayload).toContain(`${window.location.origin}${source.detailUrl}`)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy summary' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText).toHaveBeenCalledWith(visiblePayload)
    expect(screen.getByText('Summary copied.', { selector: '[role="status"]' })).toBeTruthy()
  })

  it('prioritizes a later phone provider over an earlier inquiry-only provider for today', () => {
    const inquiryOnly = provider({
      citationIndex: 1,
      slug: 'inquiry-only-plumbing',
      name: 'Inquiry Only Plumbing',
      detailUrl: '/inquiry-only-plumbing',
      inquiryUrl: '/inquiry-only-plumbing/inquiry',
    })
    const phoneCapable = provider({
      citationIndex: 2,
      slug: 'phone-capable-plumbing',
      name: 'Phone Capable Plumbing',
      detailUrl: '/phone-capable-plumbing',
      inquiryUrl: '/phone-capable-plumbing/inquiry',
      publishedPhone: '0412 345 678',
    })
    const baseProjection = projectionWithShortlist([inquiryOnly, phoneCapable], 'today')
    const settledTurn = baseProjection.turns.at(0)
    if (settledTurn === undefined) throw new Error('The shortlist fixture must contain its settled turn.')

    render(
      <AeThreadTranscript
        projection={{
          ...baseProjection,
          turns: [{
            ...settledTurn,
            answerCheckSummary: {
              catalogSearches: 1,
              listingsRead: 2,
              listedBusinesses: 2,
              checksPassed: 3,
              checksFailed: 0,
              elapsedMs: 900,
            },
          }],
        }}
      />,
    )

    expect(
      screen.getByText(
        'For today, businesses with published contact details appear first. Phone details are shown only when published.',
      ),
    ).toBeTruthy()
    const urgentContact = screen.getByLabelText('Call first option')
    expect(within(urgentContact).getByText(phoneCapable.name)).toBeTruthy()
    expect(within(urgentContact).queryByText('No reply history yet')).toBeNull()
    expect(
      within(urgentContact).getByRole('link', { name: 'Call 0412 345 678' }).getAttribute('href'),
    ).toBe('tel:0412345678')

    const replayQuery = screen.getByText('Find plumbers near Parramatta')
    const processCopy = screen.getByText('How this was checked', { selector: 'summary' })
    expect(urgentContact.compareDocumentPosition(replayQuery) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(urgentContact.compareDocumentPosition(processCopy) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)

    const orderedProviderLinks = screen
      .getAllByRole('link')
      .filter((link) => link.textContent?.includes(phoneCapable.name) || link.textContent?.includes(inquiryOnly.name))
    expect(orderedProviderLinks.map((link) => link.textContent)).toEqual([
      expect.stringContaining(phoneCapable.name),
      expect.stringContaining(inquiryOnly.name),
    ])
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(phoneCapable.detailUrl)
  })

  it('does not terminalize a selected-provider handoff without a shortlist', () => {
    stubDeterministicChips()
    const handoff = projectionWithSelectedProviderBoundaryTurn()
    const projection: PublicThreadProjection = {
      ...handoff,
      turns: handoff.turns.slice(0, 1),
    }

    render(<AeThreadTranscript projection={projection} />)

    expect(screen.getByText('Message the first listed business')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Your options are ready' })).toBeNull()
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

    expect(screen.getByText('1 listed businesses match.')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Your options are ready' })).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('This answer could not be completed.')
    expect(screen.getByRole('link', { name: 'Start a new ask' }).getAttribute('href')).toBe('/')
  })

  it('renders the exact no-send disclosure after a no-match recovery turn', () => {
    const projection: PublicThreadProjection = {
      threadId: 'thread-no-match',
      title: 'Emergency roofer in Parramatta',
      turns: [{
        turnId: 'turn-no-match',
        seq: 1,
        query: 'Emergency roofer in Parramatta',
        intent: 'refine_search',
        status: 'complete',
        oneLine: 'No listed businesses match this search.',
        workLog: [],
        artifacts: [{
          kind: 'recovery-prompts',
          title: 'Try a narrower search',
          prompts: [],
        }],
      }],
    }

    render(<AeThreadTranscript projection={projection} />)

    expect(screen.getByText('Nothing was sent.', { exact: true }).textContent)
      .toBe('Nothing was sent.')
  })
  it('shows owner Stop for pending replay rows but keeps shared transcripts read-only', async () => {
    const pendingProjection: PublicThreadProjection = {
      threadId: 'thread-pending',
      title: 'Pending answer',
      turns: [{
        turnId: 'turn-pending',
        seq: 1,
        query: 'Find a pending answer',
        intent: 'refine_search',
        status: 'pending',
        oneLine: '',
        workLog: [],
        artifacts: [],
      }],
    }
    const onStopPendingTurn = vi.fn().mockResolvedValue({
      kind: 'stopped',
      threadId: 'thread-pending',
      turnId: 'turn-pending',
    })

    render(
      <AeThreadTranscript
        threadId={pendingProjection.threadId}
        projection={pendingProjection}
        onStopPendingTurn={onStopPendingTurn}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(onStopPendingTurn).toHaveBeenCalledWith('thread-pending', 'turn-pending'))

    cleanup()
    render(<AeThreadTranscript threadId={pendingProjection.threadId} projection={pendingProjection} />)
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(screen.getByText('This answer is still pending. Reload to check its durable status.')).toBeTruthy()
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
    expect(panel.contains(screen.getByText('Continue with these options'))).toBe(true)
    expect(
      panel.contains(
        screen.getByText(
          'Narrow or compare the options already found here, or ask the business about them.',
        ),
      ),
    ).toBe(true)

    fireEvent.click(screen.getByText('Ask Parramatta Emergency Plumbing about this'))

    expect(selectedQuery).toBe('Message Parramatta Emergency Plumbing')
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
        screen.getByText('Use the selected business\'s request form from this thread, or keep narrowing the options.'),
      ),
    ).toBe(true)
    expect(screen.queryByText(/Ask .* about this/)).toBeNull()

    fireEvent.click(screen.getByText('Businesses accepting requests'))

    expect(selectedQuery).toBe('Show only businesses accepting requests')
  })

  it('keeps one polite status for the current pending-to-terminal transition', () => {
    const historyTurn = {
      turnId: 'turn-history',
      seq: 1,
      query: 'Find an earlier answer',
      intent: 'refine_search' as const,
      status: 'complete' as const,
      oneLine: 'Earlier answer remains available.',
      workLog: [],
      artifacts: [{ kind: 'one-line' as const, text: 'Earlier answer remains available.' }],
    }
    const pendingTurn = {
      turnId: 'turn-current',
      seq: 2,
      query: 'Find the current answer',
      intent: 'refine_search' as const,
      status: 'pending' as const,
      oneLine: '',
      workLog: [],
      artifacts: [],
    }
    const pendingProjection: PublicThreadProjection = {
      threadId: 'thread-status',
      title: 'Answer status',
      turns: [historyTurn, pendingTurn],
    }
    const { rerender } = render(<AeThreadTranscript projection={pendingProjection} />)

    expect(screen.queryByRole('log')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('aria-atomic')).toBe('true')
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(status.textContent).toBe('Answer is still pending.')
    expect(screen.getByText('Earlier answer remains available.')).toBeTruthy()

    const completeProjection: PublicThreadProjection = {
      ...pendingProjection,
      turns: [
        historyTurn,
        {
          ...pendingTurn,
          status: 'complete',
          oneLine: 'Current answer is ready.',
        },
      ],
    }
    rerender(<AeThreadTranscript projection={completeProjection} />)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('Answer ready.')
    expect(screen.getByText('Earlier answer remains available.')).toBeTruthy()

    rerender(<AeThreadTranscript projection={completeProjection} />)

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('Earlier answer remains available.')).toBeTruthy()
    expect(screen.getByText('Current answer is ready.')).toBeTruthy()
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0)
  })

  it('keeps the static transcript outside live-region ownership', () => {
    render(
      <AeThreadScroller showJumpButton={false}>
        <AeGenerativeAnswer artifacts={[]} busy phase="streaming" query="Find a plumber near Parramatta" />
      </AeThreadScroller>,
    )

    expect(screen.getByRole('region', { name: 'Chat' })).toBeTruthy()
    expect(screen.queryByRole('log')).toBeNull()
    expect(screen.queryAllByRole('status')).toHaveLength(0)
    expect(screen.queryByText("Checking what's available")).toBeTruthy()
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
        query: 'Message the first listed business',
        intent: 'inquiry_handoff',
        status: 'complete',
        oneLine: 'Parramatta Emergency Plumbing is ready for contact.',
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

