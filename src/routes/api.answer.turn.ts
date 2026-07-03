import { createFileRoute } from '@tanstack/react-router'

import type { AnswerEvent } from '@/modules/answer/public'
import { createAbortAwareSseStream, isAbortError, sseDataLine } from '@/lib/server/sse-response'
import {
  answerTurnRequestSchema,
  appendSessionCookie,
  checkAnswerTurnRateLimit,
  readAnswerTurnAccessContext,
  resolveOrCreateSessionId,
  streamAnswerTurn,
} from '@/modules/answer-thread/public'

export const Route = createFileRoute('/api/answer/turn')({
  server: {
    handlers: {
      POST: ({ request }) => handleAnswerTurnRequest(request),
    },
  },
})

export async function handleAnswerTurnRequest(request: Request): Promise<Response> {
  const { sessionId, setCookie } = resolveOrCreateSessionId(request)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('invalid_body', 400)
  }

  const parsed = answerTurnRequestSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError('invalid_body', 400)
  }

  const clientTurnKey = request.headers.get('x-ae-turn-key')?.trim()
  const rateLimit = checkAnswerTurnRateLimit(sessionId, Date.now(), {
    ...(clientTurnKey === undefined || clientTurnKey.length === 0 ? {} : { clientTurnKey }),
  })
  if (rateLimit.kind === 'limited') {
    return jsonError('rate_limited', 429, rateLimit.retryAfter)
  }

  let threadId = parsed.data.threadId
  let accessContext = await readAnswerTurnAccessContext({
    sessionId,
    ...(threadId === undefined ? {} : { threadId }),
  })
  let { access } = accessContext
  let preloadedPriorTurns = threadId === undefined ? undefined : accessContext.priorTurns
  // Dev remounts can POST a thread id from SSE before Convex persistence finishes.
  if (access.kind === 'denied' && access.code === 'thread_not_found') {
    threadId = undefined
    accessContext = await readAnswerTurnAccessContext({ sessionId })
    access = accessContext.access
    preloadedPriorTurns = undefined
  }
  if (access.kind === 'denied') {
    return jsonError(access.code, access.status)
  }

  const stream = createAbortAwareSseStream({
    request,
    run: async (sendLine) => {
      const sourceWriteRequest = usesLocalE2eBypass() ? undefined : request
      const send = (frame: { seq: number; event: AnswerEvent }) => {
        if (request.signal.aborted) {
          return
        }
        sendLine(sseDataLine(frame))
      }

      try {
        const result = await streamAnswerTurn(
          {
            sessionId,
            query: parsed.data.query,
            ...(threadId === undefined ? {} : { threadId }),
            ...(parsed.data.searchContext === undefined ? {} : { searchContext: parsed.data.searchContext }),
            precheckedAccess: access,
            ...(preloadedPriorTurns === undefined ? {} : { preloadedPriorTurns }),
            signal: request.signal,
            ...(sourceWriteRequest === undefined ? {} : { sourceWriteRequest }),
          },
          send,
        )

        void result
      } catch (error) {
        if (request.signal.aborted || isAbortError(error)) {
          return
        }
        send({
          seq: 0,
          event: { type: 'error', code: 'answer_turn_failed', copyId: makeCopyId() },
        })
      }
    },
  })

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  }

  const response = new Response(stream, { headers })
  return appendSessionCookie(response, sessionId, setCookie, request)
}

function jsonError(code: string, status: number, retryAfter?: number): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (retryAfter !== undefined) {
    headers['Retry-After'] = String(Math.max(1, Math.ceil((retryAfter - Date.now()) / 1000)))
  }
  return new Response(JSON.stringify({ error: code }), { status, headers })
}

function makeCopyId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}
