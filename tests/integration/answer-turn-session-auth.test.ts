import { afterEach, describe, expect, it } from 'vitest'

import { resetAnswerTurnGuardForTests, setAnswerThreadPortForTests } from '@/modules/answer-thread/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

describe('POST /api/answer/turn session auth', () => {
  afterEach(() => {
    setAnswerThreadPortForTests(undefined)
    resetAnswerTurnGuardForTests()
  })

  it('rejects follow-up writes from a different session', async () => {
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)

    const state = createDefaultRegistrySourceState()
    let threadId = ''

    await withRegistrySourcePortForTest(state, async () => {
      const ownerSession = 'owner-session-1'
      const first = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: sessionCookieHeader(ownerSession),
          },
          body: JSON.stringify({ query: 'emergency plumber parramatta' }),
        }),
      )

      expect(first.ok).toBe(true)

      const firstText = await first.text()
      const threadMatch = firstText.match(/"threadId":"([^"]+)"/)
      threadId = threadMatch?.[1] ?? ''
      expect(threadId.length).toBeGreaterThan(0)

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
})
