import { createFileRoute } from '@tanstack/react-router'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { answerTurnSourceErrorResponse } from '@/lib/server/answer-source-error'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { assertHttpAdmission, requestAdmissionKey, type RateLimitAdmission, type RateLimitResult } from '@/lib/server/rate-limit'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'

import {
  ANSWER_TURN_DATA_PART,
  buildAnswerTurnProblem,
  isAbortError,
  type AnswerTurnFrame,
  type AnswerTurnUIMessage,
} from '@/modules/answer/public'
import {
  answerTurnRequestSchema,
  appendSessionCookie,
  buildThreadTitle,
  resolveOrCreateSessionId,
} from '@/modules/answer-thread/public'
import type {
  AnswerTurnReservationResult,
  streamAnswerTurn,
} from '@/modules/answer-thread/server'

export const Route = createFileRoute('/api/answer/turn')({
  server: {
    handlers: {
      POST: ({ request }) => handleAnswerTurnRequest(request),
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

const MAX_ANSWER_TURN_BODY_BYTES = 16 * 1024
const MAX_CLIENT_TURN_KEY_LENGTH = 128
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

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return problem(buildAnswerTurnProblem('invalid_content_type'))
  }

  const boundedBody = await readBoundedRequestJson(request, MAX_ANSWER_TURN_BODY_BYTES)
  if (!boundedBody.ok) {
    return problem(buildAnswerTurnProblem(
      boundedBody.code === 'payload_too_large' ? 'payload_too_large' : 'invalid_body',
    ))
  }

  const parsed = answerTurnRequestSchema.safeParse(boundedBody.value)
  if (!parsed.success) {
    return problem(buildAnswerTurnProblem('invalid_body'))
  }

  const clientTurnKey = request.headers.get('x-ae-turn-key')?.trim()
  if (
    clientTurnKey === undefined ||
    clientTurnKey.length === 0 ||
    clientTurnKey.length > MAX_CLIENT_TURN_KEY_LENGTH
  ) {
    return problem(buildAnswerTurnProblem('missing_turn_key'))
  }

  let admission: RateLimitResult
  try {
    admission = await (options.admit ?? admitAnswerTurn)({
      request,
      key: requestAdmissionKey(request),
    })
  } catch (error) {
    const sourceError = answerTurnSourceErrorResponse(error)
    if (sourceError !== undefined) return sourceError
    return problem(buildAnswerTurnProblem('unavailable'))
  }
  if (!admission.ok) {
    return problem(buildAnswerTurnProblem('rate_limited'), {
      'Retry-After': String(Math.max(1, Math.ceil(admission.retryAfter / 1_000))),
    })
  }

  // Static import would pull Node-only answer execution into the client route graph.
  const {
    answerTurnRequestDigest,
    answerTurnReservationKey,
    reserveAnswerTurn,
    streamAnswerTurn: loadStreamAnswerTurn,
  } = await import('@/modules/answer-thread/server')

  const requestDigest = answerTurnRequestDigest({
    ...(parsed.data.threadId === undefined ? {} : { threadId: parsed.data.threadId }),
    query: parsed.data.query,
    ...(parsed.data.searchContext === undefined ? {} : { searchContext: parsed.data.searchContext }),
  })
  const reservationKey = answerTurnReservationKey({
    sessionId,
    threadScope: parsed.data.threadId ?? 'new',
    clientTurnKey,
  })

  let reservation: AnswerTurnReservationResult
  try {
    reservation = await reserveAnswerTurn({
      sessionId,
      ...(parsed.data.threadId === undefined ? {} : { threadId: parsed.data.threadId }),
      query: parsed.data.query,
      ...(parsed.data.searchContext === undefined
        ? {}
        : { searchContextJson: JSON.stringify(parsed.data.searchContext) }),
      requestDigest,
      reservationKey,
      title: buildThreadTitle(parsed.data.query),
      sourceWriteRequest: request,
    })
  } catch (error) {
    const sourceError = answerTurnSourceErrorResponse(error)
    if (sourceError !== undefined) return sourceError
    return problem(buildAnswerTurnProblem('unavailable'))
  }

  if (reservation.kind === 'conflict') {
    return problem(buildAnswerTurnProblem('answer_turn_idempotency_conflict'))
  }
  if (reservation.kind === 'refused') {
    return problem(buildAnswerTurnProblem(reservation.reason))
  }

  const stream = createUIMessageStream<AnswerTurnUIMessage>({
    execute: async ({ writer }) => {
      let nextFrameSeq = 0
      let terminalSent = false
      const send = (frame: AnswerTurnFrame) => {
        if (request.signal.aborted) {
          return
        }
        nextFrameSeq = Math.max(nextFrameSeq, frame.seq + 1)
        writer.write({ type: ANSWER_TURN_DATA_PART, data: frame, transient: true })
        terminalSent = frame.event.type === 'complete'
          || frame.event.type === 'pending'
          || frame.event.type === 'stopped'
          || frame.event.type === 'error'
      }

      try {
        await (options.stream ?? loadStreamAnswerTurn)(
          {
            sessionId,
            query: parsed.data.query,
            ...(parsed.data.threadId === undefined ? {} : { threadId: parsed.data.threadId }),
            requestDigest,
            admission: reservation,
            ...(parsed.data.searchContext === undefined ? {} : { searchContext: parsed.data.searchContext }),
            signal: request.signal,
            sourceWriteRequest: request,
          },
          send,
        )
      } catch (error) {
        if (request.signal.aborted || isAbortError(error) || terminalSent) {
          return
        }
        send({
          seq: nextFrameSeq,
          event: { type: 'error', problem: buildAnswerTurnProblem('answer_turn_failed') },
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



