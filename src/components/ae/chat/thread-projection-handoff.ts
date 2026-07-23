import type { PublicThreadProjection } from '@/modules/answer-thread/public'

const THREAD_PROJECTION_HANDOFF_PREFIX = 'ae.threadProjectionHandoff.v1:'

/**
 * Preserves display continuity across the thread-route transition. The stored
 * projection is never read by command, authority, or persistence code.
 */
export function writeThreadProjectionHandoff(projection: PublicThreadProjection): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      handoffKey(projection.threadId),
      JSON.stringify(projection),
    )
  } catch {
    // Source-owned readback remains the fallback when browser storage is unavailable.
  }
}

export function readThreadProjectionHandoff(threadId: string): PublicThreadProjection | null {
  if (typeof window === 'undefined') return null
  const key = handoffKey(threadId)
  try {
    const raw = window.sessionStorage.getItem(key)
    if (raw === null) return null
    return readProjection(JSON.parse(raw) as unknown, threadId)
  } catch {
    window.sessionStorage.removeItem(key)
    return null
  }
}

export function clearThreadProjectionHandoff(threadId: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(handoffKey(threadId))
}

function handoffKey(threadId: string): string {
  return `${THREAD_PROJECTION_HANDOFF_PREFIX}${threadId}`
}

function readProjection(value: unknown, expectedThreadId: string): PublicThreadProjection | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (record.threadId !== expectedThreadId || typeof record.title !== 'string' || !Array.isArray(record.turns)) {
    return null
  }
  if (!record.turns.every(isPublicTurnShape)) return null
  return value as PublicThreadProjection
}

function isPublicTurnShape(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const turn = value as Record<string, unknown>
  return typeof turn.turnId === 'string'
    && typeof turn.query === 'string'
    && typeof turn.seq === 'number'
    && (turn.status === 'pending' || turn.status === 'complete' || turn.status === 'error')
    && typeof turn.oneLine === 'string'
    && Array.isArray(turn.workLog)
    && Array.isArray(turn.artifacts)
}
