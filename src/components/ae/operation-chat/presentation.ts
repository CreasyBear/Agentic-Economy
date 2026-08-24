import { providerSafeActionToolName } from '@/modules/actions/tool-contract'

export const CHAT_TOOL_IDS = [
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
  'operation.execute',
] as const

export type ChatToolId = (typeof CHAT_TOOL_IDS)[number]
export type TranscriptMessage = Readonly<{
  id: string
  role: 'user' | 'assistant'
  parts: readonly unknown[]
}>
export type OperationCardProjection = Readonly<{
  toolId: ChatToolId
  title: string
  state: 'working' | 'complete' | 'refused' | 'error'
  name?: string | undefined
  operationRefs: readonly string[]
  count?: number
  summary?: string | undefined
}>

const TITLES: Readonly<Record<ChatToolId, string>> = {
  'registry.operations.search': 'Search operations',
  'registry.operations.detail': 'Operation details',
  'registry.operations.compare': 'Compare operations',
  'registry.operations.inspectPlan': 'Inspect operation plan',
  'operation.execute': 'Execute operation',
}

const PROVIDER_TO_CANONICAL = Object.fromEntries(CHAT_TOOL_IDS.map((toolId) => [
  providerSafeActionToolName(toolId),
  toolId,
])) as Readonly<Record<string, ChatToolId>>

const REFUSAL_SUMMARIES: Readonly<Record<string, string>> = {
  source_unavailable: 'Source unavailable',
  source_capacity_exceeded: 'Source capacity exceeded',
  setup_required: 'Setup required',
  temporarily_unavailable: 'Temporarily unavailable',
  operation_not_found: 'Operation not found',
  operation_unavailable: 'Operation unavailable',
  operation_not_keyless: 'Operation requires credentials',
  operation_not_executable: 'Operation cannot be executed here',
  input_invalid: 'Input was refused',
  endpoint_invalid: 'Endpoint was refused',
  result_too_large: 'Result was too large',
  tool_limit: 'Tool limit reached',
  execute_limit: 'Execution limit reached',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? Array.from(value.trim()).slice(0, 120).join('')
    : undefined
}

function addRef(refs: string[], value: unknown): void {
  const ref = typeof value === 'string' && /^operation:v1:[0-9a-f]{64}$/u.test(value)
    ? value
    : undefined
  if (ref !== undefined && refs.length < 4 && !refs.includes(ref)) refs.push(ref)
}

function providerToolName(part: Record<string, unknown>): string | undefined {
  if (part.type === 'dynamic-tool') return typeof part.toolName === 'string' ? part.toolName : undefined
  return typeof part.type === 'string' && part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : undefined
}

function outputRecord(part: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!isRecord(part.output)) return undefined
  return part.output.type === 'json' && isRecord(part.output.value)
    ? part.output.value
    : part.output
}

function allowlistedOutput(output: Record<string, unknown> | undefined) {
  if (output === undefined) return { operationRefs: [] as string[] }
  const operationRefs: string[] = []
  addRef(operationRefs, output.operationRef)
  if (isRecord(output.operation)) addRef(operationRefs, output.operation.operationRef)
  for (const field of ['operationRefs', 'items', 'operations'] as const) {
    const values = output[field]
    if (!Array.isArray(values)) continue
    for (const value of values) addRef(operationRefs, isRecord(value) ? value.operationRef : value)
  }
  const count = typeof output.matchedCount === 'number' && Number.isSafeInteger(output.matchedCount)
    ? Math.max(0, output.matchedCount)
    : Array.isArray(output.items)
      ? output.items.length
      : Array.isArray(output.operations)
        ? output.operations.length
        : Array.isArray(output.operationRefs)
          ? output.operationRefs.length
          : undefined
  const operationName = isRecord(output.operation) ? stringField(output.operation.name) : undefined
  const name = stringField(output.name) ?? operationName
  return {
    operationRefs,
    ...(count === undefined ? {} : { count }),
    ...(name === undefined ? {} : { name }),
  }
}

export function projectOperationCard(part: unknown): OperationCardProjection | null {
  if (!isRecord(part)) return null
  if (part.type === 'operation-card') {
    const toolId = typeof part.toolId === 'string' && CHAT_TOOL_IDS.includes(part.toolId as ChatToolId)
      ? part.toolId as ChatToolId
      : undefined
    if (toolId === undefined) return null
    const state = part.state === 'complete' || part.state === 'refused' || part.state === 'error'
      ? part.state
      : 'error'
    const refs: string[] = []
    if (Array.isArray(part.operationRefs)) for (const value of part.operationRefs) addRef(refs, value)
    return {
      toolId,
      title: TITLES[toolId],
      state,
      operationRefs: refs,
      ...(stringField(part.summary) === undefined ? {} : { summary: stringField(part.summary) }),
    }
  }

  const providerName = providerToolName(part)
  const toolId = providerName === undefined ? undefined : PROVIDER_TO_CANONICAL[providerName]
  if (toolId === undefined) return null
  if (part.state === 'output-error') return { toolId, title: TITLES[toolId], state: 'error', operationRefs: [], summary: 'Tool unavailable' }
  if (part.state === 'output-denied') return { toolId, title: TITLES[toolId], state: 'refused', operationRefs: [], summary: 'Request refused' }
  if (part.state !== 'output-available') return { toolId, title: TITLES[toolId], state: 'working', operationRefs: [] }

  const output = outputRecord(part)
  const kind = output?.kind
  const reason = typeof output?.reason === 'string' ? REFUSAL_SUMMARIES[output.reason] : undefined
  const refused = kind === 'refused' || kind === 'unavailable' || kind === 'chat_tool_refused'
  return {
    toolId,
    title: TITLES[toolId],
    state: refused ? 'refused' : kind === 'error' ? 'error' : 'complete',
    ...allowlistedOutput(output),
    ...(refused ? { summary: reason ?? 'Request refused' } : {}),
  }
}

export function textFromParts(parts: readonly unknown[]): string {
  return parts.flatMap((part) => {
    if (!isRecord(part)) return []
    return part.type === 'text' && typeof part.text === 'string' ? [part.text] : []
  }).join('')
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

export function friendlyChatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('rate_limited')) return 'You’ve reached the chat limit. Try again later.'
  if (message.includes('thread_busy')) return 'This conversation is already responding. Wait a moment and try again.'
  return 'Chat is temporarily unavailable. Try again shortly.'
}
