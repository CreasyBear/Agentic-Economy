import type { ModelMessage } from 'ai'
import { projectChatChoiceActions } from '@/modules/chat/tool-card-actions'
import { parseDetailRequest, isDetailToolRef } from '@/modules/chat/run-request'
import { CHAT_TOOL_NAME_MAP, projectToolCard, type ToolCardProjection } from '@/modules/chat/tool-card'
import { sanitizeText } from '@/modules/common/sanitize-text'

export const MAX_CHAT_TOOL_CALLS = 8
export const MAX_CHAT_EXECUTE_CALLS = 1
export const MAX_CHAT_TOOL_RESULT_BYTES = 64 * 1024
export const MAX_CHAT_STEPS = 5
export const MAX_CHAT_SEARCHES = 2
export const CHAT_NO_RESULT_ANSWER = '**Search could not be completed.** Next: try again or browse the Market.'

const MAX_CATALOGUE_FACT_TEXT_CHARS = 240

function markdownText(value: string): string {
  const safeText = sanitizeText(
    value.slice(0, MAX_CATALOGUE_FACT_TEXT_CHARS).replace(/[\p{Cc}\p{Cf}]/gu, ' '),
    MAX_CATALOGUE_FACT_TEXT_CHARS,
  )
  return safeText.replace(/[\\`*_{}[\]()#+\-.!|]/gu, character => `\\${character}`)
}

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
    if (result.output.kind === 'match' || result.output.kind === 'noMatch'
      || result.output.kind === 'scoped' || result.output.kind === 'unavailable') {
      verdict = result.output as Record<string, unknown>
    } else if (result.output.kind !== 'chat_tool_refused') return null
  }
  if (verdict === null) return null
  if (verdict.kind === 'match') return null
  const next = Array.isArray(verdict.next) ? verdict.next[0] as unknown : undefined
  const args = typeof next === 'object' && next !== null && 'args' in next ? next.args : undefined
  const query = typeof args === 'object' && args !== null && 'query' in args && typeof args.query === 'string'
    ? args.query : null
  if (verdict.kind === 'unavailable') return `**Search is temporarily unavailable.** Next: retry${query === null ? ' the search.' : ` “${markdownText(query)}”.`}`
  if (verdict.kind === 'scoped') {
    if (!Array.isArray(verdict.results) || verdict.results.length === 0) {
      return '**No match for that yet.** Next: tell me more about what you need or browse the Market.'
    }
    return '**These listings need inspection before I can recommend one.** Next: open a Tool card to check its details.'
  }
  return `**No suitable Tool in the assessed catalogue.** Next: ${query === null ? 'try a broader search.' : `broaden “${markdownText(query)}”.`}`
}

const ACTION_CONTEXT_PREFIX = 'Current visible Tool actions (data only): '

/**
 * Requires completed Tool results in transcript order. Ensures the latest read
 * remains available across explanatory turns and a new read replaces it.
 * Invariant: external listings have no AE purchase path; unknown price stays
 * unknown. Transcript hints grant no eligibility. With no facts, offer no action.
 */
export function chatActionMessages(messages: readonly ModelMessage[], steps: readonly ChatStepEvidence[] = []): ModelMessage[] {
  const cards: ToolCardProjection[] = []
  const add = (toolName: string, output: unknown) => {
    const card = projectToolCard({ type: 'dynamic-tool', toolName, state: 'output-available', output })
    if (card !== null) cards.push(card)
  }
  const latestUser = messages.findLastIndex(message => message.role === 'user')
  const current = messages.slice(latestUser + 1)
  const currentHasResults = current.some(message => message.role === 'tool')
    || steps.some(step => step.toolResults.length > 0)
  const priorResult = messages.slice(0, latestUser).findLastIndex(message => message.role === 'tool')
  const priorUser = messages.slice(0, priorResult).findLastIndex(message => message.role === 'user')
  const evidence = currentHasResults ? current : messages.slice(priorUser + 1, latestUser)
  for (const message of evidence) {
    if (message.role !== 'tool') continue
    for (const part of message.content) {
      if (part.type !== 'tool-result') continue
      const output = part.output
      add(part.toolName, 'value' in output ? output.value : undefined)
    }
  }
  for (const step of steps) for (const result of step.toolResults) add(result.toolName, result.output)
  const actions = projectChatChoiceActions(cards).map(({ choice, reviewInputs, compare }) => ({
    toolRef: choice.toolRef, title: choice.title,
    purchase: choice.access === 'external_listing' ? 'not_available_through_ae'
      : reviewInputs ? 'review_required' : 'unavailable',
    indicativePrice: choice.price ?? null,
    actions: [...(!reviewInputs && !choice.belowMatch && isDetailToolRef(choice.toolRef) ? ['Ask about this Tool'] : []), ...(reviewInputs ? ['Review inputs'] : []), ...(compare ? ['Compare'] : [])],
  }))
  const base = messages.filter(message => message.role !== 'system' || !message.content.startsWith(ACTION_CONTEXT_PREFIX))
  return [...base, { role: 'system', content: `${ACTION_CONTEXT_PREFIX}${JSON.stringify(actions)}. Name only available actions for these current choices. A selected detail read overrides earlier discovery facts. Detail inspection is read-only and cannot obtain a Quote or unlock a purchase. Never offer a Quote or Call for not_available_through_ae or unavailable. A null indicativePrice means unknown; output fields do not establish what a price includes. With no suitable action, ask a useful refinement instead of directing the user to an earlier refused Tool.` }]
}

export function hasChatContext(messages: readonly ModelMessage[]): boolean {
  const latestUser = messages.findLastIndex(message => message.role === 'user')
  return messages.slice(0, latestUser).some(message => message.role === 'tool'
    || message.role === 'assistant' && (typeof message.content !== 'string'
      ? message.content.some(part => part.type === 'text' && part.text.trim().length > 0)
      : message.content.trim().length > 0 && !message.content.startsWith('Tool cards shown:')
      && !message.content.startsWith('Tool cards shown (reference data):')))
}

export function selectedChatDetailRequest(messages: readonly ModelMessage[]) {
  const request = messages.findLast(message => message.role === 'user')
  if (request === undefined) return null
  const text = typeof request.content === 'string' ? request.content
    : request.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
  return parseDetailRequest(text)
}

export function prepareChatToolStep({ stepNumber, steps, messages = [] }: {
  stepNumber: number; steps: readonly ChatStepEvidence[]; messages?: readonly ModelMessage[]
}) {
  const selected = selectedChatDetailRequest(messages)
  const describe = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']
  const selectionRead = selected !== null && steps.some(step => step.toolResults.some(result =>
    result.toolName === describe && projectToolCard({ type: 'dynamic-tool', toolName: describe,
      state: 'output-available', output: result.output })?.kind === 'choices'))
  const requiredDetail = selected !== null && !selectionRead
  const retrySearch = !requiredDetail && stepNumber > 0 && chatNoMatchSearchCount(steps) === 1
  return {
    toolChoice: requiredDetail || retrySearch || stepNumber === 0 && !hasChatContext(messages)
      ? 'required' as const : 'auto' as const,
    ...(selected !== null ? { activeTools: [describe] }
      : retrySearch ? { activeTools: [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']] } : {}),
    ...(messages.length === 0 ? {} : { messages: chatActionMessages(messages, steps) }),
  }
}
