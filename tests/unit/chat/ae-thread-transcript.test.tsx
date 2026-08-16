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
import type {
  AnswerArtifact,
  AnswerOperationCandidate,
  AnswerSource,
} from '@/modules/answer/public'
import { answerOperationCandidateSetDigest } from '@/modules/answer/public'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

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
    createRoute({ getParentRoute: () => rootRoute, path: '/operations/invocations/$invocationRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/operations/$operationRef' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return rtlRender(<AeThreadScroller>{ui}</AeThreadScroller>, {
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
    const processCopy = screen.getByRole('button', { name: 'How this was checked' })
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
    expect(screen.getByRole('alert').textContent).toContain('Unable to finish this response.')
    expect(screen.getByRole('link', { name: 'New chat' }).getAttribute('href')).toBe('/')
  })

  it('explains a no-match result and suggests how to recover', () => {
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

    expect(screen.getByText(
      'No matching businesses were found. Try changing the service or location.',
      { exact: true },
    )).toBeTruthy()
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
    expect(screen.getByText('This response is taking longer than expected.')).toBeTruthy()
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

  it('keeps one stable polite status node and updates only its text', () => {
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
    const { rerender } = render(<AeThreadTranscript projection={null} />)
    const status = screen.getByRole('status')

    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('aria-atomic')).toBe('true')
    expect(status.textContent).toBe('')
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)

    rerender(<AeThreadScroller><AeThreadTranscript projection={pendingProjection} /></AeThreadScroller>)

    expect(screen.getAllByRole('log')).toHaveLength(1)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toBe(status)
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
    rerender(<AeThreadScroller><AeThreadTranscript projection={completeProjection} /></AeThreadScroller>)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('Answer ready.')
    expect(screen.getByText('Earlier answer remains available.')).toBeTruthy()

    rerender(<AeThreadScroller><AeThreadTranscript projection={completeProjection} /></AeThreadScroller>)

    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('')
    expect(screen.getByText('Earlier answer remains available.')).toBeTruthy()
    expect(screen.getByText('Current answer is ready.')).toBeTruthy()
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
  })

  it('renders all four bounded operation candidates as accessible one-shot choices and submits exact refs', () => {
    const candidate = routeableWeatherCandidate()
    const northCandidate: AnswerOperationCandidate = {
      ...candidate,
      rank: 2,
      operationRef: `operation:v1:${'b'.repeat(64)}`,
      business: { businessId: 'business:north-weather', slug: 'north-weather', name: '\u202eNorth Weather\u202c' },
    }
    const southCandidate: AnswerOperationCandidate = {
      ...candidate,
      rank: 3,
      operationRef: `operation:v1:${'c'.repeat(64)}`,
      business: { businessId: 'business:south-weather', slug: 'south-weather', name: '\u2066South Weather\u2069' },
    }
    const eastCandidate: AnswerOperationCandidate = {
      ...candidate,
      rank: 4,
      operationRef: `operation:v1:${'d'.repeat(64)}`,
      business: { businessId: 'business:east-weather', slug: 'east-weather', name: 'East Weather' },
    }
    const onOperationSelect = vi.fn()
    const candidateSetDigest = answerOperationCandidateSetDigest([candidate, northCandidate, southCandidate, eastCandidate])
    const artifacts: readonly AnswerArtifact[] = [{
      kind: 'operation-candidates',
      candidates: [candidate, northCandidate, southCandidate, eastCandidate],
      operationCandidatesDigest: candidateSetDigest,
      selection: {
        operationRef: candidate.operationRef,
        toolId: 'operation.execute',
      },
    }]

    render(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="current weather"
        onOperationSelect={onOperationSelect}
      />,
    )

    expect(screen.getByRole('region', { name: 'Operation candidates' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Review and use / })).toHaveLength(4)
    const selected = screen.getByRole('button', {
      name: 'Selected Weather Provider: Current weather · weather.current (option 1) from this answer',
    })
    expect(selected.hasAttribute('disabled')).toBe(true)
    fireEvent.click(selected)
    expect(onOperationSelect).not.toHaveBeenCalled()

    const north = screen.getByRole('button', {
      name: 'Run North Weather: Current weather · weather.current (option 2) from this answer',
    })
    const south = screen.getByRole('button', {
      name: 'Run South Weather: Current weather · weather.current (option 3) from this answer',
    })
    expect(north.getAttribute('aria-label')).not.toBe(south.getAttribute('aria-label'))
    expect(screen.getAllByRole('button', { name: /Run .*Weather: Current weather/ })).toHaveLength(3)
    expect(north.hasAttribute('disabled')).toBe(false)
    expect(south.hasAttribute('disabled')).toBe(false)

    fireEvent.click(screen.getByRole('button', {
      name: 'Run East Weather: Current weather · weather.current (option 4) from this answer',
    }))
    expect(screen.getAllByText('Optional inputs')).toHaveLength(4)
    expect(screen.getAllByText(/units · Query · string · Allowed: metric, imperial · Style: Form · Explode: Yes/)).toHaveLength(4)
    const input = screen.getByLabelText('Input JSON')
    fireEvent.change(input, { target: { value: '{"city":' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validate and run' }))
    expect(screen.getByRole('alert').textContent).toContain('valid JSON')
    expect(onOperationSelect).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '{"city":"Darwin","units":"metric"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validate and run' }))
    expect(onOperationSelect).toHaveBeenCalledOnce()
    expect(onOperationSelect).toHaveBeenCalledWith(
      eastCandidate.operationRef,
      { city: 'Darwin', units: 'metric' },
      candidateSetDigest,
    )
  })
  it('re-enables the selected exact operation only after an explicitly retryable execute failure', () => {
    const candidate = routeableWeatherCandidate()
    const candidateSetDigest = answerOperationCandidateSetDigest([candidate])
    const candidateArtifact: AnswerArtifact = {
      kind: 'operation-candidates',
      candidates: [candidate],
      operationCandidatesDigest: candidateSetDigest,
      selection: { operationRef: candidate.operationRef, toolId: 'operation.execute' },
    }
    const retryableResult = {
      kind: 'error' as const,
      operationRef: candidate.operationRef,
      code: 'fetch_failed' as const,
      retryable: true,
      reason: 'The provider did not respond.',
    }
    const onOperationSelect = vi.fn()
    const retryableArtifacts: readonly AnswerArtifact[] = [
      candidateArtifact,
      {
        kind: 'operation-outcome',
        outcome: {
          toolId: 'operation.execute',
          operationRef: candidate.operationRef,
          resultDigest: canonicalDigest(retryableResult).toString(),
          toolCallDigest: 'sha256:retryable-tool-record',
          result: retryableResult,
        },
      },
    ]

    render(<AeGenerativeAnswer artifacts={retryableArtifacts} query="current weather" onOperationSelect={onOperationSelect} />)

    const retry = screen.getByRole('button', {
      name: 'Retry Weather Provider: Current weather · weather.current (option 1) from this answer',
    })
    expect(retry.hasAttribute('disabled')).toBe(false)
    fireEvent.click(retry)
    fireEvent.change(screen.getByLabelText('Input JSON'), { target: { value: '{"city":"Darwin"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validate and run' }))
    expect(onOperationSelect).toHaveBeenCalledOnce()
    expect(onOperationSelect).toHaveBeenCalledWith(
      candidate.operationRef,
      { city: 'Darwin' },
      candidateSetDigest,
    )

    cleanup()
    const terminalResult = { ...retryableResult, retryable: false }
    render(
      <AeGenerativeAnswer
        artifacts={[
          candidateArtifact,
          {
            kind: 'operation-outcome',
            outcome: {
              toolId: 'operation.execute',
              operationRef: candidate.operationRef,
              resultDigest: canonicalDigest(terminalResult).toString(),
              toolCallDigest: 'sha256:terminal-tool-record',
              result: terminalResult,
            },
          },
        ]}
        query="current weather"
        onOperationSelect={onOperationSelect}
      />,
    )

    const selected = screen.getByRole('button', {
      name: 'Selected Weather Provider: Current weather · weather.current (option 1) from this answer',
    })
    expect(selected.hasAttribute('disabled')).toBe(true)
  })
  it('disables operation controls for historical candidate cards', () => {
    const candidate = routeableWeatherCandidate()
    const candidateArtifact: AnswerArtifact = {
      kind: 'operation-candidates',
      candidates: [candidate],
      operationCandidatesDigest: answerOperationCandidateSetDigest([candidate]),
    }
    const historicalArtifacts: readonly AnswerArtifact[] = [candidateArtifact]
    cleanup()
    const onFollowUp = vi.fn()
    render(
      <AeThreadTranscript
        projection={{
          threadId: 'thread-operation-history',
          title: 'Operation history',
          turns: [
            {
              turnId: 'turn-operation-history',
              seq: 1,
              query: 'Current weather',
              intent: 'refine_search',
              status: 'complete',
              oneLine: 'Choose a weather operation.',
              workLog: [],
              artifacts: historicalArtifacts,
            },
            {
              turnId: 'turn-current',
              seq: 2,
              query: 'Tell me more',
              intent: 'explain_boundary',
              status: 'complete',
              oneLine: 'Here is the current answer.',
              workLog: [],
              artifacts: [{ kind: 'one-line', text: 'Here is the current answer.' }],
            },
          ],
        }}
        onFollowUp={onFollowUp}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Current weather.*Expand/ }))
    const historicalRun = screen.getByRole('button', {
      name: 'Run Weather Provider: Current weather · weather.current (option 1) from this answer',
    })
    expect(historicalRun.hasAttribute('disabled')).toBe(true)
    fireEvent.click(historicalRun)
    expect(onFollowUp).not.toHaveBeenCalled()
  })

  it('keeps review available but disables answer execution for non-routeable availability', () => {
    const operationRef = `operation:v1:${'e'.repeat(64)}`
    const candidate: AnswerOperationCandidate = {
      rank: 1,
      operationRef,
      operationId: 'weather.current',
      descriptorDigest: 'descriptor-digest',
      business: { businessId: 'business:weather', slug: 'weather', name: 'Weather Provider' },
      offering: { offeringRef: 'offering:weather', revision: 1, label: 'Current weather', summary: 'Current weather by city.' },
      matchReason: 'Matched weather request',
      summary: 'Current weather by city.',
      availability: { posture: 'unavailable', reason: 'publisher_withdrew' },
      commercial: {
        price: { kind: 'on_request' },
        materialTerms: [],
        relationship: { kind: 'none', summary: 'No published relationship.' },
      },
      requiredParameters: [],
      optionalParameters: [],
      inputSchemaDigest: 'schema-digest',
      exactRebindRequired: true,
      authority: {
        publisher: 'provider_owned',
        sourceKind: 'openapi_http',
        authentication: { kind: 'x402' },
      },
      dataUse: [],
      effects: [],
      evidence: [],
      recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
      navigation: [],
    }
    const onOperationSelect = vi.fn()
    const artifacts: readonly AnswerArtifact[] = [{
      kind: 'operation-candidates',
      candidates: [candidate],
      operationCandidatesDigest: answerOperationCandidateSetDigest([candidate]),
    }]

    render(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="current weather"
        onOperationSelect={onOperationSelect}
      />,
    )

    const runButton = screen.getByRole('button', { name: /Not executable from this answer/ })
    expect(runButton.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Not executable from this answer: Publisher withdrew.')).toBeTruthy()
    expect(screen.getByText(/x402 payment/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Review and use / })).toBeTruthy()
    fireEvent.click(runButton)
    expect(onOperationSelect).not.toHaveBeenCalled()
  })

  it('renders the frozen paid operation outcome and suppresses stale provider cards', () => {
    const operationRef = `operation:v1:${'d'.repeat(64)}`
    const result = {
      kind: 'completed' as const,
      invocationRef: 'invocation:weather',
      operationRef,
      output: { temperature: 24 },
      evidenceHash: 'sha256:evidence',
      usage: {
        usageRef: 'usage:weather',
        observedAt: Date.UTC(2026, 7, 11),
        chargeState: 'paid' as const,
        amount: { currency: 'AUD', units: '125', exponent: 2 },
        priceDigest: 'sha256:price',
        transactionRef: 'transaction:weather',
        durationMs: 84,
      },
    }
    const artifacts: readonly AnswerArtifact[] = [
      { kind: 'provider-cards', providers: [provider()] },
      {
        kind: 'operation-outcome',
        outcome: {
          toolId: 'operation.invoke',
          operationRef,
          resultDigest: canonicalDigest(result).toString(),
          toolCallDigest: 'sha256:tool-record',
          result,
        },
      },
    ]

    render(<AeGenerativeAnswer artifacts={artifacts} query="weather" />)

    const statusLink = screen.getByRole('link', { name: 'View current status' })
    expect(statusLink.getAttribute('href')).toBe('/operations/invocations/invocation%3Aweather')
    const operationLink = screen.getByRole('link', { name: operationRef })
    expect(operationLink.getAttribute('href')).toBe(`/operations/${encodeURIComponent(operationRef)}`)
    expect(screen.getByText('invocation:weather')).toBeTruthy()

    expect(screen.getByRole('region', { name: 'Operation outcome' })).toBeTruthy()
    expect(screen.getByText('AUD 1.25')).toBeTruthy()
    expect(screen.getByText('usage:weather')).toBeTruthy()
    expect(screen.getByText('transaction:weather')).toBeTruthy()
    expect(screen.getByText('84 ms')).toBeTruthy()
    expect(screen.getByText('sha256:price')).toBeTruthy()
    expect(screen.getByText('sha256:tool-record')).toBeTruthy()
    expect(screen.getByText('sha256:evidence')).toBeTruthy()
    expect(screen.queryByText('Parramatta Emergency Plumbing')).toBeNull()
  })

  it('links the exact Operation without fabricating invocation status for a keyless outcome', () => {
    const operationRef = `operation:v1:${'e'.repeat(64)}`
    const result = {
      kind: 'ok' as const,
      operationRef,
      capabilityId: 'weather.current',
      name: 'Current weather',
      output: { temperature: 24 },
      evidenceHash: 'sha256:keyless-evidence',
    }
    const artifacts: readonly AnswerArtifact[] = [{
      kind: 'operation-outcome',
      outcome: {
        toolId: 'operation.execute',
        operationRef,
        resultDigest: canonicalDigest(result).toString(),
        toolCallDigest: 'sha256:keyless-tool-record',
        result,
      },
    }]

    render(<AeGenerativeAnswer artifacts={artifacts} query="weather" />)

    const operationLink = screen.getByRole('link', { name: operationRef })
    expect(operationLink.getAttribute('href')).toBe(`/operations/${encodeURIComponent(operationRef)}`)
    expect(screen.queryByRole('link', { name: 'View current status' })).toBeNull()
    expect(screen.getByText('Operation completed')).toBeTruthy()
  })
})

