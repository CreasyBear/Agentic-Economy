import type { UIMessage } from 'ai'
import type { TranscriptMessage } from '../presentation'
import { projectAnonymousTranscript } from '../presentation'

const ACTIVE_SESSION_KEY = 'ae.chat.anonymous.active'
const SESSION_PREFIX = 'ae.chat.anonymous.'
const MAX_MESSAGES = 12
const MAX_BYTES = 16 * 1024
const MAX_TEXT = 8_000
const SECRET = /\b(?:bearer\s+\S+|(?:api[_ -]?key|token|password|secret)\s*[:=]\s*\S+|sk-[A-Za-z0-9_-]{10,})/giu
const encoder = new TextEncoder()

const MAX_PROMPT_CHARACTERS = 2_000

export function unicodeLength(value: string): number {
  return Array.from(value).length
}

export function boundPrompt(value: string): string {
  return Array.from(value).slice(0, MAX_PROMPT_CHARACTERS).join('')
}

export function toTransportMessages(messages: readonly TranscriptMessage[]): UIMessage[] {
  return projectAnonymousTranscript(messages).map((message, index) => ({
    id: `anonymous-transport-${index}`,
    role: message.role,
    parts: [{ type: 'text', text: message.content }],
  }))
}

export function messageId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}

export function assistantTurnStarted(messages: readonly TranscriptMessage[]): boolean {
  const last = messages.at(-1)
  if (last?.role !== 'assistant') return false
  return last.parts.some((part) => {
    if (typeof part !== 'object' || part === null || !('type' in part)) return false
    const type = part.type
    return type === 'text' || (typeof type === 'string' && type.startsWith('tool-'))
  })
}

export type AnonymousSession = Readonly<{ id: string; messages: TranscriptMessage[] }>
/** Browser storage is incidental to the in-memory conversation, including when its getter is denied. */
export function anonymousSessionStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch (cause) {
    if (!(cause instanceof DOMException)) throw cause
    return null
  }
}

export function readAnonymousSession(storage: Storage | null): AnonymousSession {
  let id: string | null = null
  try {
    id = storage?.getItem(ACTIVE_SESSION_KEY) ?? null
  } catch (cause) {
    if (!(cause instanceof DOMException)) throw cause
  }
  if (id !== null && /^[0-9a-f-]{36}$/iu.test(id)) {
    let serialized: string | null = null
    try {
      serialized = storage?.getItem(`${SESSION_PREFIX}${id}`) ?? null
    } catch (cause) {
      if (!(cause instanceof DOMException)) throw cause
    }
    if (serialized !== null && encoder.encode(serialized).byteLength <= MAX_BYTES) {
      try {
        const parsed: unknown = JSON.parse(serialized)
        if (Array.isArray(parsed) && parsed.length <= MAX_MESSAGES && parsed.every(message =>
          typeof message === 'object' && message !== null
          && (message.role === 'user' || message.role === 'assistant')
          && typeof message.content === 'string' && message.content.length <= MAX_TEXT
        )) {
          return {
            id,
            messages: parsed.map((message: { role: 'user' | 'assistant'; content: string }, index) => ({
              id: `anonymous-restored-${index}`,
              role: message.role,
              parts: [{ type: 'text', text: message.content }],
            })),
          }
        }
      } catch (error: unknown) {
        if (!(error instanceof SyntaxError)) throw error
        // A corrupt tab transcript is not conversation history.
      }
    }
  }
  return { id: crypto.randomUUID(), messages: [] }
}

export function saveAnonymousSession(storage: Storage | null, session: AnonymousSession): void {
  if (storage === null) return
  const messages = projectAnonymousTranscript(session.messages).slice(-MAX_MESSAGES).map(message => ({
    role: message.role,
    content: Array.from(message.content).slice(0, MAX_TEXT).join('').replace(SECRET, '[redacted]'),
  }))
  let serialized = JSON.stringify(messages)
  while (encoder.encode(serialized).byteLength > MAX_BYTES && messages.length > 0) {
    messages.shift()
    serialized = JSON.stringify(messages)
  }
  try {
    storage.setItem(`${SESSION_PREFIX}${session.id}`, serialized)
    storage.setItem(ACTIVE_SESSION_KEY, session.id)
  } catch (cause) {
    if (!(cause instanceof DOMException)) throw cause
  }
}

export function clearAnonymousSession(storage: Storage | null, id: string): void {
  if (storage === null) return
  try {
    storage.removeItem(`${SESSION_PREFIX}${id}`)
    if (storage.getItem(ACTIVE_SESSION_KEY) === id) storage.removeItem(ACTIVE_SESSION_KEY)
  } catch (cause) {
    if (!(cause instanceof DOMException)) throw cause
  }
}
