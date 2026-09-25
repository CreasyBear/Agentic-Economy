export const MAX_ANONYMOUS_CHAT_MESSAGES = 12
export const MAX_ANONYMOUS_CHAT_PROMPT_CHARACTERS = 2_000
export const MAX_ANONYMOUS_CHAT_TRANSCRIPT_BYTES = 16 * 1024

const encoder = new TextEncoder()

export type AnonymousChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

export type AnonymousChatBody = Readonly<{
  messages: readonly AnonymousChatMessage[]
}>

export type AdmissionResult =
  | Readonly<{ ok: true; retryAfter?: number }>
  | Readonly<{ ok: false; retryAfter: number }>

export type AnonymousChatHandlerDependencies = Readonly<{
  proxySecret: string | undefined
  admit: (key: string) => Promise<AdmissionResult>
  stream: (messages: readonly AnonymousChatMessage[], signal: AbortSignal) => Promise<Response>
}>

type ValidationResult =
  | Readonly<{ ok: true; body: AnonymousChatBody }>
  | Readonly<{ ok: false; code: string }>

function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const ownKeys = Object.keys(value)
  return ownKeys.length === keys.length && keys.every((key) => ownKeys.includes(key))
}

export function validateAnonymousChatBody(value: unknown): ValidationResult {
  if (!isExactObject(value, ['messages']) || !Array.isArray(value.messages)) {
    return { ok: false, code: 'invalid_body' }
  }
  if (value.messages.length < 1 || value.messages.length > MAX_ANONYMOUS_CHAT_MESSAGES) {
    return { ok: false, code: 'invalid_messages' }
  }

  const messages: AnonymousChatMessage[] = []
  for (const valueMessage of value.messages) {
    if (!isExactObject(valueMessage, ['role', 'content'])) {
      return { ok: false, code: 'invalid_message' }
    }
    if (
      (valueMessage.role !== 'user' && valueMessage.role !== 'assistant')
      || typeof valueMessage.content !== 'string'
      || valueMessage.content.trim().length === 0
    ) {
      return { ok: false, code: 'invalid_message' }
    }
    messages.push({ role: valueMessage.role, content: valueMessage.content })
  }

  const current = messages.at(-1)
  if (
    current?.role !== 'user'
    || Array.from(current.content).length > MAX_ANONYMOUS_CHAT_PROMPT_CHARACTERS
  ) {
    return { ok: false, code: 'invalid_prompt' }
  }
  const body = { messages } satisfies AnonymousChatBody
  if (encoder.encode(JSON.stringify(body)).byteLength > MAX_ANONYMOUS_CHAT_TRANSCRIPT_BYTES) {
    return { ok: false, code: 'transcript_too_large' }
  }
  return { ok: true, body }
}
