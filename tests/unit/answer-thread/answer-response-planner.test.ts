import { describe, expect, it } from 'vitest'

import { planAnswerTurn } from '@/modules/answer-thread/internal/answer-response-planner'

describe('answer response planner', () => {
  it('asks for the missing service before searching locator-only broad queries', () => {
    for (const query of ['show me everything near me', "what's available around here"]) {
      const plan = planAnswerTurn({
        query,
        priorTurnsCount: 0,
        searchContext: undefined,
      })

      expect(plan).toMatchObject({
        mode: 'clarify',
        reason: 'missing_service',
        providerBudget: { searchLimit: 0, visibleLimit: 0 },
        toolPolicy: { kind: 'none' },
      })
    }
  })

  it('asks one service question for category-free help requests', () => {
    const plan = planAnswerTurn({
      query: 'I need help',
      priorTurnsCount: 0,
      searchContext: undefined,
    })

    expect(plan).toMatchObject({
      mode: 'clarify',
      reason: 'missing_service',
      toolPolicy: { kind: 'none' },
    })
  })
 
  it('asks one natural open question for a vague help request', () => {
    const plan = planAnswerTurn({
      query: 'Can you help me?',
      priorTurnsCount: 0,
      searchContext: undefined,
    })

    expect(plan).toMatchObject({
      mode: 'clarify',
      reason: 'missing_service',
      snapshot: {
        oneLine: 'What do you need help with?',
      },
    })
    if (plan.mode !== 'clarify') throw new Error('expected clarify plan')
    expect(plan.snapshot.oneLine).not.toContain('Can you help me?')
    expect(plan.snapshot.oneLine).not.toContain(' in ')
  })

  it('keeps a misspelled requested place as the search area instead of asking again', () => {
    const plan = planAnswerTurn({
      query: 'show services in paramatta',
      priorTurnsCount: 0,
      searchContext: undefined,
    })

    expect(plan).toMatchObject({
      mode: 'clarify',
      reason: 'missing_service',
      snapshot: {
        nextStep: expect.stringContaining('Parramatta'),
      },
    })
    if (plan.mode !== 'clarify') throw new Error('expected clarify plan')
    expect(plan.snapshot.nextStep).not.toContain('paramatta')
  })
})
