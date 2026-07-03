/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

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
    ]

    expect(countListedProvidersInArtifacts(artifacts)).toBe(2)
  })

  it('explains how follow-up turns use the thread', () => {
    const artifacts: AnswerArtifact[] = [{ kind: 'provider-cards', providers: [provider()] }]

    expect(buildTurnContextLine({ intent: 'filter_known', seq: 2, artifacts })).toBe(
      'Filtering 1 listed provider from this thread.',
    )
    expect(buildTurnContextLine({ intent: 'compare_known', seq: 2, artifacts })).toBe(
      'Comparing 1 listed provider from this thread.',
    )
    expect(buildTurnContextLine({ intent: 'refine_search', seq: 2, artifacts: [] })).toBe(
      'Searching again for this follow-up.',
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

  it('shows completed public work-log details by default', () => {
    const { getByText } = render(<AeResearchProcess isStreaming={false} steps={[workStep()]} />)

    expect(getByText('How AE checked this')).toBeTruthy()
    expect(getByText('Searching listed businesses')).toBeTruthy()
    expect(getByText('2 listed businesses found.')).toBeTruthy()
    expect(getByText('Results')).toBeTruthy()
    expect(getByText('2')).toBeTruthy()
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

function workStep(): AnswerWorkStep {
  return {
    id: 'step-1',
    phase: 'search',
    status: 'complete',
    title: 'Searching listed businesses',
    summary: '2 listed businesses found.',
    detailRows: [{ label: 'Results', value: '2' }],
  }
}
