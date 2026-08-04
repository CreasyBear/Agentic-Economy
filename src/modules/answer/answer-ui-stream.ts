import { isAbortError, parseJsonEventStream } from '@ai-sdk/provider-utils'
import type { UIMessage } from 'ai'
import { z } from 'zod'

import { isRecord } from '@/modules/common/is-record'

type AnswerEvent = import('./answer-synthesizer').AnswerEvent

/**
 * Re-exported so route handlers reach abort detection through this seam rather
 * than importing a provider SDK directly (`route-future-provider-import`).
 */
export { isAbortError }

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
 * `answer-synthesizer`. Re-declaring it as a Zod mirror would be a second
 * source of truth that silently drifts, so the wire check is structural and the
 * reducer stays the authority on each variant.
 */
const answerEventSchema = z.custom<AnswerEvent>(
  (value) => isRecord(value) && typeof value.type === 'string',
)

const answerTurnFrameSchema = z.object({
  seq: z.number().int().nonnegative(),
  event: answerEventSchema,
})

const answerTurnChunkSchema = z.object({
  type: z.string(),
  data: answerTurnFrameSchema.optional(),
})

/**
 * Reads an answer-turn response body as AE turn frames, skipping the SDK's
 * lifecycle chunks (`start`, `finish`, `abort`) and any malformed frame.
 */
export async function* readAnswerTurnFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AnswerTurnFrame> {
  const chunks = parseJsonEventStream({ stream: body, schema: answerTurnChunkSchema })
  for await (const chunk of chunks) {
    if (!chunk.success) continue
    if (chunk.value.type !== ANSWER_TURN_DATA_PART) continue
    const frame = chunk.value.data
    if (frame === undefined) continue
    yield frame
  }
}
