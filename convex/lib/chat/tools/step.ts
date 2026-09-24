import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'

export const MAX_CHAT_TOOL_CALLS = 8
export const MAX_CHAT_EXECUTE_CALLS = 1
export const MAX_CHAT_TOOL_RESULT_BYTES = 64 * 1024
export const MAX_CHAT_STEPS = 5
export const MAX_CHAT_SEARCHES = 2
export const CHAT_NO_RESULT_ANSWER = '**No match for that yet.** Next: try different words or browse the Market.'

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

export function prepareChatToolStep({ stepNumber, steps }: { stepNumber: number; steps: readonly ChatStepEvidence[] }) {
  const retrySearch = stepNumber > 0 && chatNoMatchSearchCount(steps) === 1
  return {
    toolChoice: stepNumber === 0 || retrySearch ? 'required' as const : 'auto' as const,
    ...(retrySearch ? { activeTools: [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']] } : {}),
  }
}
