/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeWorkDisclosure } from '@/components/ae/chat/AeWorkDisclosure'
import {
  buildTurnContextLine,
  countListedProvidersInArtifacts,
} from '@/components/ae/chat/turn-context'
import type { AnswerArtifact, AnswerSource, AnswerWorkStep } from '@/modules/answer/public'

describe('turn context line', () => {
  it('counts unique listed providers across provider artifacts', () => {
    const artifacts: AnswerArtifact[] = [
      { kind: 'provider-cards', providers: [provider()] },
      { kind: 'provider-compare-table', providers: [provider(), provider({ slug: 'northside', name: 'Northside Plumbing' })] },
      { kind: 'selected-provider', provider: provider() },
    ]

    expect(countListedProvidersInArtifacts(artifacts)).toBe(2)
  })

  it('explains how follow-up turns use the thread', () => {
    const artifacts: AnswerArtifact[] = [{ kind: 'provider-cards', providers: [provider()] }]

    expect(buildTurnContextLine({ intent: 'filter_known', seq: 2, artifacts })).toBe(
      'Narrowing 1 match from this thread.',
    )
    expect(buildTurnContextLine({ intent: 'compare_known', seq: 2, artifacts })).toBe(
      'Comparing 1 match from this thread.',
    )
    expect(buildTurnContextLine({ intent: 'inquiry_handoff', seq: 2, artifacts })).toBe(
      'No business is selected yet. Find a match before sending a request.',
    )
    expect(buildTurnContextLine({ intent: 'refine_search', seq: 2, artifacts: [] })).toBe(
      'Checking again with this follow-up.',
    )
  })

  it('names the selected business during inquiry handoff turns', () => {
    const artifacts: AnswerArtifact[] = [{ kind: 'selected-provider', provider: provider() }]

    expect(countListedProvidersInArtifacts(artifacts)).toBe(1)
    expect(buildTurnContextLine({ intent: 'inquiry_handoff', seq: 2, artifacts })).toBe(
      'Preparing a request to Demo Plumber.',
    )
  })
  it('requires a request route before preparing selected-business contact copy', () => {
    const artifacts: AnswerArtifact[] = [{
      kind: 'selected-provider',
      provider: provider({ inquiryUrl: undefined }),
    }]

    expect(buildTurnContextLine({ intent: 'inquiry_handoff', seq: 2, artifacts })).toBe(
      'Demo Plumber does not have a request form here yet.',
    )
  })

  it('neutralizes direction controls in selected-business context copy', () => {
    const artifacts: AnswerArtifact[] = [{
      kind: 'selected-provider',
      provider: provider({ name: 'Demo\u202e Plumber' }),
    }]

    expect(buildTurnContextLine({ intent: 'inquiry_handoff', seq: 2, artifacts })).toBe(
      'Preparing a request to Demo Plumber.',
    )
  })


  it('keeps normal first-turn searches quiet but labels boundaries', () => {
    expect(buildTurnContextLine({ intent: 'refine_search', seq: 1, artifacts: [] })).toBeUndefined()
    expect(buildTurnContextLine({ intent: 'explain_boundary', seq: 1, artifacts: [] })).toBe(
      "Checking the supported next step.",
    )
    expect(buildTurnContextLine({ intent: 'unsupported', seq: 1, artifacts: [] })).toBe(
      "This request is outside the current path; the answer will return to other options.",
    )
  })
})

