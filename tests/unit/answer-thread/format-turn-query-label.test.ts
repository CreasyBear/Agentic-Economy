import { describe, expect, it } from 'vitest'

import { formatTurnQueryLabel } from '@/modules/answer-thread/internal/format-turn-query-label'

describe('formatTurnQueryLabel', () => {
  it('labels the first turn as need', () => {
    expect(formatTurnQueryLabel({ query: 'emergency plumber', intent: 'refine_search', seq: 1 })).toEqual({
      text: 'emergency plumber',
      role: 'need',
    })
  })

  it('formats narrow chip labels as follow-up deltas', () => {
    expect(formatTurnQueryLabel({ query: 'Narrow to Parramatta', intent: 'refine_search', seq: 2 })).toEqual({
      text: '→ Parramatta',
      role: 'follow-up',
    })
  })

  it('keeps manual boundary questions literal', () => {
    expect(
      formatTurnQueryLabel({
        query: 'What can Agentic Economy do here?',
        intent: 'explain_boundary',
        seq: 2,
      }),
    ).toEqual({
      text: 'What can Agentic Economy do here?',
      role: 'follow-up',
    })
  })

  it('removes bidi formatting controls without changing visible query text', () => {
    expect(formatTurnQueryLabel({ query: 'مرحبا\u202e fake marker', intent: 'refine_search', seq: 1 })).toEqual({
      text: 'مرحبا fake marker',
      role: 'need',
    })
  })
})
