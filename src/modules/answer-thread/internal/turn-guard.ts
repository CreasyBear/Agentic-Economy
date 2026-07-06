import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { rateLimitClaim, type AbuseRateLimitBucketRecord, type RateLimitDecision } from '@/modules/security/public'

import { getAnswerThread, getAnswerThreadWithTurns } from '../answer-thread.functions'
import type { AnswerTurnRecord } from '../answer-thread.schema'

const ANSWER_TURN_MAX_PER_THREAD = 25
export const ANSWER_TURN_RATE_LIMIT = 30
export const ANSWER_TURN_RATE_WINDOW_MS = 60 * 60 * 1000
export const ANSWER_FOLLOW_UP_CHIPS_RATE_LIMIT = 60
export const ANSWER_STREAM_RATE_LIMIT = 30

const turnRateLimitBuckets: AbuseRateLimitBucketRecord[] = []
const followUpChipsRateLimitBuckets: AbuseRateLimitBucketRecord[] = []
const answerStreamRateLimitBuckets: AbuseRateLimitBucketRecord[] = []
const turnIdempotencyClaims = new Map<string, number>()

const TURN_IDEMPOTENCY_TTL_MS = 30_000
const DEV_ANSWER_TURN_RATE_LIMIT = 10_000

function effectiveTurnRateLimit(): number {
  return process.env.NODE_ENV === 'development' ? DEV_ANSWER_TURN_RATE_LIMIT : ANSWER_TURN_RATE_LIMIT
}

function pruneTurnIdempotencyClaims(now: number): void {
  for (const [key, expiresAt] of turnIdempotencyClaims) {
    if (expiresAt <= now) {
      turnIdempotencyClaims.delete(key)
    }
  }
}

function syntheticAcceptedBucket(sessionId: string, now: number): AbuseRateLimitBucketRecord {
  const windowMs = ANSWER_TURN_RATE_WINDOW_MS
  const window = String(Math.floor(now / windowMs))
  return {
    scope: 'answer_turn_submit',
    key: sessionId,
    window,
    count: 0,
    state: 'open',
    resetAt: (Number(window) + 1) * windowMs,
    updatedAt: now,
  }
}

export type AnswerTurnAccessDecision =
  | { kind: 'allowed'; turnCount: number }
  | {
      kind: 'denied'
      code: 'thread_forbidden' | 'thread_not_found' | 'thread_turn_limit'
      status: 403 | 404
    }

export function checkAnswerTurnRateLimit(
  sessionId: string,
  now = Date.now(),
  options?: { clientTurnKey?: string },
): RateLimitDecision {
  if (options?.clientTurnKey !== undefined && options.clientTurnKey.length > 0) {
    pruneTurnIdempotencyClaims(now)
    const dedupeKey = `${sessionId}:${options.clientTurnKey}`
    const expiresAt = turnIdempotencyClaims.get(dedupeKey)
    if (expiresAt !== undefined && expiresAt > now) {
      return { kind: 'accepted', bucket: syntheticAcceptedBucket(sessionId, now) }
    }
    turnIdempotencyClaims.set(dedupeKey, now + TURN_IDEMPOTENCY_TTL_MS)
  }

  return rateLimitClaim(turnRateLimitBuckets, {
    scope: 'answer_turn_submit',
    key: sessionId,
    now,
    limit: effectiveTurnRateLimit(),
    windowMs: ANSWER_TURN_RATE_WINDOW_MS,
  })
}

export function checkAnswerFollowUpChipsRateLimit(sessionId: string, now = Date.now()): RateLimitDecision {
  return rateLimitClaim(followUpChipsRateLimitBuckets, {
    scope: 'answer_follow_up_chips',
    key: sessionId,
    now,
    limit: ANSWER_FOLLOW_UP_CHIPS_RATE_LIMIT,
    windowMs: ANSWER_TURN_RATE_WINDOW_MS,
  })
}

export function checkAnswerStreamRateLimit(sessionId: string, now = Date.now()): RateLimitDecision {
  return rateLimitClaim(answerStreamRateLimitBuckets, {
    scope: 'answer_stream',
    key: sessionId,
    now,
    limit: ANSWER_STREAM_RATE_LIMIT,
    windowMs: ANSWER_TURN_RATE_WINDOW_MS,
  })
}

export async function assertAnswerTurnAccess(input: {
  sessionId: string
  threadId?: string
}): Promise<AnswerTurnAccessDecision> {
  if (input.threadId === undefined) {
    return { kind: 'allowed', turnCount: 0 }
  }

  const thread = await getAnswerThread(input.threadId)
  if (thread === null) {
    return { kind: 'denied', code: 'thread_not_found', status: 404 }
  }

  if (thread.pseudonymousSessionId !== input.sessionId && !isLocalE2EAuthBypassEnabled()) {
    return { kind: 'denied', code: 'thread_forbidden', status: 403 }
  }

  const turnCount = thread.turnCount
  if (turnCount >= ANSWER_TURN_MAX_PER_THREAD) {
    return { kind: 'denied', code: 'thread_turn_limit', status: 403 }
  }

  return { kind: 'allowed', turnCount }
}

export async function readAnswerTurnAccessContext(input: {
  sessionId: string
  threadId?: string
}): Promise<{
  access: AnswerTurnAccessDecision
  priorTurns: readonly AnswerTurnRecord[]
}> {
  if (input.threadId === undefined) {
    return { access: { kind: 'allowed', turnCount: 0 }, priorTurns: [] }
  }

  const thread = await getAnswerThreadWithTurns(input.threadId)
  if (thread === null) {
    return { access: { kind: 'denied', code: 'thread_not_found', status: 404 }, priorTurns: [] }
  }

  if (thread.pseudonymousSessionId !== input.sessionId && !isLocalE2EAuthBypassEnabled()) {
    return { access: { kind: 'denied', code: 'thread_forbidden', status: 403 }, priorTurns: [] }
  }

  if (thread.turnCount >= ANSWER_TURN_MAX_PER_THREAD) {
    return { access: { kind: 'denied', code: 'thread_turn_limit', status: 403 }, priorTurns: thread.turns }
  }

  return { access: { kind: 'allowed', turnCount: thread.turnCount }, priorTurns: thread.turns }
}

export function resetAnswerTurnGuardForTests(): void {
  turnRateLimitBuckets.length = 0
  followUpChipsRateLimitBuckets.length = 0
  answerStreamRateLimitBuckets.length = 0
  turnIdempotencyClaims.clear()
}
