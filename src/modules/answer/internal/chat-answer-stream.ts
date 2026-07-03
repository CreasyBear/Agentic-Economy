import type { AnswerEvent, AnswerSynthesizerInput } from '../answer-synthesizer'

export type ChatAnswerStreamInput = AnswerSynthesizerInput & {
  /** Kept for callers that still pass it; the chat path no longer branches on it. */
  forceGated?: boolean
}

/**
 * Phase 7 collapsed the answer path onto the LLM tool-use agent. The legacy
 * `/api/chat` endpoint (dev-only, gated behind `AE_ALLOW_CHAT_API`) no longer
 * has a deterministic or gated-LLM prose path to fall back on; without the
 * tool-use agent it emits a single safe `chat_unavailable` error so no
 * fabricated prose ships. The live answer surface is `POST /api/answer/turn`.
 */
export async function* synthesizeChatAnswer(
  _input: ChatAnswerStreamInput,
): AsyncIterable<AnswerEvent> {
  yield { type: 'error', code: 'chat_unavailable', copyId: makeCopyId() }
}

type ChatMessagePart = { type?: string; text?: string }
type ChatMessage = {
  role?: string
  content?: string | readonly ChatMessagePart[]
  parts?: readonly ChatMessagePart[]
}

export function extractQueryFromChatBody(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') {
    return undefined
  }

  const record = body as Record<string, unknown>
  if (typeof record.query === 'string') {
    const trimmed = record.query.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  const messages = record.messages
  if (!Array.isArray(messages)) {
    return undefined
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as ChatMessage
    if (message.role !== 'user') {
      continue
    }
    const text = readMessageText(message)
    if (text !== undefined && text.length > 0) {
      return text
    }
  }

  return undefined
}

export function extractModelFromChatBody(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') {
    return undefined
  }

  const record = body as Record<string, unknown>
  if (typeof record.model === 'string' && record.model.trim().length > 0) {
    return record.model.trim()
  }

  const forwardedProps = record.forwardedProps
  if (forwardedProps !== null && typeof forwardedProps === 'object') {
    const model = (forwardedProps as Record<string, unknown>).model
    if (typeof model === 'string' && model.trim().length > 0) {
      return model.trim()
    }
  }

  return undefined
}

function readMessageText(message: ChatMessage): string | undefined {
  if (typeof message.content === 'string') {
    return message.content.trim()
  }

  const parts =
    message.parts ??
    (Array.isArray(message.content) ? message.content : undefined)
  if (parts === undefined) {
    return undefined
  }

  let text = ''
  for (const part of parts) {
    if (part.type === undefined || part.type === 'text') {
      text += part.text ?? ''
    }
  }
  text = text.trim()

  return text.length > 0 ? text : undefined
}

function makeCopyId(): string {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