describe('AeWorkDisclosure', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders nothing when there is no work, thinking, or check summary', () => {
    const { container } = render(
      <AeWorkDisclosure isStreaming={false} workSteps={[]} thinkingSteps={[]} thinkingLabel="" />,
    )
    expect(container.textContent).toBe('')
  })

  it('keeps completed work-log details behind the disclosure by default', () => {
    const { getByText, getByRole, queryByText } = render(
      <AeWorkDisclosure isStreaming={false} workSteps={[workStep()]} thinkingSteps={[]} thinkingLabel="" />,
    )

    // Header line is always visible; the step rows stay collapsed on a settled turn.
    expect(getByRole('button', { name: /Ran 1 step/ })).toBeTruthy()
    expect(queryByText('Searching for matches')).toBeNull()
    expect(queryByText('2 matches found.')).toBeNull()
    expect(queryByText('Results')).toBeNull()

    fireEvent.click(getByRole('button', { name: /Ran 1 step/ }))

    expect(getByText('Searching for matches')).toBeTruthy()
    expect(getByText('2 matches found.')).toBeTruthy()
    expect(getByText('Results')).toBeTruthy()
  })

  it('keeps a just-finished step visibly running for the pacing floor', () => {
    vi.useFakeTimers()
    stubMatchMedia(false)
    const { getByRole, rerender } = render(
      <AeWorkDisclosure
        isStreaming
        workSteps={[workStep({ status: 'running', summary: '' })]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )

    rerender(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[workStep({ startedAtMs: 0, completedAtMs: 0, durationMs: 0 })]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )

    expect(getByRole('button', { name: /Working/ })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(699)
    })
    expect(getByRole('button', { name: /Working/ })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(getByRole('button', { name: /Ran 1 step/ })).toBeTruthy()
  })

  it('skips pacing when reduced motion is requested', () => {
    vi.useFakeTimers()
    stubMatchMedia(true)
    const { getByRole, rerender } = render(
      <AeWorkDisclosure
        isStreaming
        workSteps={[workStep({ status: 'running', summary: '' })]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )

    rerender(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[workStep({ startedAtMs: 0, completedAtMs: 0, durationMs: 0 })]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )

    expect(getByRole('button', { name: /Ran 1 step/ })).toBeTruthy()
  })

  it('shows timing and step count in the settled header when durations exist', () => {
    const { getByRole } = render(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[workStep({ startedAtMs: 0, completedAtMs: 1250, durationMs: 1250 })]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )
    expect(getByRole('button', { name: /Worked for 1\.3s.*Ran 1 step/ })).toBeTruthy()
  })

  it('summarizes public check facts in the header and exposes the fact grid when expanded', () => {
    const { getByText, getByRole } = render(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[workStep()]}
        thinkingSteps={[]}
        thinkingLabel=""
        checkSummary={{
          catalogSearches: 1,
          listingsRead: 2,
          listedBusinesses: 2,
          checksPassed: 5,
          checksFailed: 0,
          elapsedMs: 1250,
        }}
      />,
    )

    expect(getByRole('button', { name: /Worked for 1\.3s/ })).toBeTruthy()
    expect(getByText('compared 2 matches; checked 5 facts')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: /Worked for 1\.3s/ }))
    expect(getByText('Searches')).toBeTruthy()
    expect(getByText('Details read')).toBeTruthy()
    expect(getByText('Checks')).toBeTruthy()
  })

  it('renders a summary-only disclosure for sparse saved turns', () => {
    const { getByText } = render(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[]}
        thinkingSteps={[]}
        thinkingLabel=""
        checkSummary={{
          catalogSearches: 0,
          listingsRead: 0,
          listedBusinesses: 0,
          checksPassed: 1,
          checksFailed: 0,
          elapsedMs: 0,
        }}
      />,
    )

    expect(getByText('checked 1 fact')).toBeTruthy()
  })

  it('keeps running and failed public work visible in the disclosure header', () => {
    const { getByRole, getByText, rerender } = render(
      <AeWorkDisclosure
        isStreaming
        workSteps={[
          workStep(),
          workStep({
            id: 'step-2',
            phase: 'read',
            status: 'running',
            title: 'Reading the details',
            summary: '',
            detailRows: [],
          }),
        ]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )

    expect(getByRole('button', { name: /Working.*Ran 2 steps/ })).toBeTruthy()
    expect(getByText('Reading the details')).toBeTruthy()

    rerender(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[
          workStep(),
          workStep({
            id: 'step-2',
            phase: 'read',
            status: 'error',
            title: 'Reading the details',
            summary: 'The details were not available.',
            detailRows: [],
          }),
        ]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )

    expect(getByText('Reading the details (failed)')).toBeTruthy()
    expect(getByText('The details were not available.')).toBeTruthy()
  })

  it('keeps the capability execution name in the visible work row', () => {
    const { getByRole, getByText } = render(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[{
          id: 'step-1',
          phase: 'read',
          status: 'complete',
          title: 'Ran Current Bitcoin Price',
          summary: 'Data returned.',
          detailRows: [
            { label: 'Source', value: 'operation:v1:coingecko.simple-price' },
            { label: 'Result', value: 'Data returned' },
          ],
        }]}
        thinkingSteps={[]}
        thinkingLabel=""
        query="What is the current Bitcoin price?"
      />,
    )

    fireEvent.click(getByRole('button', { name: /Ran 1 step/ }))
    expect(getByText('Ran Current Bitcoin Price')).toBeTruthy()
    expect(getByText('Data returned.')).toBeTruthy()
    expect(getByText('Source')).toBeTruthy()
    expect(getByText('operation:v1:coingecko.simple-price')).toBeTruthy()
  })

  it('shows the thinking phase trail while streaming before a work log arrives', () => {
    const { getByRole, getByText, queryByText } = render(
      <AeWorkDisclosure
        isStreaming
        workSteps={[]}
        thinkingSteps={['Finding the right matches…']}
        thinkingLabel="Reading the details"
        thinkingStep="read"
      />,
    )

    expect(getByRole('button', { name: /Reading the details/ })).toBeTruthy()
    // Thinking labels fold into the collapsed Thought cell, not the header.
    expect(getByText('Finding the right matches…')).toBeTruthy()
    expect(getByText('Thought…')).toBeTruthy()
    expect(queryByText('Thought')).toBeNull()
  })
})

function provider(overrides: Omit<Partial<AnswerSource>, 'inquiryUrl'> & { inquiryUrl?: string | undefined } = {}): AnswerSource {
  const { inquiryUrl, ...otherOverrides } = overrides
  return {
    citationIndex: 1,
    slug: 'demo-plumber',
    name: 'Demo Plumber',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    serviceArea: 'Parramatta',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: '',
    trustCue: 'Checked',
    nextStepLabel: 'Send inquiry',
    detailUrl: '/demo-plumber',
    services: [],
    ...otherOverrides,
    ...(inquiryUrl === undefined
      ? ('inquiryUrl' in overrides ? {} : { inquiryUrl: '/demo-plumber/inquiry' })
      : { inquiryUrl }),
  }
}

function workStep(overrides: Partial<AnswerWorkStep> = {}): AnswerWorkStep {
  return {
    id: 'step-1',
    phase: 'search',
    status: 'complete',
    title: 'Searching for matches',
    summary: '2 matches found.',
    detailRows: [{ label: 'Results', value: '2' }],
    ...overrides,
  }
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}
