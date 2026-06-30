import { createFileRoute } from '@tanstack/react-router'

import { jsonResponse } from './api.businesses'
import { getPublicThreadProjection } from '@/modules/answer-thread/public'

export const Route = createFileRoute('/api/answer/threads/$threadId')({
  server: {
    handlers: {
      GET: ({ params }) => handleGetAnswerThreadRequest(params.threadId),
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
