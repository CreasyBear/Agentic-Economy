import { afterEach, describe, expect, it } from 'vitest'

import { resetAnswerTurnGuardForTests, setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'

describe('POST /api/answer/turn session auth', () => {
  afterEach(() => {
    setAnswerThreadPortForTests(undefined)
    resetAnswerTurnGuardForTests()
  })

  it('rejects follow-up writes from a different session', async () => {
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)
    const ownerSession = 'owner-session-1'
    const threadId = 'thread-session-auth'
    store.threads.set(threadId, {
      threadId,
      pseudonymousSessionId: ownerSession,
      title: 'emergency plumber parramatta',
      sharePolicy: 'public',
      createdAt: 1_000,
      updatedAt: 1_000,
    })

    const intruder = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookieHeader('intruder-session'),
        },
        body: JSON.stringify({
          threadId,
          query: 'What can Agentic Economy do here?',
        }),
      }),
    )

    expect(intruder.status).toBe(403)
    expect(await intruder.json()).toEqual({ error: 'thread_forbidden' })
  })
})
