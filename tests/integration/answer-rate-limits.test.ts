import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConvexSourceError } from '@/lib/server/convex-source'
import { buildAnswerTurnProblem } from '@/lib/errors'
import {
  setHttpRateLimitAdmissionForTests,
  type RateLimitAdmission,
} from '@/lib/server/rate-limit'
import { handleFollowUpChipsRequest } from '@/routes/api.answer.follow-up-chips'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'

const NOOP_TURN_STREAM = async () => undefined
const RETRY_AFTER_MS = 60_000

describe('answer HTTP rate limits', () => {
  let resetPort: (() => void) | undefined

  beforeEach(() => {
    resetPort = installAnswerThreadTestPort(createAnswerThreadTestStore())
  })

  afterEach(() => {
    resetPort?.()
  })
  it('admits local E2E answer turns without Convex rate storage', async () => {
    const previousLocalE2E = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    setHttpRateLimitAdmissionForTests(undefined)

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-AE-Turn-Key': 'local-e2e:plumber-brunswick' },
          body: JSON.stringify({ query: 'plumber brunswick' }),
        }),
        { stream: NOOP_TURN_STREAM },
      )
      expect(response.status).not.toBe(429)
    } finally {
      if (previousLocalE2E === undefined) delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      else process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalE2E
      if (previousConvexUrl === undefined) delete process.env.CONVEX_URL
      else process.env.CONVEX_URL = previousConvexUrl
      if (previousViteConvexUrl === undefined) delete process.env.VITE_CONVEX_URL
      else process.env.VITE_CONVEX_URL = previousViteConvexUrl
      setHttpRateLimitAdmissionForTests(undefined)
    }
  })

  it('re-admits a same-key retry after a refused first admission', async () => {
    const admit = vi.fn<RateLimitAdmission>()
      .mockResolvedValueOnce({ ok: false, retryAfter: RETRY_AFTER_MS })
      .mockResolvedValueOnce({ ok: true })
    const request = () => new Request('https://ae.example/api/answer/turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookieHeader('turn-retry-session'),
        'X-AE-Turn-Key': 'gen-retry:plumber brunswick',
      },
      body: JSON.stringify({ query: 'plumber brunswick' }),
    })

    const limited = await handleAnswerTurnRequest(request(), { admit, stream: NOOP_TURN_STREAM })
    await expectRateLimited(limited)

    const retried = await handleAnswerTurnRequest(request(), { admit, stream: NOOP_TURN_STREAM })
    expect(retried.status).not.toBe(429)
    expect(admit).toHaveBeenCalledTimes(2)
  })


  it('rate-checks a retry before replaying the durable turn admission', async () => {
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

    expect(admit).toHaveBeenCalledTimes(2)
  })

  it('maps a refused turn admission to 429', async () => {
    const admit = sequencedAdmission()
    const request = () => new Request('https://ae.example/api/answer/turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookieHeader('turn-rate-limit-session'),
        'X-AE-Turn-Key': 'rate-limit:plumber-test',
      },
      body: JSON.stringify({ query: 'plumber test' }),
    })

    const accepted = await handleAnswerTurnRequest(request(), { admit, stream: NOOP_TURN_STREAM })
    expect(accepted.status).not.toBe(429)

    const limited = await handleAnswerTurnRequest(request(), { admit, stream: NOOP_TURN_STREAM })
    await expectRateLimited(limited)
  })
  it('maps a thread-limit refusal to a non-retryable canonical problem', async () => {
    resetPort?.()
    const store = createAnswerThreadTestStore()
    const threadId = 'thread:limit'
    const sessionId = 'thread-limit-owner'
    const now = Date.now()
    store.threads.set(threadId, {
      threadId,
      pseudonymousSessionId: sessionId,
      title: 'Limited thread',
      createdAt: now,
      updatedAt: now,
    })
    for (let seq = 1; seq <= 25; seq += 1) {
      store.reservations.set(`reservation:${seq}`, {
        reservationKey: `reservation:${seq}`,
        sessionId,
        requestedThreadScope: threadId,
        requestDigest: `digest:${seq}`,
        threadId,
        turnId: `turn:${seq}`,
        seq,
        query: 'prior query',
        state: 'reserved',
        createdAt: now,
        updatedAt: now,
      })
    }
    resetPort = installAnswerThreadTestPort(store)

    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookieHeader(sessionId),
          'X-AE-Turn-Key': 'thread-limit:new',
        },
        body: JSON.stringify({ threadId, query: 'another query' }),
      }),
      { admit: async () => ({ ok: true }), stream: NOOP_TURN_STREAM },
    )

    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body).toEqual(buildAnswerTurnProblem('thread_turn_limit'))
    expect(body).not.toHaveProperty('retryable')
  })


  it('maps a missing Convex URL during admission to an actionable problem', async () => {
    const admit: RateLimitAdmission = async () => {
      throw new ConvexSourceError('missing_convex_url', 'source-secret', 500)
    }
    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-AE-Turn-Key': 'missing-convex:plumber-test' },
        body: JSON.stringify({ query: 'plumber test' }),
      }),
      { admit, stream: NOOP_TURN_STREAM },
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    const body = await response.json()
    expect(body).toEqual(buildAnswerTurnProblem('missing_convex_url'))
    expect(body).not.toHaveProperty('stack')
    expect(JSON.stringify(body)).not.toContain('source-secret')
  })

  it('maps unknown admission failures to the canonical unavailable problem', async () => {
    const admit: RateLimitAdmission = async () => {
      throw new Error('unexpected admission failure')
    }

    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-AE-Turn-Key': 'unknown-admission:plumber-test' },
        body: JSON.stringify({ query: 'plumber test' }),
      }),
      { admit, stream: NOOP_TURN_STREAM },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'unavailable',
    })
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
  expect(await response.json()).toMatchObject({ kind: 'RESOURCE_EXHAUSTED', code: 'rate_limited' })
  expect(response.headers.get('Retry-After')).toBe('60')
}
