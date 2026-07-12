import { afterEach, describe, expect, it } from 'vitest'

import {
  ANSWER_FOLLOW_UP_CHIPS_RATE_LIMIT,
  ANSWER_TURN_RATE_LIMIT,
  resetAnswerTurnGuardForTests,
} from '@/modules/answer-thread/testing'
import { handleFollowUpChipsRequest } from '@/routes/api.answer.follow-up-chips'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { sessionCookieHeader } from '../helpers/answer-thread-test-port'

describe('answer HTTP rate limits', () => {
  afterEach(() => {
    resetAnswerTurnGuardForTests()
  })

  it('dedupes turn submit rate limit for the same client turn key', async () => {
    const session = 'turn-idempotency-session'
    const headers = {
      'Content-Type': 'application/json',
      cookie: sessionCookieHeader(session),
      'X-AE-Turn-Key': 'gen-1:plumber brunswick',
    }

    for (let index = 0; index < 2; index += 1) {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: 'plumber brunswick' }),
        }),
      )
      expect(response.status).not.toBe(429)
    }
  })

  it('returns 429 after turn submit limit', async () => {
    const session = 'turn-rate-limit-session'

    for (let index = 0; index < ANSWER_TURN_RATE_LIMIT; index += 1) {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: sessionCookieHeader(session),
          },
          body: JSON.stringify({ query: `plumber test ${index}` }),
        }),
      )
      expect(response.status).not.toBe(429)
    }

    const limited = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookieHeader(session),
        },
        body: JSON.stringify({ query: 'plumber test limited' }),
      }),
    )

    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate_limited' })
  })

  it('returns 429 after follow-up chips limit', async () => {
    const session = 'follow-up-chips-rate-limit-session'
    const body = JSON.stringify({
      query: 'emergency plumber parramatta',
      providers: [],
    })

    for (let index = 0; index < ANSWER_FOLLOW_UP_CHIPS_RATE_LIMIT; index += 1) {
      const response = await handleFollowUpChipsRequest(
        new Request('https://ae.example/api/answer/follow-up-chips', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: sessionCookieHeader(session),
          },
          body,
        }),
      )
      expect(response.status).not.toBe(429)
    }

    const limited = await handleFollowUpChipsRequest(
      new Request('https://ae.example/api/answer/follow-up-chips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookieHeader(session),
        },
        body,
      }),
    )

    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate_limited' })
  })
})
