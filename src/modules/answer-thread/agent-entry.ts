/**
 * The keyless agent entry.
 *
 * `/api/v1/requests` is the only path that can compare, confirm, and start a
 * registered option, and it needs an issued key because it can reach
 * consequential work. Reading and comparing published supply causes no external
 * effect, so the Answer Thread turn route accepts a cold caller with no
 * credential. Every assistant-facing surface quotes this record so the
 * advertised shape and the served route cannot drift apart.
 */
export const ANSWER_THREAD_AGENT_ENTRYPOINT = Object.freeze({
  contract: 'Answer Thread turn' as const,
  method: 'POST' as const,
  path: '/api/answer/turn' as const,
  authentication: 'none' as const,
  responseMediaType: 'text/event-stream' as const,
  /** Mirrors `answerTurnRequestSchema`; keep both in step. */
  body: Object.freeze({
    query: 'natural-language request, 1-200 characters' as const,
    threadId: 'optional; continue an earlier thread' as const,
  }),
  consequenceClass: 'read_only' as const,
  boundary:
    'Reads and compares published business facts. It cannot confirm, start, book, charge, dispatch, or send anything.',
})

/** The one-hop escalation from the keyless entry to consequential work. */
export const AGENT_KEY_ISSUANCE_PATH = '/agent-access' as const
