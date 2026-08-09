import { createFileRoute } from '@tanstack/react-router'

import { jsonResponse } from './api.businesses'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import {
  issueAnswerThreadShare,
  readAnswerSessionId,
  revokeAnswerThreadShare,
} from '@/modules/answer-thread/public'

export const Route = createFileRoute('/api/answer/threads/$threadId/share')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleIssueAnswerThreadShareRequest(request, params.threadId),
      DELETE: ({ request, params }) => handleRevokeAnswerThreadShareRequest(request, params.threadId),
      GET: () => methodNotAllowed(['POST', 'DELETE']),
      PUT: () => methodNotAllowed(['POST', 'DELETE']),
      PATCH: () => methodNotAllowed(['POST', 'DELETE']),
      HEAD: () => methodNotAllowed(['POST', 'DELETE']),
      OPTIONS: () => methodNotAllowed(['POST', 'DELETE']),
      TRACE: () => methodNotAllowed(['POST', 'DELETE']),
      CONNECT: () => methodNotAllowed(['POST', 'DELETE']),
      ANY: () => methodNotAllowed(['POST', 'DELETE']),
    },
  },
})

export async function handleIssueAnswerThreadShareRequest(request: Request, threadId: string): Promise<Response> {
  const pseudonymousSessionId = readAnswerSessionId(request)
  if (pseudonymousSessionId === undefined) {
    return problem({ kind: 'NOT_FOUND', code: 'thread_not_found' })
  }

  try {
    const result = await issueAnswerThreadShare({
      threadId,
      pseudonymousSessionId,
      sourceWriteRequest: request,
    })
    return jsonResponse({ sharePath: `/s/${result.shareToken}` })
  } catch (error) {
    return answerShareFailure(error)
  }
}

export async function handleRevokeAnswerThreadShareRequest(request: Request, threadId: string): Promise<Response> {
  const pseudonymousSessionId = readAnswerSessionId(request)
  if (pseudonymousSessionId === undefined) {
    return problem({ kind: 'NOT_FOUND', code: 'thread_not_found' })
  }

  try {
    const result = await revokeAnswerThreadShare({
      threadId,
      pseudonymousSessionId,
      sourceWriteRequest: request,
    })
    return jsonResponse({ threadId: result.threadId, revoked: result.revoked })
  } catch (error) {
    return answerShareFailure(error)
  }
}

function answerShareFailure(error: unknown): Response {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('AE_ANSWER_THREAD_SHARE_SECRET') || message.includes('answer_thread_share_keyring_invalid')) {
    return problem({ kind: 'UNAVAILABLE', code: 'missing_share_secret', retryable: false })
  }
  if (/(?:^|[\s:])thread_(?:not_found|forbidden)(?:$|[\s:])/.test(message)) {
    return problem({ kind: 'NOT_FOUND', code: 'thread_not_found' })
  }
  return problem({ kind: 'UNAVAILABLE', code: 'unavailable', retryable: true })
}
