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
  studyBrief: 'Compare published business options.',
  criteriaFromCharter: ['price'],
  charter,
  operationKey: 'study:start:one',
  correlationId: 'study:start:one',
  expectedGeneration: 1,
  expectedRevision: 1,
  proposalDigest: 'digest:one',
}

describe('Study registered action seams', () => {
  it('keeps start and inspect findable after public deregister', () => {
    const ids = listActions().map((action) => action.id)
    expect(ids).not.toContain('study.start')
    expect(ids).not.toContain('study.inspect')

    const start = findAction('study.start')
    const inspect = findAction('study.inspect')
    expect(start?.readOnly).toBe(false)
    expect(inspect?.readOnly).toBe(true)
    expect(inspect?.outputSchema.safeParse({ kind: 'not_found' }).success).toBe(true)
    expect(start?.parameters.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'studyNodeId', 'targetDecisionNodeId', 'expectedGeneration', 'expectedRevision', 'proposalDigest',
    ]))
  })

  it('keeps the Study API generic and leaves completion out of the registry', () => {
    const start = findAction('study.start')
    const inspect = findAction('study.inspect')
    expect(start).toBeDefined()
    expect(inspect).toBeDefined()
    if (start === undefined || inspect === undefined) return

    expect(start.schema.safeParse(validStart).success).toBe(true)
    expect(start.schema.safeParse({ ...validStart, categoryQuote: { provider: 'fixture' } }).success).toBe(false)
    expect(findAction('study.complete')).toBeUndefined()
  })
})
