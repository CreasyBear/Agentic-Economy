import { defineAction, type ActionParameter } from '@/modules/common/action'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import {
  TOOL_QUOTE_ACTION_ID,
  TOOL_QUOTE_PATH,
  toolQuoteInputSchema,
  toolQuoteResultSchema,
  type ToolQuoteInput,
  type ToolQuoteResult,
} from './quote'

const parameters: readonly ActionParameter[] = [
  {
    name: 'toolRef',
    type: 'string',
    description: 'Exact current Tool reference returned by compact search.',
    required: true,
  },
  {
    name: 'input',
    type: 'object',
    description: 'Concrete Tool input to validate and bind into the expiring Quote.',
    required: true,
  },
]

export const toolQuoteAction = defineAction<ToolQuoteInput, ToolQuoteResult>({
  id: TOOL_QUOTE_ACTION_ID,
  name: 'Quote a Tool purchase',
  summary: 'Resolve caller-specific authority, AUD price, budget, balance, payment readiness, and current terms into one expiring Quote.',
  boundaries: [
    'Requires an AE-issued Agent key and resolves Account, Agent Principal, Grant, Tool, pricing, and policy facts server-side.',
    'Creates no Call, reservation, signature, payment, or Provider effect.',
    'A Quote is exact, caller-bound, current-version-bound, and expires; changed material requires another quote.',
  ],
  schema: toolQuoteInputSchema,
  outputSchema: toolQuoteResultSchema,
  parameters,
  readOnly: false,
  effect: {
    class: 'commitment',
    reversible: true,
    recipientKind: 'none',
    dataClasses: ['operation_input'],
    spendExposure: 'bounded',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli', 'chat'],
  mcp: { idempotent: false, openWorld: false, destructive: false },
  credentialAdmission: {
    scope: MARKET_TOOLS_CALL_SCOPE,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: 'tool.quote:v2',
    consequenceClass: 'read_only',
    materialInputPaths: ['toolRef', 'input'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['operation_commitment'],
    safeContinuations: ['tool.call', 'registry.tools.list', 'registry.tools.search', 'registry.tools.describe', 'funding.handoff.create'],
    invalidationConditions: [
      'quote_expired',
      'tool_version_changed',
      'input_changed',
      'grant_generation_changed',
      'price_changed',
      'policy_changed',
      'balance_changed',
      'treasury_changed',
    ],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.callService?.quoteTool === undefined) throw new Error('tool_quote_unavailable')
    return await context.callService.quoteTool({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})

export const TOOL_QUOTE_ROUTE_CONTRACT = Object.freeze({
  actionId: TOOL_QUOTE_ACTION_ID,
  contractVersion: 'tool.quote:v2',
  method: 'POST' as const,
  path: TOOL_QUOTE_PATH,
  routerPath: TOOL_QUOTE_PATH,
  requiredHeaders: ['Authorization', 'Content-Type'] as const,
})
