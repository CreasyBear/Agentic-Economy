import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

import { getAnswerThread, getAnswerThreadWithTurns } from '../answer-thread.functions'
import type { AnswerTurnRecord } from '../answer-thread.schema'

const ANSWER_TURN_MAX_PER_THREAD = 25

const turnIdempotencyClaims = new Map<string, number>()

const TURN_IDEMPOTENCY_TTL_MS = 30_000

function pruneTurnIdempotencyClaims(now: number): void {
  for (const [key, expiresAt] of turnIdempotencyClaims) {
    if (expiresAt <= now) {
      turnIdempotencyClaims.delete(key)
    }
  }
}
export function claimAnswerTurnIdempotency(sessionId: string, clientTurnKey: string, now = Date.now()): boolean {
  pruneTurnIdempotencyClaims(now)
  const dedupeKey = `${sessionId}:${clientTurnKey}`
  const expiresAt = turnIdempotencyClaims.get(dedupeKey)
  if (expiresAt !== undefined && expiresAt > now) {
    return false
  }
  turnIdempotencyClaims.set(dedupeKey, now + TURN_IDEMPOTENCY_TTL_MS)
  return true
}


export type AnswerTurnAccessDecision =
  | { kind: 'allowed'; turnCount: number }
  | {
      kind: 'denied'
      code: 'thread_forbidden' | 'thread_not_found' | 'thread_turn_limit'
      status: 403 | 404
    }


export async function assertAnswerTurnAccess(input: {
  sessionId: string
  threadId?: string
}): Promise<AnswerTurnAccessDecision> {
  if (input.threadId === undefined) {
    return { kind: 'allowed', turnCount: 0 }
  }

  const thread = await getAnswerThread(input.threadId, input.sessionId)
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

  const thread = await getAnswerThreadWithTurns(input.threadId, input.sessionId, { cursor: null, numItems: ANSWER_TURN_MAX_PER_THREAD })
  if (thread === null) {
    return { access: { kind: 'denied', code: 'thread_not_found', status: 404 }, priorTurns: [] }
  }

  if (thread.thread.pseudonymousSessionId !== input.sessionId && !isLocalE2EAuthBypassEnabled()) {
    return { access: { kind: 'denied', code: 'thread_forbidden', status: 403 }, priorTurns: [] }
  }

  if (thread.thread.turnCount >= ANSWER_TURN_MAX_PER_THREAD) {
    return { access: { kind: 'denied', code: 'thread_turn_limit', status: 403 }, priorTurns: thread.turns.page }
  }

  return { access: { kind: 'allowed', turnCount: thread.thread.turnCount }, priorTurns: thread.turns.page }
}

export function resetAnswerTurnGuardForTests(): void {
  turnIdempotencyClaims.clear()
}
