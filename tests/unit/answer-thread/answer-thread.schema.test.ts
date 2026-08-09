import { describe, expect, it } from 'vitest'

import { buildAnswerTurnProblem } from '@/lib/errors'
import { PublicThreadTurnSchema } from '@/modules/answer-thread/answer-thread.schema'

const baseErrorTurn = {
  turnId: 'turn-1',
  seq: 1,
  query: 'Find a plumber in Preston',
  intent: 'refine_search',
  status: 'error',
  workLog: [],
  artifacts: [],
  oneLine: '',
}

describe('public answer-thread schemas', () => {
  it('decodes canonical Problem Details without changing the public problem', () => {
    const canonical = buildAnswerTurnProblem('rate_limited')
    const parsed = PublicThreadTurnSchema.safeParse({ ...baseErrorTurn, problem: canonical })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.problem).toEqual(canonical)
  })

  it.each([
    ['private fields', { ...buildAnswerTurnProblem('answer_turn_failed'), copyId: 'private-copy-id' }],
    ['forged detail', { ...buildAnswerTurnProblem('answer_turn_failed'), detail: 'provider secret' }],
    ['unknown code', { ...buildAnswerTurnProblem('answer_turn_failed'), code: 'private_agent_code' }],
  ])('rejects %s Problem Details with a canonical validation issue', (_label, problem) => {
    const parsed = PublicThreadTurnSchema.safeParse({ ...baseErrorTurn, problem })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues).toContainEqual({
      code: 'custom',
      path: ['problem'],
      message: 'Invalid answer turn problem.',
    })
  })
})
