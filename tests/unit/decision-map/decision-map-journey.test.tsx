// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeDecisionMapJourney } from '@/components/ae/decision-map/AeDecisionMapJourney'
import {
  applyDecisionMapChoice,
  applyDecisionMapConstraintChange,
  authorDecisionMapSnapshot,
  type DecisionMapDraft,
} from '@/modules/decision-map/public'

afterEach(cleanup)

const draft: DecisionMapDraft = {
  version: 'decisionMap_v1',
  goalText: 'Plan our wedding',
  summary: 'A wedding next October for 120 people.',
  assumptions: [
    { id: 'date', label: 'Wedding date', value: 'Next October', source: 'inferred' },
  ],
  nodes: [
    { id: 'venue', kind: 'area', label: 'Venue', status: 'queued', dependsOn: [], constraintRefs: [] },
    { id: 'food', kind: 'area', label: 'Food', status: 'fog', dependsOn: [], constraintRefs: [] },
    { id: 'music', kind: 'area', label: 'Music', status: 'fog', dependsOn: [], constraintRefs: [] },
    {
      id: 'guest-list', kind: 'decision', label: 'Guest list', status: 'ready', parentId: 'venue',
      dependsOn: [], constraintRefs: ['date'],
      options: [
        { id: 'small', label: 'Keep it small', summary: 'Prioritise a smaller celebration.' },
        { id: 'full', label: 'Invite all 120', summary: 'Plan around the full guest count.' },
      ],
      recommendedOptionId: 'full', reason: 'The guest count shapes the venue decision.',
      unlocks: ['venue-style'], parkTrigger: 'the guest count is settled',
    },
    {
      id: 'venue-style', kind: 'decision', label: 'Venue style', status: 'queued', parentId: 'venue',
      dependsOn: ['guest-list'], constraintRefs: ['date'],
      options: [
        { id: 'indoor', label: 'Indoor venue', summary: 'Keep weather out of the plan.' },
        { id: 'outdoor', label: 'Outdoor venue', summary: 'Use an outdoor setting.' },
      ],
      recommendedOptionId: 'indoor', reason: 'Capacity comes first.', unlocks: [],
      parkTrigger: 'the guest list is settled',
    },
  ],
}

function snapshot() {
  return authorDecisionMapSnapshot({
    projectId: 'project-1',
    threadId: 'thread-1',
    draft,
    now: 1_000,
  })
}

describe('decision-map journey', () => {
  it('locks the recommendation and enables the newly unlocked frontier', async () => {
    const initial = snapshot()
    const recordChoice = vi.fn(async (input) => ({
      kind: 'ok',
      snapshot: applyDecisionMapChoice(initial, input).snapshot,
    }))

    render(<AeDecisionMapJourney
      snapshot={initial}
      recordChoice={recordChoice}
      recordConstraintChange={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Lock this in' }))

    await waitFor(() => expect(screen.getByText('Locked: Invite all 120.')).toBeTruthy())
    expect(recordChoice).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      threadId: 'thread-1',
      expectedGeneration: 0,
      expectedRevision: 1,
      decisionId: 'guest-list',
      choice: 'lock',
      operationKey: expect.stringMatching(/^decision-map:/u),
    }))
    expect(screen.getAllByText('Indoor venue')).toHaveLength(2)
    expect((screen.getByRole('button', { name: 'Lock this in' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('persists an assumption correction and renders the exact ripple', async () => {
    const authored = snapshot()
    const initial = applyDecisionMapChoice(authored, {
      projectId: 'project-1',
      threadId: 'thread-1',
      expectedGeneration: authored.generation,
      expectedRevision: authored.revision,
      decisionId: 'guest-list',
      choice: 'lock',
      operationKey: 'test:lock',
    }).snapshot
    const recordConstraintChange = vi.fn(async (input) => ({
      kind: 'ok',
      snapshot: applyDecisionMapConstraintChange(initial, input).snapshot,
    }))

    render(<AeDecisionMapJourney
      snapshot={initial}
      recordChoice={vi.fn()}
      recordConstraintChange={recordConstraintChange}
    />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Adjust' })[0]!)
    fireEvent.change(screen.getByLabelText('Change this assumption'), { target: { value: '15 September' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))

    await waitFor(() => expect(screen.getByText('Your decision map was updated.')).toBeTruthy())
    expect(recordConstraintChange).toHaveBeenCalledWith(expect.objectContaining({
      assumptionId: 'date',
      value: '15 September',
      expectedGeneration: 0,
      expectedRevision: initial.revision,
    }))
    expect(screen.getByText('Wedding date: 15 September')).toBeTruthy()
    expect(screen.getByText('Still holds')).toBeTruthy()
    expect(screen.getByText('Needs updating')).toBeTruthy()
    expect(screen.getByText('Back in play')).toBeTruthy()
  })

  it('refuses a stale Park without claiming that anything changed', async () => {
    const initial = snapshot()
    const recordChoice = vi.fn(async () => ({ kind: 'stale', reason: 'stale_revision' }))

    render(<AeDecisionMapJourney
      snapshot={initial}
      recordChoice={recordChoice}
      recordConstraintChange={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Park for now' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('earlier version'))
    expect(screen.queryByText(/^Parked until/u)).toBeNull()
    expect(screen.getAllByText('Invite all 120')).toHaveLength(2)
  })
})
