import type { PublicThreadProjection } from '@/modules/answer-thread/public'

const pendingHandoffs = new Map<string, PublicThreadProjection>()

/**
 * Preserves display continuity during one in-app thread-route transition.
 * This transient, process-local projection is never persistence or authority.
 */
export function writeThreadProjectionHandoff(projection: PublicThreadProjection): void {
  pendingHandoffs.set(projection.threadId, projection)
}

export function takeThreadProjectionHandoff(threadId: string): PublicThreadProjection | null {
  const projection = pendingHandoffs.get(threadId) ?? null
  pendingHandoffs.delete(threadId)
  return projection
}
