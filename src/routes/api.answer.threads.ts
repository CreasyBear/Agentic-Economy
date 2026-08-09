import { createFileRoute } from '@tanstack/react-router'

import { jsonResponse } from './api.businesses'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { listSessionThreads, resolveOrCreateSessionId, appendSessionCookie } from '@/modules/answer-thread/public'

export const Route = createFileRoute('/api/answer/threads')({
  server: {
    handlers: {
      GET: ({ request }) => handleListAnswerThreadsRequest(request),
      POST: () => methodNotAllowed(['GET']),
      PUT: () => methodNotAllowed(['GET']),
      PATCH: () => methodNotAllowed(['GET']),
      DELETE: () => methodNotAllowed(['GET']),
      HEAD: () => methodNotAllowed(['GET']),
      OPTIONS: () => methodNotAllowed(['GET']),
      TRACE: () => methodNotAllowed(['GET']),
      ANY: () => methodNotAllowed(['GET']),
      CONNECT: () => methodNotAllowed(['GET']),
    },
  },
})

export async function handleListAnswerThreadsRequest(request: Request): Promise<Response> {
  try {
    const { sessionId, setCookie } = resolveOrCreateSessionId(request)
    const result = await listSessionThreads(sessionId)
    const response = jsonResponse(result)
    return appendSessionCookie(response, sessionId, setCookie, request)
  } catch {
    return problem({ kind: 'UNAVAILABLE', code: 'unavailable', retryable: true })
  }
}
