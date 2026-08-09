import { createFileRoute } from '@tanstack/react-router'

import { jsonResponse } from './api.businesses'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import {
  appendSessionCookie,
  deleteAnswerThread,
  getOwnedThreadProjection,
  readAnswerSessionId,
  resolveOrCreateSessionId,
} from '@/modules/answer-thread/public'

export const Route = createFileRoute('/api/answer/threads/$threadId')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleGetAnswerThreadRequest(request, params.threadId),
      DELETE: ({ request, params }) => handleDeleteAnswerThreadRequest(request, params.threadId),
      POST: () => methodNotAllowed(['GET', 'DELETE']),
      PUT: () => methodNotAllowed(['GET', 'DELETE']),
      PATCH: () => methodNotAllowed(['GET', 'DELETE']),
      HEAD: () => methodNotAllowed(['GET', 'DELETE']),
      OPTIONS: () => methodNotAllowed(['GET', 'DELETE']),
      TRACE: () => methodNotAllowed(['GET', 'DELETE']),
      CONNECT: () => methodNotAllowed(['GET', 'DELETE']),
      ANY: () => methodNotAllowed(['GET', 'DELETE']),
    },
  },
})

export async function handleGetAnswerThreadRequest(request: Request, threadId: string): Promise<Response> {
  const pseudonymousSessionId = readAnswerSessionId(request)
  if (pseudonymousSessionId === undefined) {
    return problem({ kind: 'NOT_FOUND', code: 'thread_not_found' })
  }

  try {
    const projection = await getOwnedThreadProjection(threadId, pseudonymousSessionId)
    if (projection === null) {
      return problem({ kind: 'NOT_FOUND', code: 'thread_not_found' })
    }
    return jsonResponse(projection)
  } catch (error) {
    return answerThreadFailure(error)
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
  } catch (error) {
    return answerThreadFailure(error)
  }

}

function answerThreadFailure(error: unknown): Response {
  const message = error instanceof Error ? error.message : ''
  if (/(?:^|[\s:])thread_(?:not_found|forbidden)(?:$|[\s:])/.test(message)) {
    return problem({ kind: 'NOT_FOUND', code: 'thread_not_found' })
  }
  return problem({ kind: 'UNAVAILABLE', code: 'unavailable', retryable: true })
}
