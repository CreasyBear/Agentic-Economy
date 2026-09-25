import type { ModelMessage } from 'ai'

const CHAT_SEARCH_USES = [
  'registry.tools.search',
  'registry.tools.compare',
  'registry.tools.describe',
  'chat.clarify',
] as const

export type ChatSearchUse = (typeof CHAT_SEARCH_USES)[number]

export function chatSearchUse(value: unknown): ChatSearchUse | null {
  return typeof value === 'string' && (CHAT_SEARCH_USES as readonly string[]).includes(value)
    ? value as ChatSearchUse
    : null
}


export function readBelowMatch(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  const refs: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.length > 400 || refs.includes(item)) continue
    refs.push(item)
    if (refs.length >= 4) break
  }
  return refs
}


export function latestUserRequest(messages: readonly ModelMessage[] | undefined): string | undefined {
  if (messages === undefined) return undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined || message.role !== 'user') continue
    const text = messageText(message.content).trim()
    if (text.length > 0) return Array.from(text).slice(0, 500).join('')
  }
  return undefined
}

function messageText(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n')
}
