import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetAnswerTurnGuardForTests } from '@/modules/answer-thread/testing'
import { handleFollowUpChipsRequest } from '@/routes/api.answer.follow-up-chips'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { setHttpRateLimitAdmissionForTests, type RateLimitName } from '@/lib/server/rate-limit'
import { sessionCookieHeader } from '../helpers/answer-thread-test-port'

const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const ANSWER_TURN_RATE_LIMIT = 30
const ANSWER_FOLLOW_UP_CHIPS_RATE_LIMIT = 60
const RATE_LIMITS: Readonly<Record<RateLimitName, number>> = {
  'public-read': Number.POSITIVE_INFINITY,
  'public-mutation': Number.POSITIVE_INFINITY,
  'oauth-issuance': Number.POSITIVE_INFINITY,
  'answer-turn-submit': ANSWER_TURN_RATE_LIMIT,
  'answer-follow-up-chips': ANSWER_FOLLOW_UP_CHIPS_RATE_LIMIT,
  'answer-stream': Number.POSITIVE_INFINITY,
  'inquiry-submit': Number.POSITIVE_INFINITY,
}

beforeEach(() => {
  const counts = new Map<string, number>()
  setHttpRateLimitAdmissionForTests(async ({ name, key }) => {
    const countKey = `${name}:${key}`
    const count = counts.get(countKey) ?? 0
    if (count >= RATE_LIMITS[name]) return { ok: false, retryAfter: 1_000 }
    counts.set(countKey, count + 1)
    return { ok: true }
  })
})

describe('answer HTTP rate limits', () => {
  afterEach(() => {
    resetAnswerTurnGuardForTests()
  })

  it('dedupes turn submit rate limit for the same client turn key', async () => {
    const session = `turn-idempotency-session-${runId}`
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
    const session = `turn-rate-limit-session-${runId}`

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
    const session = `follow-up-chips-rate-limit-session-${runId}`
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
