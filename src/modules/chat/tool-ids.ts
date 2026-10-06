import { providerSafeActionToolName } from '@/modules/actions/tool-contract'

export const CHAT_TOOL_IDS = [
  'registry.tools.list',
  'registry.tools.search',
  'registry.tools.describe',
  'registry.tools.compare',
  'tool.plan.suggest',
  'tool.plan.import',
  'tool.plan.quote',
  'tool.plan.run',
  'tool.plan.get',
  'tool.quote',
  'tool.call',
  'chat.clarify',
] as const

export type ChatToolId = (typeof CHAT_TOOL_IDS)[number]

const canonicalToProvider = Object.freeze(Object.fromEntries(
  CHAT_TOOL_IDS.map((toolId) => [toolId, providerSafeActionToolName(toolId)]),
)) as Readonly<Record<ChatToolId, string>>

const providerToCanonical = Object.freeze(Object.fromEntries(
  CHAT_TOOL_IDS.map((toolId) => [canonicalToProvider[toolId], toolId]),
)) as Readonly<Record<string, ChatToolId>>

export const CHAT_TOOL_NAME_MAP = Object.freeze({
  canonicalToProvider,
  providerToCanonical,
})

export const CHAT_TOOL_TITLES: Readonly<Record<ChatToolId, string>> = {
  'registry.tools.list': 'Browse Tools',
  'registry.tools.search': 'Search tools',
  'registry.tools.describe': 'Tool details',
  'registry.tools.compare': 'Compare tools',
  'tool.quote': 'Confirm purchase terms',
  'tool.call': 'Call',
  'tool.plan.suggest': 'Suggested Plans',
  'tool.plan.import': 'Imported Plan',
  'tool.plan.quote': 'Plan quote',
  'tool.plan.run': 'Run Plan',
  'tool.plan.get': 'Plan status',
  'chat.clarify': 'Preparing a question',
}
