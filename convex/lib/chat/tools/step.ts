import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'

export const MAX_CHAT_TOOL_CALLS = 8
export const MAX_CHAT_EXECUTE_CALLS = 1
export const MAX_CHAT_TOOL_RESULT_BYTES = 64 * 1024
export const MAX_CHAT_STEPS = 5
export const MAX_CHAT_SEARCHES = 2
export const CHAT_NO_RESULT_ANSWER = '**Search could not be completed.** Next: try again or browse the Market.'

type ChatStepEvidence = Readonly<{
  toolResults: readonly Readonly<{ toolName: string; output: unknown }>[]
}>

export function chatNoMatchSearchCount(steps: readonly ChatStepEvidence[]): number {
  let count = 0
  for (const step of steps) for (const result of step.toolResults) {
    if (result.toolName !== CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']) {
      if (typeof result.output === 'object' && result.output !== null
        && 'kind' in result.output && result.output.kind === 'chat_tool_refused') continue
      return 0
    }
    if (typeof result.output !== 'object' || result.output === null || !('kind' in result.output)) return 0
    if (result.output.kind === 'noMatch') count += 1
    else if (result.output.kind !== 'chat_tool_refused') return 0
  }
  return count
}

/** Only a completed search verdict may override model narration. A scoped page is never a no-match. */
export function chatSearchResolution(steps: readonly ChatStepEvidence[]): string | null {
  let verdict: Record<string, unknown> | null = null
  for (const step of steps) for (const result of step.toolResults) {
    if (result.toolName !== CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']) {
      if (typeof result.output === 'object' && result.output !== null
        && 'kind' in result.output && result.output.kind === 'chat_tool_refused') continue
      return null
    }
    if (typeof result.output !== 'object' || result.output === null || !('kind' in result.output)) return null
    if (result.output.kind === 'match') return null
    if (result.output.kind === 'noMatch' || result.output.kind === 'scoped' || result.output.kind === 'unavailable') {
      verdict = result.output as Record<string, unknown>
    } else if (result.output.kind !== 'chat_tool_refused') return null
  }
  if (verdict === null) return null
  const next = Array.isArray(verdict.next) ? verdict.next[0] as unknown : undefined
  const action = typeof next === 'object' && next !== null && 'action' in next ? next.action : undefined
  const args = typeof next === 'object' && next !== null && 'args' in next ? next.args : undefined
  const query = typeof args === 'object' && args !== null && 'query' in args && typeof args.query === 'string'
    ? args.query : null
  if (verdict.kind === 'unavailable') return `**Search is temporarily unavailable.** Next: retry${query === null ? ' the search.' : ` “${query}”.`}`
  if (verdict.kind === 'scoped') {
    if (action === 'next-page' && typeof args === 'object' && args !== null
      && 'cursor' in args && typeof args.cursor === 'string' && query !== null) {
      return `**Only part of the catalogue was assessed; no suitable Tool is established yet.** Next: ask for the next page of “${query}” (cursor: ${args.cursor}).`
    }
    return `**Only part of the catalogue was assessed; no suitable Tool is established yet.** Next: ${query === null ? 'broaden your search or browse the Market.' : `broaden “${query}” or browse the Market.`}`
  }
  return `**No suitable Tool in the assessed catalogue.** Next: ${query === null ? 'try a broader search.' : `broaden “${query}”.`}`
}

export function prepareChatToolStep({ stepNumber, steps }: { stepNumber: number; steps: readonly ChatStepEvidence[] }) {
  const retrySearch = stepNumber > 0 && chatNoMatchSearchCount(steps) === 1
  return {
    toolChoice: stepNumber === 0 || retrySearch ? 'required' as const : 'auto' as const,
    ...(retrySearch ? { activeTools: [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']] } : {}),
  }
}
