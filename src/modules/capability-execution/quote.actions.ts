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
    'Unpaid live price inspection may send the proposed input to the selected Provider before the Quote exists. Creates no Call, reservation, signature or payment; approval-required managed x402 quotes use persisted requirements without a Provider request.',
    'A Quote is exact, caller-bound, current-version-bound, and expires; changed material requires another quote.',
    'For a multi-Tool task, obtain one committed current Quote per concrete input; add exact price units only at the same currency/exponent, compare with the task ceiling before any Call, and retain each QuoteRef/expiry/Account/Principal separately. AE does not sell an aggregate bundle.',
  ],
  schema: toolQuoteInputSchema,
  outputSchema: toolQuoteResultSchema,
  parameters,
  readOnly: false,
  effect: {
    class: 'disclosure',
    reversible: false,
    recipientKind: 'provider_system',
    dataClasses: ['operation_input'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli', 'chat'],
  mcp: { idempotent: false, openWorld: true, destructive: false },
  credentialAdmission: {
    scope: MARKET_TOOLS_CALL_SCOPE,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: 'tool.quote:v2',
    consequenceClass: 'communication',
    materialInputPaths: ['toolRef', 'input'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['operation_commitment'],
    safeContinuations: ['tool.quote', 'funding.handoff.config', 'tool.call', 'registry.tools.list', 'registry.tools.search', 'registry.tools.describe', 'funding.handoff.create'],
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
