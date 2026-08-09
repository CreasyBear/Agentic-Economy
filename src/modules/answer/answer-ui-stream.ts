import { isAbortError, parseJsonEventStream } from '@ai-sdk/provider-utils'
import type { UIMessage } from 'ai'
import { z } from 'zod'

import { parseAnswerTurnProblemStrict } from '@/lib/errors'

import { AnswerTurnFrameSchema } from './answer-event-schema'
import type { AnswerEvent } from './answer-synthesizer'

/**
 * Re-exported so route handlers reach abort detection through this seam rather
 * than importing a provider SDK directly (`route-future-provider-import`).
 */
export { isAbortError }

export type AnswerTurnProtocolErrorCode = 'malformed_sse' | 'missing_stream'

/** A malformed or empty answer stream is a protocol failure, not a user error. */
export class AnswerTurnProtocolError extends Error {
  readonly code: AnswerTurnProtocolErrorCode

  constructor(code: AnswerTurnProtocolErrorCode) {
    super(code === 'missing_stream' ? 'The answer stream contained no answer frames.' : 'The answer stream was malformed.')
    this.name = 'AnswerTurnProtocolError'
    this.code = code
  }
}

/**
 * The answer turn rides the AI SDK UI message stream. AE's turn events are not
 * model text, so they travel as a single named data part rather than as text or
 * tool parts, and they are `transient`: the client renders them as they arrive
 * and the durable turn record — not the wire — is the replay source.
 *
 * Framing, SSE headers, the terminating sentinel, and client parsing all belong
 * to the SDK (`createUIMessageStream` / `createUIMessageStreamResponse` /
 * `parseJsonEventStream`). Only the payload below is AE's.
 */
export const ANSWER_TURN_DATA_PART = 'data-answer-event' as const

export type AnswerTurnFrame = Readonly<{ seq: number; event: AnswerEvent }>

export type AnswerTurnDataParts = Readonly<{ 'answer-event': AnswerTurnFrame }>

export type AnswerTurnUIMessage = UIMessage<never, AnswerTurnDataParts>

/**
 * The event union is a discriminated TypeScript contract owned by
 * `answer-synthesizer`; its runtime schema lives beside the domain payload
 * schemas and rejects unknown variants before they reach the reducer.
 */
const answerTurnFrameSchema = AnswerTurnFrameSchema

const answerTurnChunkSchema = z.object({
  type: z.string(),
  data: answerTurnFrameSchema.optional(),
})

/**
 * Reads an answer-turn response body as AE turn frames. SDK lifecycle chunks
 * are ignored, but malformed AE chunks fail closed as protocol errors.
 */
export async function* readAnswerTurnFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AnswerTurnFrame> {
  const chunks = parseJsonEventStream({ stream: body, schema: answerTurnChunkSchema })
  let sawFrame = false
  let expectedSeq = 0
  let terminalSeen = false
  for await (const chunk of chunks) {
    if (!chunk.success) throw new AnswerTurnProtocolError('malformed_sse')
    if (chunk.value.type !== ANSWER_TURN_DATA_PART) continue
    const frame = chunk.value.data
    if (frame === undefined || terminalSeen || frame.seq !== expectedSeq) {
      throw new AnswerTurnProtocolError('malformed_sse')
    }
    expectedSeq += 1
    let normalizedFrame = frame
    if (frame.event.type === 'error') {
      const problem = parseAnswerTurnProblemStrict(frame.event.problem)
      if (problem === undefined) throw new AnswerTurnProtocolError('malformed_sse')
      normalizedFrame = { ...frame, event: { type: 'error', problem } }
    }
    terminalSeen = frame.event.type === 'complete'
      || frame.event.type === 'pending'
      || frame.event.type === 'stopped'
      || frame.event.type === 'error'
    sawFrame = true
    yield normalizedFrame
  }
  if (!sawFrame) throw new AnswerTurnProtocolError('missing_stream')
  if (!terminalSeen) throw new AnswerTurnProtocolError('malformed_sse')
}
