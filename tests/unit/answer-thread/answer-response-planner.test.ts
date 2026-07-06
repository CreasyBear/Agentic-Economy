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
})
