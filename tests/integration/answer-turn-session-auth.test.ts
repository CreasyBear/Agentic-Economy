import { afterEach, describe, expect, it } from 'vitest'

import { ConvexSourceError } from '@/lib/server/convex-source'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'

describe('POST /api/answer/turn session auth', () => {
  afterEach(() => {
    setAnswerThreadPortForTests(undefined)
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
      createdAt: 1_000,
      updatedAt: 1_000,
    })

    const intruder = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookieHeader('intruder-session'),
          'X-AE-Turn-Key': 'session-auth:intruder',
        },
        body: JSON.stringify({
          threadId,
          query: 'What can Agentic Economy do here?',
        }),
      }),
    )

    expect(intruder.status).toBe(403)
    expect(await intruder.json()).toEqual({
      type: 'about:blank',
      title: 'Permission denied',
      status: 403,
      kind: 'PERMISSION_DENIED',
      code: 'thread_forbidden',
      detail: 'This answer thread is not available to this browser.',
    })
  })

  it('maps missing Convex authentication during durable reservation to an actionable problem', async () => {
    const store = createAnswerThreadTestStore()
    store.reserveError = new ConvexSourceError('missing_auth', 'auth-secret', 401)
    installAnswerThreadTestPort(store)

    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookieHeader('answer-source-auth-session'),
          'X-AE-Turn-Key': 'session-auth:source',
        },
        body: JSON.stringify({
          threadId: 'thread-source-auth',
          query: 'plumber test',
        }),
      }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    const body = await response.json()
    expect(body).toMatchObject({
      type: 'about:blank',
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'missing_auth',
      detail: 'Answer service authentication is unavailable. Sign in again; local operators should restart npm run dev:local.',
    })
    expect(body).not.toHaveProperty('stack')
    expect(JSON.stringify(body)).not.toContain('auth-secret')
  })
})
