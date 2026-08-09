import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildAnswerTurnProblem } from '@/lib/errors'
import { ConvexSourceError } from '@/lib/server/convex-source'

const mocks = vi.hoisted(() => ({
  stopAnswerTurn: vi.fn(),
}))

vi.mock('@/modules/answer-thread/server', () => ({
  stopAnswerTurn: mocks.stopAnswerTurn,
}))

import { handleStopAnswerTurnRequest } from '@/routes/api.answer.turn.stop'

afterEach(() => {
  mocks.stopAnswerTurn.mockReset()
})

describe('POST /api/answer/turn/stop source failures', () => {
  it('maps Convex configuration/auth failures through the answer problem contract', async () => {
    mocks.stopAnswerTurn.mockRejectedValueOnce(
      new ConvexSourceError('missing_auth', 'private source detail', 401),
    )

    const response = await handleStopAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'ae_session=stop-owner',
        },
        body: JSON.stringify({ threadId: 'thread:stop', turnId: 'turn:stop' }),
      }),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual(buildAnswerTurnProblem('missing_auth'))
  })

  it('maps local source credential failures to a safe unavailable problem', async () => {
    const privateMessage = 'Local source credentials are unavailable.'
    mocks.stopAnswerTurn.mockRejectedValueOnce(new ConvexSourceError('missing_auth', privateMessage, 503))

    const response = await handleStopAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'ae_session=stop-owner',
        },
        body: JSON.stringify({ threadId: 'thread:stop', turnId: 'turn:stop' }),
      }),
    )

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      type: 'about:blank',
      title: 'Unavailable',
      status: 503,
      kind: 'UNAVAILABLE',
      code: 'source_unavailable',
      detail: 'The answer source is temporarily unavailable.',
      retryable: true,
    })
    expect(JSON.stringify(body)).not.toContain(privateMessage)
  })
})
