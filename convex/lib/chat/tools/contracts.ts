import { planSuggestInputSchema, mercatorImportInputSchema, planDraftResultSchema } from '@/modules/capability-execution/plan/draft.schemas'
import { toolPlanQuoteAction } from '@/modules/capability-execution/plan/quote.actions'
import { toolPlanRunAction, toolPlanGetAction } from '@/modules/capability-execution/plan/runtime.actions'
import { z } from 'zod'
import { callInputSchema, callMachineResultSchema } from '@/modules/capability-execution/call-contracts'
import { toolQuoteInputSchema, toolQuoteResultSchema } from '@/modules/capability-execution/quote'
import { chatClarifyInputSchema, chatClarifyOutputSchema } from '@/modules/chat/agent-turn.contracts'
import type { ChatToolId } from '@/modules/chat/tool-card'
import { registryToolsListContract, registryToolsSearchContract, registryToolsDescribeContract, registryToolsCompareContract } from '@/modules/registry/tool-action-contracts'

const chatToolFailureReasons = [
  'source_output_invalid',
  'result_too_large',
  'tool_limit',
  'execute_limit',
  'search_limit',
  'search_repeated',
  'paging_not_requested',
  'turn_stopped',
  'tool_unavailable',
] as const

export type ChatToolFailure = Readonly<{
  kind: 'chat_tool_refused'
  toolId: ChatToolId
  reason: (typeof chatToolFailureReasons)[number]
}>

export type ChatToolAdmission = ChatToolFailure | null

export type ChatContract = Readonly<{
  id: ChatToolId
  summary: string
  boundaries: readonly string[]
  surfaces: readonly string[]
  schema: z.ZodType
  outputSchema: z.ZodType
}>

const chatCallContract = {
  id: 'tool.call',
  summary: 'Run one current admitted Market Tool through AE policy, provider authority, durable Call, and evidence controls.',
  boundaries: [
    'Requires an AE account with market_tools:call; the account identifies the caller but never grants provider authority or consequential approval.',
    'AE resolves the current Tool, Provider, endpoint, credentials, price, authority, and evidence server-side. The caller cannot supply or override transport, Provider, credential, payment, or approval details.',
    'Every Call is bound to the caller principal, current Tool version, policy generation, connection generation, input, and idempotency identity; replaying a changed command is refused.',
    'Provider credentials and internal connection references remain server-side and are never returned in tool output, HTTP problems, usage, or evidence.',
  ],
  surfaces: ['http', 'mcp', 'cli', 'chat'],
  schema: callInputSchema,
  outputSchema: callMachineResultSchema,
} as const satisfies ChatContract

const chatToolQuoteContract = {
  id: 'tool.quote',
  summary: 'Resolve the exact caller-specific terms for one Tool into an expiring Quote.',
  boundaries: [
    'Creates no Call, reservation, signature, payment, or Provider effect.',
    'AE resolves the Account, Agent, authority, current Tool version, normalized input, AUD price, budget, balance, treasury capacity, and policy versions server-side.',
    'Call only with the returned Quote. Changed or expired material requires a fresh Quote.',
  ],
  surfaces: ['http', 'mcp', 'cli', 'chat'],
  schema: toolQuoteInputSchema,
  outputSchema: toolQuoteResultSchema,
} as const satisfies ChatContract

const chatContracts = {
  'registry.tools.list': registryToolsListContract,
  'registry.tools.search': registryToolsSearchContract,
  'registry.tools.describe': registryToolsDescribeContract,
  'registry.tools.compare': registryToolsCompareContract,
  'tool.quote': chatToolQuoteContract,
  'tool.call': chatCallContract,
  'tool.plan.suggest': { id: 'tool.plan.suggest', summary: 'Read editable Plan drafts from currently admitted schema-compatible Tool edges.',
    boundaries: ['Drafts are untyped suggestions, never approval or a purchase. Fill required inputs and quote the edited Plan before any run.'],
    surfaces: ['chat'], schema: planSuggestInputSchema, outputSchema: planDraftResultSchema },
  'tool.plan.import': { id: 'tool.plan.import', summary: 'Convert a supplied Mercator flow and Provider host map into an editable Plan draft.',
    boundaries: ['Each exact host, method and path must resolve uniquely to an admitted Tool. A serviceId never establishes local identity. No Quote, Hold or Call is created.'],
    surfaces: ['chat'], schema: mercatorImportInputSchema, outputSchema: planDraftResultSchema },
  'tool.plan.quote': { ...toolPlanQuoteAction, id: 'tool.plan.quote', surfaces: ['chat'] },
  'tool.plan.run': { ...toolPlanRunAction, id: 'tool.plan.run', surfaces: ['chat'] },
  'tool.plan.get': { ...toolPlanGetAction, id: 'tool.plan.get', surfaces: ['chat'] },
  'chat.clarify': {
    id: 'chat.clarify',
    summary: 'Ask one clarifying question with exactly three short choices when a search would be a guess, then wait for the answer.',
    boundaries: [
      'One question only. Exactly three short choices. The person may also type another answer.',
      'Do not search, compare, quote, or call in the same turn. Stop after this tool.',
    ],
    surfaces: ['chat'],
    schema: chatClarifyInputSchema,
    outputSchema: chatClarifyOutputSchema,
  },
} as const satisfies Record<ChatToolId, ChatContract>

export function contractFor(toolId: ChatToolId): ChatContract {
  const contract = chatContracts[toolId]
  if (!contract.surfaces.includes('chat')) {
    throw new Error(`Chat Action is unavailable: ${toolId}`)
  }
  return contract
}

export function descriptionFor(contract: ChatContract): string {
  return [
    contract.summary,
    'Boundaries:',
    ...contract.boundaries.map((boundary) => `- ${boundary}`),
  ].join('\n')
}

export function failure(toolId: ChatToolId, reason: ChatToolFailure['reason']): ChatToolFailure {
  return { kind: 'chat_tool_refused', toolId, reason }
}

export type ReserveChatTool = (toolId: ChatToolId) => ChatToolAdmission
export type ReserveChatSearch = (toolId: 'registry.tools.list' | 'registry.tools.search', key: string, cursor: string | undefined, request: string | undefined) => ChatToolAdmission
