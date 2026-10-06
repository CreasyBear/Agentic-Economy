import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import type { ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { completedChatFacts } from '../generate/completedFacts'
import { CHAT_NO_RESULT_ANSWER } from './step'

export function immediateSearchToolName(): string {
  return CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
}

export function catalogueFact(output: ToolChoiceSearchOutput): string {
  return completedChatFacts([{ toolResults: [{ toolName: immediateSearchToolName(), output }] }]) ?? CHAT_NO_RESULT_ANSWER
}
