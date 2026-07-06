/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeThinkingRail } from '@/components/ae/artifacts/AeThinkingRail'
import { AeResearchProcess } from '@/components/ae/chat/AeResearchProcess'
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
      'Filtering 1 listed business from this thread.',
    )
    expect(buildTurnContextLine({ intent: 'compare_known', seq: 2, artifacts })).toBe(
      'Comparing 1 listed business from this thread.',
    )
    expect(buildTurnContextLine({ intent: 'inquiry_handoff', seq: 2, artifacts })).toBe(
      'Preparing the qualified inquiry next step for Demo Plumber.',
    )
    expect(buildTurnContextLine({ intent: 'refine_search', seq: 2, artifacts: [] })).toBe(
      'Searching again for this follow-up.',
    )
  })

  it('names the selected business during inquiry handoff turns', () => {
    const artifacts: AnswerArtifact[] = [{ kind: 'selected-provider', provider: provider() }]

    expect(countListedProvidersInArtifacts(artifacts)).toBe(1)
    expect(buildTurnContextLine({ intent: 'inquiry_handoff', seq: 2, artifacts })).toBe(
      'Preparing the qualified inquiry next step for Demo Plumber.',
    )
  })

  it('keeps normal first-turn searches quiet but labels boundaries', () => {
    expect(buildTurnContextLine({ intent: 'refine_search', seq: 1, artifacts: [] })).toBeUndefined()
    expect(buildTurnContextLine({ intent: 'explain_boundary', seq: 1, artifacts: [] })).toBe(
      "Checking this request against AE's inquiry-only limits.",
    )
    expect(buildTurnContextLine({ intent: 'unsupported', seq: 1, artifacts: [] })).toBe(
      "This request is outside AE's current inquiry path; the answer will route back to published listings.",
    )
  })
})

describe('AeResearchProcess', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps completed public work-log details behind the trigger by default', () => {
    const { getByText, queryByText, getByRole } = render(<AeResearchProcess isStreaming={false} steps={[workStep()]} />)

    // Trigger + summary are always visible; the dense trace stays collapsed on
    // a settled turn so completed answers do not dump the full audit log.
    expect(getByText('How AE checked this')).toBeTruthy()
    expect(getByText('1 public check complete · 2 listed businesses found.')).toBeTruthy()
    expect(queryByText('Public checks and listed facts, not private reasoning.')).toBeNull()
    expect(queryByText('Searching listed businesses')).toBeNull()
    expect(queryByText('Results')).toBeNull()

    fireEvent.click(getByRole('button', { name: /how ae checked this/i }))

    expect(getByText('Public checks and listed facts, not private reasoning.')).toBeTruthy()
    expect(getByText('Searching listed businesses')).toBeTruthy()
    expect(getByText('2 listed businesses found.')).toBeTruthy()
    expect(getByText('Results')).toBeTruthy()
    expect(getByText('2')).toBeTruthy()
  })

  it('summarizes public answer checks in the process header', () => {
    const { getByText, getByRole } = render(
      <AeResearchProcess
        isStreaming={false}
        steps={[workStep()]}
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

    // Header summary shows without expanding; the fact grid lives in the trace.
    expect(getByText('Compared 2 listed businesses; checked 5 facts; done in 1.3s.')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: /how ae checked this/i }))
    expect(getByText('Searches')).toBeTruthy()
    expect(getByText('Listings read')).toBeTruthy()
    expect(getByText('Checks')).toBeTruthy()
  })

  it('renders a summary-only process for sparse saved turns', () => {
    const { getByText } = render(
      <AeResearchProcess
        isStreaming={false}
        steps={[]}
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

    expect(getByText('Checked 1 fact; done in <1s.')).toBeTruthy()
  })

  it('keeps running and failed public work visible in the process header', () => {
    const { getByText, rerender } = render(
      <AeResearchProcess
        isStreaming
        steps={[
          workStep(),
          workStep({
            id: 'step-2',
            phase: 'read',
            status: 'running',
            title: 'Reading listed business details',
            summary: '',
            detailRows: [],
          }),
        ]}
      />,
    )

    expect(getByText('Checking now: Reading listed business details')).toBeTruthy()

    rerender(
      <AeResearchProcess
        isStreaming={false}
        steps={[
          workStep(),
          workStep({
            id: 'step-2',
            phase: 'read',
            status: 'error',
            title: 'Reading listed business details',
            summary: 'Listing details were not available.',
            detailRows: [],
          }),
        ]}
      />,
    )

    expect(getByText('Needs attention: Reading listed business details')).toBeTruthy()
  })
})

describe('AeThinkingRail', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the public live answer process when a detailed work log is not available yet', () => {
    const { container, getByText } = render(
      <AeThinkingRail visible label="Reading listed businesses..." step="read" />,
    )

    expect(getByText('Visible process')).toBeTruthy()
    expect(getByText('Reading listed businesses...')).toBeTruthy()
    expect(getByText('AE is checking published listing facts and routing to the next safe step.')).toBeTruthy()
    expect(getByText('Search listings')).toBeTruthy()
    expect(getByText('Read details')).toBeTruthy()
    expect(getByText('Prepare next step')).toBeTruthy()
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain('Read details')
  })
})

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
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
    inquiryUrl: '/demo-plumber/inquiry',
    ...overrides,
  }
}

function workStep(overrides: Partial<AnswerWorkStep> = {}): AnswerWorkStep {
  return {
    id: 'step-1',
    phase: 'search',
    status: 'complete',
    title: 'Searching listed businesses',
    summary: '2 listed businesses found.',
    detailRows: [{ label: 'Results', value: '2' }],
    ...overrides,
  }
}
