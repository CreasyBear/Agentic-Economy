import { defineAction, type ActionParameter } from '@/modules/common/action'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import type { PlanQuoteInput, PlanQuoteResult } from './contracts'
import { planQuoteInputSchema, planQuoteResultSchema } from './parse'

export const TOOL_PLAN_QUOTE_ACTION_ID = 'tool.plan.quote' as const
export const TOOL_PLAN_QUOTE_PATH = '/api/v1/tools/plans/quote' as const

const parameters: readonly ActionParameter[] = [
  {
    name: 'plan',
    type: 'object',
    description: 'Frozen Plan DAG of admitted Tool references, inputs, dependencies, and bounds.',
    required: true,
  },
]

export const toolPlanQuoteAction = defineAction<PlanQuoteInput, PlanQuoteResult>({
  id: TOOL_PLAN_QUOTE_ACTION_ID,
  name: 'Quote a Tool Plan',
  summary: 'Validate and persist an expiring Plan Quote with per-Node AUD ceilings and an exact total; no Hold or Call is created.',
  boundaries: [
    'AE resolves authority, admitted supply, prices and payment facts. The caller supplies only the Plan.',
    'Unpaid inspection may send inputs; no Hold, Call, signature or payment. Approval-required quotes send no Provider request.',
    'Changed material requires a new quote. Run the returned PlanRef with its exact total; quoting does not replay a purchase.',
  ],
  schema: planQuoteInputSchema,
  outputSchema: planQuoteResultSchema,
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
    version: 'tool.plan.quote:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['plan'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['operation_commitment'],
    safeContinuations: ['tool.plan.run'],
    invalidationConditions: [
      'plan_quote_expired',
      'plan_changed',
      'tool_material_changed',
      'grant_generation_changed',
      'pricing_changed',
      'policy_changed',
      'available_capacity_changed',
    ],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.callService?.planQuote === undefined) throw new Error('tool_plan_quote_unavailable')
    return await context.callService.planQuote({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})

export const TOOL_PLAN_QUOTE_ROUTE_CONTRACT = Object.freeze({
  actionId: TOOL_PLAN_QUOTE_ACTION_ID,
  contractVersion: 'tool.plan.quote:v1',
  method: 'POST' as const,
  path: TOOL_PLAN_QUOTE_PATH,
  routerPath: TOOL_PLAN_QUOTE_PATH,
  requiredHeaders: ['Authorization', 'Content-Type'] as const,
})
