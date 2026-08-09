import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { buildAnswerTurnProblem } from '@/lib/errors'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { answerTurnSourceErrorResponse } from '@/lib/server/answer-source-error'
import { readAnswerSessionId } from '@/modules/answer-thread/public'
import { jsonResponse } from './api.businesses'

const MAX_STOP_ANSWER_TURN_BODY_BYTES = 4 * 1024
const stopAnswerTurnRequestSchema = z.strictObject({
  threadId: z.string().min(1).max(160),
  turnId: z.string().min(1).max(160),
})

export const Route = createFileRoute('/api/answer/turn/stop')({
  server: {
    handlers: {
      POST: ({ request }) => handleStopAnswerTurnRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

export async function handleStopAnswerTurnRequest(request: Request): Promise<Response> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type' })
  }

  const boundedBody = await readBoundedRequestJson(request, MAX_STOP_ANSWER_TURN_BODY_BYTES)
  if (!boundedBody.ok) {
    return problem({
      status: boundedBody.code === 'payload_too_large' ? 413 : 400,
      kind: boundedBody.code === 'payload_too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
      code: boundedBody.code,
    })
  }
  const parsed = stopAnswerTurnRequestSchema.safeParse(boundedBody.value)
  if (!parsed.success) {
    return problem({ kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
  }

  const sessionId = readAnswerSessionId(request)
  if (sessionId === undefined) {
    return problem({ kind: 'NOT_FOUND', code: 'thread_not_found' })
  }

  try {
    // Static import would pull Node-only answer execution into the client route graph.
    const { stopAnswerTurn } = await import('@/modules/answer-thread/server')
    const result = await stopAnswerTurn({
      sessionId,
      threadId: parsed.data.threadId,
      turnId: parsed.data.turnId,
      sourceWriteRequest: request,
    })
    return result.kind === 'not_found'
      ? problem({ kind: 'NOT_FOUND', code: 'thread_not_found' })
      : jsonResponse(result)
  } catch (error) {
    const sourceError = answerTurnSourceErrorResponse(error)
    if (sourceError !== undefined) return sourceError
    return problem(buildAnswerTurnProblem('unavailable'))
  }
}
