import { createFileRoute } from '@tanstack/react-router'

import { jsonResponse } from './api.businesses'
import { listSessionThreads, resolveOrCreateSessionId, appendSessionCookie } from '@/modules/answer-thread/public'

export const Route = createFileRoute('/api/answer/threads')({
  server: {
    handlers: {
      GET: ({ request }) => handleListAnswerThreadsRequest(request),
    },
  },
})

export async function handleListAnswerThreadsRequest(request: Request): Promise<Response> {
  const { sessionId, setCookie } = resolveOrCreateSessionId(request)

  try {
    const result = await listSessionThreads(sessionId)
    const response = jsonResponse(result)
    return appendSessionCookie(response, sessionId, setCookie, request)
  } catch {
    return jsonResponse({ threads: [] })
  }
}
