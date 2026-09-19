import { defineAction, type ActionParameter } from '@/modules/common/action'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import {
  CapabilityProcurementEngine,
  defaultProductionCatalogSearcher,
} from './procure-engine'
import {
  TOOL_PROCURE_ACTION_ID,
  TOOL_PROCURE_PATH,
  toolProcureInputSchema,
  toolProcureResultSchema,
  type ToolProcureInput,
  type ToolProcureResult,
} from './procure'

export {
  TOOL_PROCURE_ACTION_ID,
  TOOL_PROCURE_PATH,
  toolProcureInputSchema,
  toolProcureResultSchema,
  type ToolProcureInput,
  type ToolProcureResult,
}

const parameters: readonly ActionParameter[] = [
  {
    name: 'need',
    type: 'string',
    description: 'Natural language capability need or goal to resolve and procure in one turn.',
    required: true,
  },
  {
    name: 'maxSpendAud',
    type: 'string',
    description: 'Optional maximum total spending budget in decimal AUD for this capability call.',
    required: false,
  },
]

export const toolProcureAction = defineAction<ToolProcureInput, ToolProcureResult>({
  id: TOOL_PROCURE_ACTION_ID,
  name: 'Procure a Tool capability',
  summary: 'Resolve a capability gap, extract contract arguments, bind Quote, execute Provider, and autonomously remedy stealth failures in one turn.',
  boundaries: [
    'Enforces caller-specific authority and exact Australian GST itemization.',
    'Guarantees A$0.00 net deduction on upstream provider failure via autonomous remedy.',
    'Preserves deterministic IceInVein budget barriers before any ledger reservation.',
  ],
  schema: toolProcureInputSchema,
  outputSchema: toolProcureResultSchema,
  parameters,
  readOnly: false,
  effect: {
    class: 'payment',
    reversible: true,
    recipientKind: 'business',
    dataClasses: ['operation_input'],
    spendExposure: 'bounded',
    approval: 'policy_eligible',
  },
  surfaces: ['http', 'mcp', 'cli', 'chat'],
  mcp: { idempotent: false, openWorld: false, destructive: false },
  credentialAdmission: {
    scope: MARKET_TOOLS_CALL_SCOPE,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: 'tool.procure:v1',
    consequenceClass: 'external_effect',
    materialInputPaths: ['need'],
    authorityRequirement: 'principal',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['operation_commitment', 'purchase_receipt'],
    safeContinuations: [],
    invalidationConditions: [],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.callService === undefined) throw new Error('call_service_unavailable')
    const engine = new CapabilityProcurementEngine({
      catalogSearcher: context.catalogSearcher ?? defaultProductionCatalogSearcher,
      callService: context.callService,
      principal: context.agentAccessPrincipal,
      ...(context.correlationId !== undefined ? { correlationId: context.correlationId } : {}),
    })
    return await engine.procure(data)
  },
})

export const TOOL_PROCURE_ROUTE_CONTRACT = Object.freeze({
  actionId: TOOL_PROCURE_ACTION_ID,
  contractVersion: 'tool.procure:v1',
  method: 'POST' as const,
  path: TOOL_PROCURE_PATH,
  routerPath: TOOL_PROCURE_PATH,
  requiredHeaders: ['Authorization', 'Content-Type'] as const,
})
