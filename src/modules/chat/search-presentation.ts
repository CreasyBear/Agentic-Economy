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

export type ChatSearchSurface = 'compare' | 'describe'

export function searchCardSurface(use: unknown): ChatSearchSurface | undefined {
  if (use === 'registry.tools.compare') return 'compare'
  if (use === 'registry.tools.describe') return 'describe'
  return undefined
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

export function attachChatSearchUse<T>(
  output: T,
  use: ChatSearchUse | null,
  belowMatch: readonly string[] = [],
): T {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) return output
  if (!('kind' in output) || output.kind !== 'ok') return output
  const marked = readBelowMatch(belowMatch)
  if (use === null && marked.length === 0) return output
  return {
    ...output,
    ...(use === null ? {} : { use }),
    ...(marked.length === 0 ? {} : { belowMatch: marked }),
  }
}
