import { ConvexError } from 'convex/values'

const turnErrors: Readonly<Record<string, string>> = {
  invalid_input: 'turn_invalid',
  turn_idempotency_conflict: 'turn_conflict',
  thread_busy: 'turn_fenced',
  turn_not_found: 'turn_not_found',
  thread_not_found: 'turn_not_found',
  turn_stream_not_found: 'turn_not_found',
  unauthenticated: 'unauthenticated',
  permission_denied: 'permission_denied',
  rate_limited: 'rate_limited',
}

/** Only known Turn refusals are projected; source/backend faults retain their original cause. */
export async function publicChatTurn<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    if (cause instanceof ConvexError) throw cause
    const code = cause instanceof Error ? turnErrors[cause.message] : undefined
    if (code !== undefined) throw new ConvexError({ code })
    throw cause
  }
}
