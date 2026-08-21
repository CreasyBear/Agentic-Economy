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
    expect(buildTurnContextLine({ intent: 'unsupported', seq: 2, artifacts })).toBe(
      'This request is outside the current path; the answer will return to other options.',
    )
    expect(buildTurnContextLine({ intent: 'refine_search', seq: 2, artifacts: [] })).toBe(
      'Checking again with this follow-up.',
    )
  })

  it('does not prepare a hosted request from selected-business context', () => {
    const artifacts: AnswerArtifact[] = [{ kind: 'selected-provider', provider: provider() }]

    expect(countListedProvidersInArtifacts(artifacts)).toBe(1)
    expect(buildTurnContextLine({ intent: 'unsupported', seq: 2, artifacts })).toBe(
      'This request is outside the current path; the answer will return to other options.',
    )
  })
  it('keeps selected-business copy on the unsupported path when no request route exists', () => {
    const artifacts: AnswerArtifact[] = [{
      kind: 'selected-provider',
      provider: provider(),
    }]

    expect(buildTurnContextLine({ intent: 'unsupported', seq: 2, artifacts })).toBe(
      'This request is outside the current path; the answer will return to other options.',
    )
  })

  it('keeps unsupported-path copy when a selected business name includes direction controls', () => {
    const artifacts: AnswerArtifact[] = [{
      kind: 'selected-provider',
      provider: provider({ name: 'Demo\u202e Plumber' }),
    }]

    expect(buildTurnContextLine({ intent: 'unsupported', seq: 2, artifacts })).toBe(
      'This request is outside the current path; the answer will return to other options.',
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

  it('shows the natural-language thinking thread inline while streaming', () => {
    const { container, getByText } = render(
      <AeWorkDisclosure
        isStreaming
        workSteps={[]}
        thinkingSteps={['Finding the right matches…']}
        thinkingLabel="Reading the details"
        thinkingStep="read"
      />,
    )

    const list = container.querySelector('[data-ae-work-thinking]')
    expect(list).toBeTruthy()
    expect(list?.getAttribute('aria-label')).toBe('Answer thinking')
    // Deduped thread: accumulated label plus the live label.
    const items = list?.querySelectorAll('li') ?? []
    expect(items).toHaveLength(2)
    expect(getByText('Finding the right matches…')).toBeTruthy()
    expect(getByText('Reading the details')).toBeTruthy()
    expect(items[1]?.className).toContain('text-foreground')
  })

  it('keeps provenance (work steps) behind a sheet rather than in the transcript', () => {
    const { container, getByRole, queryByRole } = render(
      <AeWorkDisclosure
        isStreaming={false}
        workSteps={[workStep()]}
        thinkingSteps={[]}
        thinkingLabel=""
      />,
    )

    // Nothing but the thinking thread and the quiet provenance trigger is in the turn.
    expect(container.querySelector('[data-ae-work-step]')).toBeNull()
    expect(container.querySelector('[data-ae-work-check-summary]')).toBeNull()
    const trigger = getByRole('button', { name: 'How this was checked' })
    expect(trigger.getAttribute('data-ae-work-trigger')).not.toBeNull()
    expect(queryByRole('dialog')).toBeNull()

    fireEvent.click(trigger)

    const dialog = getByRole('dialog', { name: 'How this was checked' })
    const row = dialog.querySelector('[data-ae-work-step][data-work-step="step-1"]')
    expect(row).toBeTruthy()
    expect(row?.getAttribute('data-status')).toBe('complete')
    expect(row?.textContent).toContain('Complete')
    expect(dialog.querySelector('[data-ae-work-details]')).toBeTruthy()
    expect(dialog.querySelectorAll('[data-ae-work-detail]')).toHaveLength(1)
    expect(dialog.textContent).toContain('Searching for matches')
    expect(dialog.textContent).toContain('2 matches found.')
  })

  it('exposes the check summary only inside the provenance sheet', () => {
    const { container, getByRole, getByText } = render(
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

    // No stats grid in the transcript; it lives behind the sheet.
    expect(container.querySelector('[data-ae-work-check-summary]')).toBeNull()
    fireEvent.click(getByRole('button', { name: 'How this was checked' }))

    const dialog = getByRole('dialog', { name: 'How this was checked' })
    expect(dialog.querySelector('[data-ae-work-check-summary]')).toBeTruthy()
    expect(getByText('Searches')).toBeTruthy()
    expect(getByText('Details read')).toBeTruthy()
    expect(getByText('Checks')).toBeTruthy()
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
    nextStepLabel: 'Review details',
    detailUrl: '/demo-plumber',
    services: [],
    ...overrides,
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