function routeableWeatherCandidate(): AnswerOperationCandidate {
  return {
    rank: 1,
    operationRef: `operation:v1:${'a'.repeat(64)}`,
    operationId: '\u200Eweather.current',
    descriptorDigest: 'descriptor-digest',
    business: { businessId: 'business:weather', slug: 'weather', name: '\u202eWeather Provider\u202c' },
    offering: { offeringRef: 'offering:weather', revision: 1, label: '\u2066Current weather\u2069', summary: 'Current weather by city.' },
    matchReason: 'Matched weather request',
    summary: 'Current weather by city.',
    availability: { posture: 'routeable' },
    commercial: {
      price: { kind: 'on_request' },
      materialTerms: [],
      relationship: { kind: 'none', summary: 'No published relationship.' },
    },
    requiredParameters: [{ group: 'query', name: 'city', type: 'string', required: true }],
    optionalParameters: [{ group: 'query', name: 'units', type: 'string', enumValues: ['metric', 'imperial'], style: 'form', explode: true, required: false }],
    inputSchemaDigest: 'schema-digest',
    exactRebindRequired: true,
    authority: { publisher: 'provider_owned', sourceKind: 'openapi_http', authentication: { kind: 'keyless' } },
    dataUse: [],
    effects: [],
    evidence: [],
    recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
    navigation: [],
  }
}

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

