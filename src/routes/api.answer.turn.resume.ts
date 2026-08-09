import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'

import {
  ANSWER_TURN_DATA_PART,
  buildAnswerTurnProblem,
  isAbortError,
  type AnswerTurnFrame,
  type AnswerTurnUIMessage,
} from '@/modules/answer/public'
import { AeSearchContextSchema, type AeSearchContext } from '@/modules/answer/search-context'
import type { AnswerTurnReservationResult } from '@/modules/answer-thread/server'
import type { AnswerTurnReservationRecord } from '@/modules/answer-thread/answer-thread.schema'
import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { answerTurnSourceErrorResponse } from '@/lib/server/answer-source-error'
import { readAnswerSessionId } from '@/modules/answer-thread/public'

const MAX_ANSWER_TURN_RESUME_BODY_BYTES = 16 * 1024
const answerTurnResumeRequestSchema = z.strictObject({
  reservationKey: z.string().min(1).max(256),
  requestDigest: z.string().min(1).max(256),
  threadId: z.string().min(1).max(160),
  turnId: z.string().min(1).max(160),
  turnSeq: z.number().int().nonnegative().max(100_000),
  generation: z.number().int().nonnegative().max(100_000),
})

type AnswerTurnResumeRequest = z.infer<typeof answerTurnResumeRequestSchema>

export const Route = createFileRoute('/api/answer/turn/resume')({
  server: {
    handlers: {
      POST: ({ request }) => handleAnswerTurnResumeRequest(request),
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

export async function handleAnswerTurnResumeRequest(request: Request): Promise<Response> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type' })
  }

  const sessionId = readAnswerSessionId(request)
  if (sessionId === undefined) {
    return problem({ kind: 'NOT_FOUND', code: 'thread_not_found' })
  }

  const boundedBody = await readBoundedRequestJson(request, MAX_ANSWER_TURN_RESUME_BODY_BYTES)
  if (!boundedBody.ok) {
    return problem({
      status: boundedBody.code === 'payload_too_large' ? 413 : 400,
      kind: boundedBody.code === 'payload_too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
      code: boundedBody.code,
    })
  }
  const parsed = answerTurnResumeRequestSchema.safeParse(boundedBody.value)
  if (!parsed.success) {
    return problem({ kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
  }

  // Keep the server-only source write and answer execution out of the route graph.
  const {
    acquireAnswerTurnResumeLease,
    streamAnswerTurn,
  } = await import('@/modules/answer-thread/server')
  const body: AnswerTurnResumeRequest = parsed.data
  let lease
  try {
    lease = await acquireAnswerTurnResumeLease({
      reservationKey: body.reservationKey,
      requestDigest: body.requestDigest,
      sessionId,
      threadId: body.threadId,
      turnId: body.turnId,
      turnSeq: body.turnSeq,
      leaseOwner: crypto.randomUUID(),
      mode: 'resume',
      expectedGeneration: body.generation,
      sourceWriteRequest: request,
    })
  } catch (error) {
    const sourceError = answerTurnSourceErrorResponse(error)
    if (sourceError !== undefined) return sourceError
    return problem(buildAnswerTurnProblem('unavailable'))
  }

  if (lease === undefined) {
    return problem(buildAnswerTurnProblem('unavailable'))
  }
  if (lease.kind === 'conflict') {
    const kind = lease.reason === 'reservation_not_found'
      || lease.reason === 'reservation_identity_mismatch'
      ? 'NOT_FOUND'
      : lease.reason === 'generation_mismatch'
        || lease.reason === 'non_resumable'
        ? 'FAILED_PRECONDITION'
        : 'ALREADY_EXISTS'
    return problem({ status: kind === 'NOT_FOUND' ? 404 : 409, kind, code: lease.reason })
  }
  if (lease.kind === 'pending') {
    return problem({ status: 409, kind: 'ALREADY_EXISTS', code: 'lease_active' })
  }
  const state: AnswerTurnReservationRecord['state'] = lease.kind === 'settled'
    ? lease.status === 'stopped' ? 'stopped' : 'finalized'
    : lease.kind === 'acquired' && lease.checkpoint === undefined
      ? 'reserved'
      : 'checkpointed'
  const admission: Extract<AnswerTurnReservationResult, { kind: 'replayed' }> = {
    kind: 'replayed',
    reservationKey: lease.reservationKey,
    threadId: lease.threadId,
    turnId: lease.turnId,
    turnSeq: body.turnSeq,
    state,
    ...(lease.kind === 'settled' && lease.status !== 'stopped'
      ? { finalStatus: lease.status === 'complete' ? 'complete' as const : 'error' as const }
      : {}),
  }

  let searchContext: AeSearchContext | undefined
  if (lease.kind === 'acquired' && lease.searchContextJson !== undefined) {
    try {
      const parsedContext = AeSearchContextSchema.safeParse(JSON.parse(lease.searchContextJson))
      if (parsedContext.success) searchContext = parsedContext.data
    } catch {
      searchContext = undefined
    }
  }

  const stream = createUIMessageStream<AnswerTurnUIMessage>({
    execute: async ({ writer }) => {
      let nextFrameSeq = 0
      let terminalSent = false
      const send = (frame: AnswerTurnFrame) => {
        if (request.signal.aborted) return
        nextFrameSeq = Math.max(nextFrameSeq, frame.seq + 1)
        writer.write({ type: ANSWER_TURN_DATA_PART, data: frame, transient: true })
        terminalSent = frame.event.type === 'complete'
          || frame.event.type === 'pending'
          || frame.event.type === 'stopped'
          || frame.event.type === 'error'
      }
      try {
        await streamAnswerTurn({
          sessionId,
          query: lease.kind === 'acquired' ? lease.query : 'resume',
          threadId: body.threadId,
          requestDigest: body.requestDigest,
          admission,
          ...(searchContext === undefined ? {} : { searchContext }),
          ...(lease.kind === 'acquired'
            ? {
                resume: {
                  ...(lease.checkpoint === undefined ? {} : { checkpoint: lease.checkpoint }),
                  generation: lease.generation,
                  leaseOwner: lease.leaseOwner,
                  leaseExpiresAt: lease.leaseExpiresAt,
                },
              }
            : {}),
          sourceWriteRequest: request,
        }, send)
      } catch (error) {
        if (request.signal.aborted || isAbortError(error) || terminalSent) return
        send({ seq: nextFrameSeq, event: { type: 'error', problem: buildAnswerTurnProblem('answer_turn_failed') } })
      }
    },
    onError: () => 'answer_turn_failed',
  })

  return createUIMessageStreamResponse({
    stream,
    headers: { 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  })
}
