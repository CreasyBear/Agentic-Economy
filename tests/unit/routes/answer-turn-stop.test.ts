import { afterEach, describe, expect, it, vi } from 'vitest'

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
    await expect(response.json()).resolves.toMatchObject({
      type: 'about:blank',
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'missing_auth',
      detail: 'Answer service authentication is unavailable. Sign in again; local operators should restart npm run dev:local.',
    })
  })
})
