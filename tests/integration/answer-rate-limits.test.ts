import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RateLimitAdmission } from '@/lib/server/rate-limit'
import { resetAnswerTurnGuardForTests } from '@/modules/answer-thread/testing'
import { handleFollowUpChipsRequest } from '@/routes/api.answer.follow-up-chips'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { sessionCookieHeader } from '../helpers/answer-thread-test-port'

const NOOP_TURN_STREAM = async () => undefined
const RETRY_AFTER_MS = 60_000

describe('answer HTTP rate limits', () => {
  afterEach(() => {
    resetAnswerTurnGuardForTests()
  })

  it('dedupes admission for the same client turn key', async () => {
    const admit = vi.fn<RateLimitAdmission>().mockResolvedValue({ ok: true })
    const headers = {
      'Content-Type': 'application/json',
      cookie: sessionCookieHeader('turn-idempotency-session'),
      'X-AE-Turn-Key': 'gen-1:plumber brunswick',
    }

    for (let index = 0; index < 2; index += 1) {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: 'plumber brunswick' }),
        }),
        { admit, stream: NOOP_TURN_STREAM },
      )
      expect(response.status).not.toBe(429)
    }

    expect(admit).toHaveBeenCalledTimes(1)
  })

  it('maps a refused turn admission to 429', async () => {
    const admit = sequencedAdmission()
    const request = () => new Request('https://ae.example/api/answer/turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookieHeader('turn-rate-limit-session'),
      },
      body: JSON.stringify({ query: 'plumber test' }),
    })

    const accepted = await handleAnswerTurnRequest(request(), { admit, stream: NOOP_TURN_STREAM })
    expect(accepted.status).not.toBe(429)

    const limited = await handleAnswerTurnRequest(request(), { admit, stream: NOOP_TURN_STREAM })
    await expectRateLimited(limited)
  })

  it('maps a refused follow-up-chip admission to 429', async () => {
    const admit = sequencedAdmission()
    const request = () => new Request('https://ae.example/api/answer/follow-up-chips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookieHeader('follow-up-chips-rate-limit-session'),
      },
      body: JSON.stringify({
        query: 'emergency plumber parramatta',
        providers: [],
      }),
    })

    const accepted = await handleFollowUpChipsRequest(request(), { admit })
    expect(accepted.status).not.toBe(429)

    const limited = await handleFollowUpChipsRequest(request(), { admit })
    await expectRateLimited(limited)
  })
})

function sequencedAdmission(): RateLimitAdmission {
  return vi.fn<RateLimitAdmission>()
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValue({ ok: false, retryAfter: RETRY_AFTER_MS })
}

async function expectRateLimited(response: Response): Promise<void> {
  expect(response.status).toBe(429)
  expect(await response.json()).toEqual({ error: 'rate_limited' })
  expect(response.headers.get('Retry-After')).toBe('60')
}
