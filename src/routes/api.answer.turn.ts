import { createFileRoute } from '@tanstack/react-router'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { jsonError } from '@/lib/server/json-error'
import { createPrefixedRandomId } from '@/modules/common/random-id'
import { assertHttpAdmission, requestAdmissionKey, type RateLimitAdmission } from '@/lib/server/rate-limit'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'

import {
  ANSWER_TURN_DATA_PART,
  isAbortError,
  type AnswerTurnFrame,
  type AnswerTurnUIMessage,
} from '@/modules/answer/public'
import {
  answerTurnRequestSchema,
  appendSessionCookie,
  assertAnswerTurnAccess,
  classifyFollowUpIntent,
  claimAnswerTurnIdempotency,
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

const MAX_ANSWER_TURN_BODY_BYTES = 16 * 1024
const admitAnswerTurn: RateLimitAdmission = ({ request, key, keySuffix }) =>
  assertHttpAdmission(request, 'answer-turn-submit', {
    ...(key === undefined ? {} : { key }),
    ...(keySuffix === undefined ? {} : { keySuffix }),
  })

type AnswerTurnHandlerOptions = Readonly<{
  admit?: RateLimitAdmission
  stream?: typeof streamAnswerTurn
}>

export async function handleAnswerTurnRequest(
  request: Request,
  options: AnswerTurnHandlerOptions = {},
): Promise<Response> {
  const { sessionId, setCookie } = resolveOrCreateSessionId(request)

  const boundedBody = await readBoundedRequestJson(request, MAX_ANSWER_TURN_BODY_BYTES)
  if (!boundedBody.ok) {
    return jsonError(boundedBody.code === 'payload_too_large' ? 'payload_too_large' : 'invalid_body', boundedBody.code === 'payload_too_large' ? 413 : 400)
  }

  const parsed = answerTurnRequestSchema.safeParse(boundedBody.value)
  if (!parsed.success) {
    return jsonError('invalid_body', 400)
  }

  const clientTurnKey = request.headers.get('x-ae-turn-key')?.trim()

  if (clientTurnKey === undefined || clientTurnKey.length === 0 || claimAnswerTurnIdempotency(sessionId, clientTurnKey)) {
    const admission = await (options.admit ?? admitAnswerTurn)({
      request,
      key: requestAdmissionKey(request),
    })
    if (!admission.ok) {
      return jsonError('rate_limited', 429, Date.now() + admission.retryAfter)
    }
  }

  let threadId = parsed.data.threadId
  const historyIndependent = classifyFollowUpIntent(parsed.data.query, threadId === undefined ? 0 : 1) === 'explain_boundary'
  let accessContext = historyIndependent
    ? {
        access: await assertAnswerTurnAccess({
          sessionId,
          ...(threadId === undefined ? {} : { threadId }),
        }),
        priorTurns: [],
      }
    : await readAnswerTurnAccessContext({
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

  const stream = createUIMessageStream<AnswerTurnUIMessage>({
    execute: async ({ writer }) => {
      const send = (frame: AnswerTurnFrame) => {
        if (request.signal.aborted) {
          return
        }
        writer.write({ type: ANSWER_TURN_DATA_PART, data: frame, transient: true })
      }

      try {
        await (options.stream ?? streamAnswerTurn)(
          {
            sessionId,
            query: parsed.data.query,
            ...(threadId === undefined ? {} : { threadId }),
            ...(parsed.data.searchContext === undefined ? {} : { searchContext: parsed.data.searchContext }),
            precheckedAccess: access,
            ...(preloadedPriorTurns === undefined ? {} : { preloadedPriorTurns }),
            signal: request.signal,
            sourceWriteRequest: request,
          },
          send,
        )
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
    // A turn that fails after the stream opened has already sent its own typed
    // error frame; this only guards a throw the frame path could not catch.
    onError: () => 'answer_turn_failed',
  })

  const response = createUIMessageStreamResponse({
    stream,
    headers: { 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  })
  return appendSessionCookie(response, sessionId, setCookie, request)
}


function makeCopyId(): string {
  return createPrefixedRandomId(`turn-${Date.now().toString(36)}-`)
}
