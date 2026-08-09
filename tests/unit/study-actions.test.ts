import { describe, expect, it } from 'vitest'

import { findAction, listActions } from '@/modules/actions'

const charter = {
  wants: [{ id: 'price', label: 'Price', weight: 1, sense: 'cost', valueKey: 'price' }],
  hardNeeds: [{ kind: 'fixed_price' }],
}

const validStart = {
  studyId: 'study:action:one',
  projectId: 'project:action',
  studyNodeId: 'study-node:one',
  targetDecisionNodeId: 'decision-node:one',
  studyBrief: 'Compare labelled development supply.',
  criteriaFromCharter: ['price'],
  charter,
  operationKey: 'study:start:one',
  correlationId: 'study:start:one',
  expectedGeneration: 1,
  expectedRevision: 1,
  proposalDigest: 'digest:one',
}

describe('Study registered action seams', () => {
  it('registers start, inspect, and complete as distinct public actions', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).toEqual(expect.arrayContaining(['study.start', 'study.inspect', 'study.complete']))

    const start = findAction('study.start')
    const inspect = findAction('study.inspect')
    const complete = findAction('study.complete')
    expect(start?.readOnly).toBe(false)
    expect(inspect?.readOnly).toBe(true)
    expect(complete?.readOnly).toBe(false)
    expect(inspect?.outputSchema.safeParse({ kind: 'not_found' }).success).toBe(true)
    expect(start?.parameters.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'studyNodeId', 'targetDecisionNodeId', 'expectedGeneration', 'expectedRevision', 'proposalDigest',
    ]))
    expect(complete?.parameters.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'studyNodeId', 'targetDecisionNodeId', 'generation', 'treeRevision', 'expectedStudyRevision',
    ]))
  })

  it('keeps the Study API generic and makes recommendation a decision-inbox proposal', () => {
    const start = findAction('study.start')
    const complete = findAction('study.complete')
    expect(start).toBeDefined()
    expect(complete).toBeDefined()
    if (start === undefined || complete === undefined) return

    expect(start.schema.safeParse(validStart).success).toBe(true)
    expect(start.schema.safeParse({ ...validStart, categoryQuote: { provider: 'fixture' } }).success).toBe(false)
    expect(complete.schema.safeParse({
      studyId: 'study:action:one',
      projectId: 'project:action',
      studyNodeId: 'study-node:one',
      targetDecisionNodeId: 'decision-node:one',
      generation: 1,
      treeRevision: 2,
      expectedStudyRevision: 1,
      operationKey: 'study:complete:one',
      correlationId: 'study:complete:one',
      charter,
      requestedAt: 10_000,
      photographerQuote: { provider: 'fixture' },
    }).success).toBe(false)
    expect(complete.boundaries.join(' ')).toMatch(/propos|never auto-lock|does not.*lock/i)
    expect(complete.invocationContract?.safeContinuations.join(' ')).toMatch(/inbox|lock/i)
  })
})
