import { describe, expect, it } from 'vitest'

import { answerTurnRequestSchema } from '@/modules/answer-thread/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'

describe('POST /api/answer/turn', () => {
  it('rejects empty query bodies', async () => {
    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '   ' }),
      }),
    )

    expect(response.status).toBe(400)
  })

  it('validates turn request schema', () => {
    const parsed = answerTurnRequestSchema.safeParse({ query: 'plumber Preston' })
    expect(parsed.success).toBe(true)
  })
})

