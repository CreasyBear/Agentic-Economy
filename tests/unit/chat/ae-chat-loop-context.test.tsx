/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

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
  afterEach(cleanup)

  it('renders nothing when there is no work, thinking, or check summary', () => {
    const { container } = render(
      <AeWorkDisclosure isStreaming={false} workSteps={[]} thinkingSteps={[]} thinkingLabel="" />,
    )
    expect(container.textContent).toBe('')
  })

  it('keeps one durable work log collapsed until opened', () => {
    const { container, getByText, getByRole, queryByText } = render(
      <AeWorkDisclosure isStreaming={false} workSteps={[workStep()]} thinkingSteps={[]} thinkingLabel="" />,
    )

    expect(container.querySelectorAll('[data-ae-work-disclosure]')).toHaveLength(1)
    const trigger = getByRole('button', { name: /Ran 1 step/ })
    expect(trigger.getAttribute('data-ae-work-trigger')).not.toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(queryByText('Searching for matches')).toBeNull()

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const row = container.querySelector('[data-ae-work-step][data-work-step="step-1"]')
    expect(row).toBeTruthy()
    expect(row?.getAttribute('data-status')).toBe('complete')
    expect(row?.textContent).toContain('Complete')
    expect(container.querySelector('[data-ae-work-details]')).toBeTruthy()
    expect(container.querySelectorAll('[data-ae-work-detail]')).toHaveLength(1)
    expect(getByText('Searching for matches')).toBeTruthy()
    expect(getByText('2 matches found.')).toBeTruthy()
    expect(getByText('Results')).toBeTruthy()
  })

  it('uses the current durable step as the active label', () => {
    const { container, getByRole } = render(
      <AeWorkDisclosure
        isStreaming
        workSteps={[workStep({
          phase: 'read',
          status: 'running',
          title: 'Reading provider evidence',
          summary: '',
          detailRows: [],
        })]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )

    const trigger = getByRole('button', { name: /Reading provider evidence/ })
    expect(trigger.getAttribute('data-ae-work-trigger')).not.toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const row = container.querySelector('[data-ae-work-step][data-work-step="step-1"]')
    expect(row?.getAttribute('data-status')).toBe('running')
    expect(row?.textContent).toContain('Running')
  })

  it('shows truthful status badges for every durable work state', () => {
    const states = [
      ['running', 'Running'],
      ['complete', 'Complete'],
      ['error', 'Failed'],
      ['stopped', 'Stopped'],
      ['skipped', 'Skipped'],
    ] as const
    const { container, getByRole } = render(
      <AeWorkDisclosure
        isStreaming
        workSteps={states.map(([status, label], index) => workStep({
          id: `step-${index + 1}`,
          status,
          title: `${label} work`,
          summary: status === 'running' ? '' : `${label} summary`,
          detailRows: [],
        }))}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )

    expect(getByRole('button', { name: /Running work/ })).toBeTruthy()
    for (const [status, label] of states) {
      const row = container.querySelector(`[data-ae-work-step][data-status="${status}"]`)
      expect(row).toBeTruthy()
      expect(row?.textContent).toContain(label)
    }
  })

  it('shows durable elapsed time in the settled header', () => {
    const { getByRole } = render(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[workStep({ startedAtMs: 0, completedAtMs: 1250, durationMs: 1250 })]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )
    expect(getByRole('button', { name: /Worked for 1\.3s/ })).toBeTruthy()
  })

  it('summarizes public check facts in the header and exposes them when expanded', () => {
    const { container, getByText, getByRole } = render(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[workStep()]}
        thinkingSteps={[]}
        thinkingLabel=""
        checkSummary={{
          catalogSearches: 1,
          listingsRead: 2,
          listedBusinesses: 2,
          checksFailed: 0,
          checksPassed: 5,
          elapsedMs: 1250,
        }}
      />,
    )

    const trigger = getByRole('button', { name: /Worked for 1\.3s/ })
    expect(getByText('compared 2 matches; checked 5 facts')).toBeTruthy()
    fireEvent.click(trigger)
    expect(container.querySelector('[data-ae-work-check-summary]')).toBeTruthy()
    expect(getByText('Searches')).toBeTruthy()
    expect(getByText('Details read')).toBeTruthy()
    expect(getByText('Checks')).toBeTruthy()
  })

  it('renders a summary-only disclosure for sparse saved turns', () => {
    const { container, getByText } = render(
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

    expect(container.querySelector('[data-ae-work-disclosure]')).toBeTruthy()
    expect(getByText('checked 1 fact')).toBeTruthy()
  })

  it('keeps failed public work visible with its durable summary', () => {
    const { container, getByRole, getByText } = render(
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

    expect(getByRole('button', { name: /Work failed/ })).toBeTruthy()
    const row = container.querySelector('[data-ae-work-step][data-work-step="step-2"]')
    expect(row?.getAttribute('data-status')).toBe('error')
    expect(row?.textContent).toContain('Failed')
    expect(getByText('The details were not available.')).toBeTruthy()
  })

  it('renders each emitted detail row once under its durable work step', () => {
    const { container, getByRole, getAllByText, getByText } = render(
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
    const row = container.querySelector('[data-ae-work-step][data-work-step="step-1"]')
    expect(row?.getAttribute('data-status')).toBe('complete')
    expect(container.querySelectorAll('[data-ae-work-detail]')).toHaveLength(2)
    expect(getAllByText('Source')).toHaveLength(1)
    expect(getByText('operation:v1:coingecko.simple-price')).toBeTruthy()
    expect(getAllByText('Result')).toHaveLength(1)
    expect(getByText('Data returned')).toBeTruthy()
  })

  it('shows the thinking trail while streaming before a work log arrives', () => {
    const { container, getByRole, getByText } = render(
      <AeWorkDisclosure
        isStreaming
        workSteps={[]}
        thinkingSteps={['Finding the right matches…']}
        thinkingLabel="Reading the details"
        thinkingStep="read"
      />,
    )

    const trigger = getByRole('button', { name: /Reading the details/ })
    expect(trigger.getAttribute('data-ae-work-trigger')).not.toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('[data-ae-work-disclosure]')).toHaveLength(1)
    expect(getByText('Finding the right matches…')).toBeTruthy()
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

