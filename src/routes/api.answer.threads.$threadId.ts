import { createFileRoute } from '@tanstack/react-router'

import { jsonResponse } from './api.businesses'
import {
  appendSessionCookie,
  deleteAnswerThread,
  getPublicThreadProjection,
  resolveOrCreateSessionId,
} from '@/modules/answer-thread/public'

export const Route = createFileRoute('/api/answer/threads/$threadId')({
  server: {
    handlers: {
      GET: ({ params }) => handleGetAnswerThreadRequest(params.threadId),
      DELETE: ({ request, params }) => handleDeleteAnswerThreadRequest(request, params.threadId),
    },
  },
})

export async function handleGetAnswerThreadRequest(threadId: string): Promise<Response> {
  try {
    const projection = await getPublicThreadProjection(threadId)
    if (projection === null) {
      return jsonResponse({ error: 'thread_not_found' }, { status: 404 })
    }
    return jsonResponse(projection)
  } catch {
    return jsonResponse({ error: 'thread_unavailable' }, { status: 503 })
  }
}

export async function handleDeleteAnswerThreadRequest(request: Request, threadId: string): Promise<Response> {
  const { sessionId, setCookie } = resolveOrCreateSessionId(request)

  try {
    await deleteAnswerThread({
      threadId,
      pseudonymousSessionId: sessionId,
      sourceWriteRequest: request,
    })
    const response = jsonResponse({ threadId, deleted: true })
    return appendSessionCookie(response, sessionId, setCookie, request)
  } catch {
    return jsonResponse({ threadId, deleted: false }, { status: 404 })
  }
}
