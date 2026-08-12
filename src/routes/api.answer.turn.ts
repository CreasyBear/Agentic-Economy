import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'

import { createFileRoute } from '@tanstack/react-router'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { answerTurnSourceErrorResponse } from '@/lib/server/answer-source-error'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { assertHttpAdmission, requestAdmissionKey, type RateLimitAdmission, type RateLimitResult } from '@/lib/server/rate-limit'

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
  type AnswerOperationInvokeContext,
} from '@/modules/answer-thread/public'
import {
  authenticateOperationGateway,
  createOperationInvokeService,
  type OperationInvokeHandlerOptions,
} from '@/lib/server/operation-invoke-api'
import { runWithRequestCorrelation } from '@/lib/server/request-correlation'
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
  authenticate?: OperationInvokeHandlerOptions['authenticate']
  operationInvokeService?: OperationInvokeHandlerOptions['operationInvokeService']
}>

export async function handleAnswerTurnRequest(
  request: Request,
  options: AnswerTurnHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const { sessionId, setCookie } = resolveOrCreateSessionId(request)

    if (!request.headers.get('content-type')?.includes('application/json')) {
      return problem(buildAnswerTurnProblem('invalid_content_type'))
    }
    const boundedBody = await readBoundedRequestText(request, MAX_ANSWER_TURN_BODY_BYTES)
    if (!boundedBody.ok) {
      return problem(buildAnswerTurnProblem('payload_too_large'))
    }

    let rawBody: unknown
    try {
      rawBody = JSON.parse(boundedBody.text) as unknown
    } catch {
      return problem(buildAnswerTurnProblem('invalid_body'))
    }
    const parsed = answerTurnRequestSchema.safeParse(rawBody)
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
    let operationInvokeContext: AnswerOperationInvokeContext | undefined
    if (request.headers.has('authorization')) {
      const authenticated = await authenticateOperationGateway(request, correlationId, {
        ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
        ...(options.operationInvokeService === undefined ? {} : { operationInvokeService: options.operationInvokeService }),
      }, boundedBody.text)
      if (authenticated instanceof Response) return authenticated
      operationInvokeContext = {
        principal: authenticated.principal,
        correlationId,
        service: options.operationInvokeService ?? createOperationInvokeService(request, boundedBody.text),
      }
    }

  // Static import would pull Node-only answer execution into the client route graph.
  const {
    answerTurnRequestDigest,
    answerTurnReservationKey,
    finalizeReservedAnswerTurnError,
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
      sourceWriteBody: boundedBody.text,
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
            ...(parsed.data.searchContext === undefined ? {} : { searchContext: parsed.data.searchContext }),
            requestDigest,
            admission: reservation,
            signal: request.signal,
            sourceWriteRequest: request,
            sourceWriteBody: boundedBody.text,
            ...(operationInvokeContext === undefined ? {} : { operationInvokeContext }),
          },
          send,
        )
      } catch (error) {
        if (request.signal.aborted || isAbortError(error) || terminalSent) {
          return
        }
        const finalized = await finalizeReservedAnswerTurnError({
          request,
          sourceWriteBody: boundedBody.text,
          admission: reservation,
          sessionId,
          requestDigest,
          query: parsed.data.query,
          ...(parsed.data.searchContext === undefined
            ? {}
            : { searchContext: parsed.data.searchContext }),
          isNewThread: parsed.data.threadId === undefined,
        })
        send(
          finalized.kind === 'error'
            ? { seq: nextFrameSeq, event: { type: 'error', problem: finalized.problem } }
            : finalized.kind === 'stopped'
              ? { seq: nextFrameSeq, event: { type: 'stopped' } }
              : {
                  seq: nextFrameSeq,
                  event: {
                    type: 'error',
                    problem: buildAnswerTurnProblem('answer_turn_persist_failed'),
                  },
                },
        )
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
})
}



