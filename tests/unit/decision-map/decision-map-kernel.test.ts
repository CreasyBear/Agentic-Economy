import { describe, expect, it } from 'vitest'

import {
  applyDecisionMapChoice,
  applyDecisionMapConstraintChange,
  authorDecisionMapSnapshot,
  DecisionMapInvariantError,
  validateDecisionMapDraft,
  type DecisionMapChoiceInput,
  type DecisionMapDraft,
  type DecisionMapSnapshot,
} from '@/modules/decision-map/public'

const draft: DecisionMapDraft = {
  version: 'decisionMap_v1',
  goalText: 'Plan a move',
  summary: 'I heard a move with a few choices.',
  assumptions: [
    { id: 'a-budget', label: 'Budget', value: '$2k', source: 'inferred' },
  ],
  nodes: [
    { id: 'area-home', kind: 'area', label: 'Home', status: 'queued', dependsOn: [], constraintRefs: [] },
    { id: 'area-work', kind: 'area', label: 'Work', status: 'queued', dependsOn: [], constraintRefs: [] },
    { id: 'area-life', kind: 'area', label: 'Life', status: 'queued', dependsOn: [], constraintRefs: [] },
    {
      id: 'd-timing',
      kind: 'decision',
      label: 'Timing',
      status: 'ready',
      parentId: 'area-home',
      dependsOn: [],
      constraintRefs: ['a-budget'],
      options: [
        { id: 'o-now', label: 'Now', summary: 'Move now' },
        { id: 'o-later', label: 'Later', summary: 'Move later' },
      ],
      recommendedOptionId: 'o-now',
      reason: 'Timing shapes every downstream choice.',
      unlocks: ['d-location'],
      parkTrigger: 'when timing is clearer',
    },
    {
      id: 'd-location',
      kind: 'decision',
      label: 'Location',
      status: 'queued',
      parentId: 'area-home',
      dependsOn: ['d-timing'],
      constraintRefs: ['a-budget'],
      options: [
        { id: 'o-near', label: 'Near', summary: 'Stay nearby' },
        { id: 'o-far', label: 'Far', summary: 'Move farther' },
      ],
      recommendedOptionId: 'o-near',
      reason: 'Location follows timing.',
      unlocks: [],
      parkTrigger: 'when a shortlist exists',
    },
  ],
}

function author(): DecisionMapSnapshot {
  return authorDecisionMapSnapshot({
    projectId: 'project-1',
    threadId: 'thread-1',
    draft,
    generation: 0,
    revision: 1,
    createdAt: 100,
    updatedAt: 100,
  })
}

function choiceInput(snapshot: DecisionMapSnapshot): DecisionMapChoiceInput {
  return {
    projectId: snapshot.projectId,
    threadId: snapshot.threadId,
    expectedGeneration: snapshot.generation,
    expectedRevision: snapshot.revision,
    decisionId: 'd-timing',
    choice: 'lock',
    operationKey: 'choice-1',
    at: 200,
  }
}

describe('decision map contract and kernel', () => {
  it('accepts a valid draft and rejects malformed refs, cycles, and branches', () => {
    expect(validateDecisionMapDraft(draft)).toEqual(draft)

    const missingRef = structuredClone(draft)
    const location = missingRef.nodes[4]!
    if (location.kind === 'decision') location.dependsOn = ['missing']
    expect(() => validateDecisionMapDraft(missingRef)).toThrow(DecisionMapInvariantError)

    const cycle = structuredClone(draft)
    const timing = cycle.nodes[3]!
    const cycleLocation = cycle.nodes[4]!
    if (timing.kind === 'decision' && cycleLocation.kind === 'decision') {
      timing.dependsOn = ['d-location']
      cycleLocation.dependsOn = ['d-timing']
    }
    expect(() => validateDecisionMapDraft(cycle)).toThrow(DecisionMapInvariantError)

    const splitBranch = structuredClone(draft)
    const splitLocation = splitBranch.nodes[4]!
    if (splitLocation.kind === 'decision') splitLocation.parentId = 'area-work'
    expect(() => validateDecisionMapDraft(splitBranch)).toThrow(DecisionMapInvariantError)
  })

  it('locks the recommendation, journals it, and opens the next frontier', () => {
    const snapshot = author()
    const result = applyDecisionMapChoice(snapshot, choiceInput(snapshot))
    expect(result.kind).toBe('applied')
    expect(result.snapshot.nodes.find((node) => node.id === 'd-timing')).toMatchObject({ status: 'locked' })
    expect(result.snapshot.nodes.find((node) => node.id === 'd-location')).toMatchObject({ status: 'ready' })
    expect(result.decisionRecord).toMatchObject({ choice: 'lock', selectedOptionId: 'o-now', recommendedOptionId: 'o-now' })
  })

  it('parks a recommendation with its persisted trigger and no effect claim', () => {
    const snapshot = author()
    const result = applyDecisionMapChoice(snapshot, { ...choiceInput(snapshot), choice: 'park', operationKey: 'choice-park' })
    expect(result.snapshot.nodes.find((node) => node.id === 'd-timing')).toMatchObject({ status: 'queued' })
    expect(result.decisionRecord).toMatchObject({ choice: 'park', parkTrigger: 'when timing is clearer' })
    expect(result.snapshot.generation).toBe(0)
    expect(result.snapshot.decisionRecords).toHaveLength(1)
  })

  it('reports a constraint ripple, preserves unrelated nodes, and reopens locked decisions', () => {
    const locked = applyDecisionMapChoice(author(), choiceInput(author())).snapshot
    const unchanged = locked.nodes.find((node) => node.id === 'area-work')
    const result = applyDecisionMapConstraintChange(locked, {
      projectId: locked.projectId,
      threadId: locked.threadId,
      expectedGeneration: locked.generation,
      expectedRevision: locked.revision,
      assumptionId: 'a-budget',
      value: '$3k',
      operationKey: 'constraint-1',
      at: 300,
    })
    expect(result.snapshot.generation).toBe(1)
    expect(result.affectedNodeIds).toEqual(['d-timing', 'd-location'])
    expect(result.reopenedNodeIds).toEqual(['d-timing'])
    expect(result.preservedNodeIds).toContain('area-work')
    expect(result.snapshot.nodes.find((node) => node.id === 'area-work')).toEqual(unchanged)
    expect(result.snapshot.nodes.find((node) => node.id === 'd-timing')).toMatchObject({ status: 'ready' })
    expect(result.snapshot.assumptions[0]?.value).toBe('$3k')
  })

  it('refuses a stale generation and replays an identical operation without another write', () => {
    const snapshot = author()
    const input = choiceInput(snapshot)
    const applied = applyDecisionMapChoice(snapshot, input)
    const replayed = applyDecisionMapChoice(applied.snapshot, input)
    expect(replayed.kind).toBe('replayed')
    expect(replayed.snapshot).toEqual(applied.snapshot)

    const changed = applyDecisionMapConstraintChange(applied.snapshot, {
      projectId: applied.snapshot.projectId,
      threadId: applied.snapshot.threadId,
      expectedGeneration: applied.snapshot.generation,
      expectedRevision: applied.snapshot.revision,
      assumptionId: 'a-budget',
      value: '$3k',
      operationKey: 'constraint-stale-check',
      at: 400,
    }).snapshot
    expect(() => applyDecisionMapChoice(changed, { ...input, operationKey: 'stale-choice' })).toThrowError(
      expect.objectContaining({ code: 'stale_generation' }),
    )
  })
})
