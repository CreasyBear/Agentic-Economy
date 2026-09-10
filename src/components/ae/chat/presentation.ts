import { isRecord } from '@/modules/common/is-record'
import {
  projectToolCard,
  serializeToolCard,
  type ToolCardProjection,
} from '@/modules/chat/tool-card'

export {
  CHAT_TOOL_IDS,
  projectToolCard,
  type ChatToolId,
  type ToolCardProjection,
  type ToolChoiceRow,
  type ToolFact,
} from '@/modules/chat/tool-card'

export type ChatStatus =
  | ''
  | 'Sending message…'
  | 'Getting a response…'
  | 'Message sent.'
  | 'Response complete.'
  | 'Conversation renamed.'
  | 'Conversation deleted.'
  | 'Read-only share link ready.'
  | 'Share link revoked.'
  | 'New chat ready.'
  | 'Share link copied.'

export type ChatFailurePresentation = Readonly<{
  message: string
  reference?: string
  browseMarket: boolean
}>

class AnonymousChatResponseError extends Error {
  constructor(
    readonly code: string | undefined,
    readonly reference: string | undefined,
  ) {
    super(code ?? 'chat_unavailable')
    this.name = 'AnonymousChatResponseError'
  }
}

function boundedRequestReference(value: string | null): string | undefined {
  const trimmed = value?.trim()
  if (trimmed === undefined || trimmed.length === 0 || /[^\u0020-\u007e]/u.test(trimmed)) {
    return undefined
  }
  return Array.from(trimmed).slice(0, 200).join('')
}

/**
 * Keeps the anonymous HTTP failure code and correlation reference available to
 * the UI instead of letting the AI SDK flatten them into an opaque Error.
 */
export async function fetchAnonymousChat(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await globalThis.fetch(input, init)
  if (response.ok) return response

  let code: string | undefined
  try {
    const body = await response.clone().json() as unknown
    if (isRecord(body) && typeof body.code === 'string') code = body.code
  } catch {
    // The status and request reference still provide a truthful recovery path.
  }
  throw new AnonymousChatResponseError(
    code,
    boundedRequestReference(response.headers.get('x-ae-request-id')),
  )
}
export type TranscriptMessage = Readonly<{
  id: string
  role: 'user' | 'assistant'
  parts: readonly unknown[]
}>

const anonymousHandoffs = new Map<string, readonly TranscriptMessage[]>()
const MAX_ANONYMOUS_HANDOFFS = 20
const MAX_ANONYMOUS_HANDOFF_MESSAGES = 12
const MAX_ANONYMOUS_HANDOFF_BYTES = 16 * 1024
const MAX_ANONYMOUS_HANDOFF_TEXT = 8_000

export function textFromParts(parts: readonly unknown[]): string {
  return parts.flatMap((part) => {
    if (!isRecord(part)) return []
    return part.type === 'text' && typeof part.text === 'string' ? [part.text] : []
  }).join('')
}

export type TranscriptTurn = Readonly<{
  id: string
  role: 'user' | 'assistant'
  text: string
  tools: readonly ToolCardProjection[]
}>

export function projectTranscriptTurns(messages: readonly TranscriptMessage[]): readonly TranscriptTurn[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: textFromParts(message.parts),
    tools: message.parts.flatMap((part) => {
      const card = projectToolCard(part)
      return card === null ? [] : [card]
    }),
  }))
}

export function projectAnonymousTranscript(messages: readonly TranscriptMessage[]) {
  return messages.flatMap((message) => {
    const content = textFromParts(message.parts).trim()
    return content.length === 0 ? [] : [{ role: message.role, content }]
  })
}

export function anonymousRequestSize(messages: readonly TranscriptMessage[]): number {
  return new TextEncoder().encode(JSON.stringify({ messages: projectAnonymousTranscript(messages) })).byteLength
}

function projectAnonymousHandoff(messages: readonly TranscriptMessage[]): readonly TranscriptMessage[] {
  const projected: TranscriptMessage[] = []
  for (const [index, message] of messages.slice(0, MAX_ANONYMOUS_HANDOFF_MESSAGES).entries()) {
    const parts: unknown[] = []
    for (const part of message.parts) {
      if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
        const text = Array.from(part.text).slice(0, MAX_ANONYMOUS_HANDOFF_TEXT).join('')
        if (text.length > 0) parts.push({ type: 'text', text })
        continue
      }
      const card = projectToolCard(part)
      if (card === null) continue
      const stored = serializeToolCard(card)
      if (stored !== null) parts.push(stored)
    }
    if (parts.length === 0) continue
    const projectedMessage: TranscriptMessage = {
      id: `anonymous-handoff-${index}`,
      role: message.role,
      parts,
    }
    const candidate = [...projected, projectedMessage]
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength <= MAX_ANONYMOUS_HANDOFF_BYTES) {
      projected.push(projectedMessage)
    }
  }
  return projected
}

export function rememberAnonymousChatHandoff(
  threadId: string,
  messages: readonly TranscriptMessage[],
): void {
  const projected = projectAnonymousHandoff(messages)
  if (projected.length === 0) return
  if (anonymousHandoffs.size >= MAX_ANONYMOUS_HANDOFFS) {
    const oldestThreadId = anonymousHandoffs.keys().next().value as string | undefined
    if (oldestThreadId !== undefined) anonymousHandoffs.delete(oldestThreadId)
  }
  anonymousHandoffs.set(threadId, projected)
}

export function readAnonymousChatHandoff(threadId: string): readonly TranscriptMessage[] {
  return anonymousHandoffs.get(threadId) ?? []
}

export function clearAnonymousChatHandoff(threadId: string): void {
  anonymousHandoffs.delete(threadId)
}

export function projectChatFailure(error: unknown): ChatFailurePresentation {
  if (error instanceof AnonymousChatResponseError) {
    if (error.code === 'rate_limited') {
      return {
        message: 'You’ve reached the chat limit. Try again later.',
        ...(error.reference === undefined ? {} : { reference: error.reference }),
        browseMarket: true,
      }
    }
    return {
      message: 'Chat is unavailable right now. Your message was not added.',
      ...(error.reference === undefined ? {} : { reference: error.reference }),
      browseMarket: true,
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('rate_limited')) {
    return { message: 'You’ve reached the chat limit. Try again later.', browseMarket: false }
  }
  if (message.includes('thread_busy')) {
    return {
      message: 'This conversation is already responding. Wait a moment and try again.',
      browseMarket: false,
    }
  }
  return { message: 'Chat is temporarily unavailable. Try again shortly.', browseMarket: false }
}

export function friendlyChatError(error: unknown): string {
  return projectChatFailure(error).message
}
