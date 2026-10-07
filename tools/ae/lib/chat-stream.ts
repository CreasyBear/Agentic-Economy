import { parseJsonEventStream } from 'ai'
import { z } from 'zod'
import { projectJourneyProblem, statusRefSchema, validateJourneyNext, type JourneyNext, type TurnRef, type WorkState } from '@/modules/actions/contract'
import { CliFailure } from './output'

type ChatWorkState = Exclude<WorkState, 'outcome-unknown'>

const chunkSchema = z.object({ type: z.string() }).passthrough()
const states: Record<Exclude<WorkState, 'outcome-unknown'>, true> = { submitted: true, working: true, 'input-required': true, 'auth-required': true, completed: true, failed: true, canceled: true, rejected: true }
const terminal: Partial<Record<Exclude<WorkState, 'outcome-unknown'>, true>> = { completed: true, failed: true, canceled: true, rejected: true }
const turnRefPattern = /^turn_[0-9a-f-]{36}$/u
const toolNamePattern = /^[a-z][a-z0-9_.-]{0,80}$/u

function boundedPayload(value: unknown, origin: string): unknown {
  const safe = value && typeof value === 'object' && !Array.isArray(value) && 'next' in value
    ? { ...value, next: validateJourneyNext(value.next, { origin }) } : value
  const serialized = JSON.stringify(safe)
  return serialized === undefined || Buffer.byteLength(serialized, 'utf8') > 4_096
    ? { truncated: true } : safe
}

type ChatEvent = Readonly<Record<string, unknown> & { type: string }>
type Emit = (event: ChatEvent) => void

type StreamIdentity = { turnRef: string; threadId: string; state: ChatWorkState }

/** Consume the SDK SSE parser; only validated AE parts become public CLI events. */
export async function consumeChatStream(
  response: Response,
  origin: string,
  emit: Emit,
  onStart: (identity: StreamIdentity) => void,
): Promise<number> {
  if (!response.body || response.headers.get('x-vercel-ai-ui-message-stream') !== 'v1') {
    throw new CliFailure('Chat response was not an AI SDK UI message stream.', { kind: 'UNAVAILABLE', code: 'invalid_chat_stream' })
  }
  let identity: StreamIdentity | undefined
  let previousState: ChatWorkState | undefined
  let finalProblem = false
  let previousSequence = -1
  let seenStart = false
  const toolNames = new Map<string, string>()
  for await (const result of parseJsonEventStream({ stream: response.body, schema: chunkSchema })) {
    if (!result.success) throw new CliFailure('Chat stream contained an invalid part.', { kind: 'UNAVAILABLE', code: 'invalid_chat_stream' })
    const part = result.value
    if (identity === undefined && part.type !== 'data-ae-state') {
      throw new CliFailure('Chat stream omitted its initial turn state.', { kind: 'UNAVAILABLE', code: 'invalid_chat_stream' })
    }
    if (part.type === 'data-ae-state') {
      const data = part.data
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CliFailure('Invalid turn state.', { kind: 'UNAVAILABLE', code: 'invalid_chat_state' })
      const event = data as Record<string, unknown>
      if (event.kind !== 'turn' || typeof event.turnRef !== 'string' || !turnRefPattern.test(event.turnRef) ||
        typeof event.contextId !== 'string' || event.contextId.length === 0 || !states[event.state as ChatWorkState] ||
        typeof event.sequence !== 'number' || !Number.isSafeInteger(event.sequence) || event.sequence <= previousSequence) {
        throw new CliFailure('Invalid turn identity or sequence.', { kind: 'UNAVAILABLE', code: 'invalid_chat_state' })
      }
      if (identity && (identity.turnRef !== event.turnRef || identity.threadId !== event.contextId)) {
        throw new CliFailure('Chat stream changed turn identity.', { kind: 'UNAVAILABLE', code: 'invalid_chat_state' })
      }
      previousSequence = event.sequence
      previousState = event.state as ChatWorkState
      identity = { turnRef: event.turnRef, threadId: event.contextId, state: previousState }
      if (!seenStart) {
        onStart(identity)
        emit({ type: 'start', turnRef: identity.turnRef, threadId: identity.threadId })
        seenStart = true
      } else {
        emit({ type: 'state', workState: previousState })
      }
      continue
    }
    if (part.type === 'text-delta' && typeof part.delta === 'string') emit({ type: 'text-delta', text: part.delta })
    else if (part.type === 'reasoning-delta' && typeof part.delta === 'string') emit({ type: 'reasoning-summary', text: part.delta })
    else if (part.type === 'tool-input-available' && typeof part.toolCallId === 'string' &&
      typeof part.toolName === 'string' && toolNamePattern.test(part.toolName)) {
      toolNames.set(part.toolCallId, part.toolName)
      emit({ type: 'tool-call', toolName: part.toolName, payload: boundedPayload(part.input, origin) })
    } else if (part.type === 'tool-output-available' && typeof part.toolCallId === 'string') {
      const toolName = toolNames.get(part.toolCallId)
      if (toolName !== undefined) {
        emit({ type: 'tool-result', toolName, payload: boundedPayload(part.output, origin) })
        toolNames.delete(part.toolCallId)
      }
    } else if (part.type === 'data-ae-quote' && part.data && typeof part.data === 'object') {
      const quote = part.data as Record<string, unknown>
      if (typeof quote.quoteRef === 'string' && statusRefSchema.safeParse({ kind: 'quote', ref: quote.quoteRef }).success &&
        typeof quote.maxSpendAud === 'string' && typeof quote.expiresAt === 'number') {
        emit({ type: 'quote', quoteRef: quote.quoteRef, maxSpendAud: quote.maxSpendAud, expiresAt: quote.expiresAt })
      }
    } else if (part.type === 'data-ae-receipt' && part.data && typeof part.data === 'object') {
      const receipt = part.data as Record<string, unknown>
      if (receipt.kind === 'call' && typeof receipt.callRef === 'string' &&
        statusRefSchema.safeParse({ kind: 'call', ref: receipt.callRef }).success &&
        ['not_requested', 'pending', 'paid', 'refunded', 'outcome_unknown'].includes(String(receipt.payment))) {
        emit({ type: 'receipt', callRef: receipt.callRef, payment: receipt.payment,
          ...(typeof receipt.receiptArtifactRef === 'string' ? { receiptArtifactRef: receipt.receiptArtifactRef } : {}) })
      }
    } else if (part.type === 'data-ae-problem') {
      const problem = projectJourneyProblem(part.data, { origin, source: 'remote' })
      emit({ type: 'error', problem })
      finalProblem = true
      break
    }
  }
  if (finalProblem) return 1
  if (!identity || !previousState || !terminal[previousState]) {
    const next: readonly JourneyNext[] = identity
      ? [{ action: 'journey.status', args: { ref: { kind: 'turn', ref: identity.turnRef as TurnRef } }, authority: 'same_principal' }]
      : []
    throw new CliFailure('Chat stream ended before a terminal turn state; inspect the original turn status.', {
      kind: 'UNAVAILABLE', code: 'chat_stream_interrupted', next,
    })
  }
  emit({ type: 'finish', turnRef: identity.turnRef, state: previousState })
  return previousState === 'completed' ? 0 : 1
}
