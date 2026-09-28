import { defineAction, type ActionParameter } from '@/modules/common/action'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import {
  CapabilityProcurementEngine,
  createProcureIdentityPort,
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
    name: 'kind',
    type: 'enum',
    enum: ['need', 'exact'],
    description: 'Select a Tool from a need without purchasing, or Quote and Call one exact Tool with caller-supplied input.',
    required: true,
  },
  {
    name: 'need',
    type: 'string',
    description: 'Natural-language capability need; selection returns the required input schema, without a Quote or Call.',
    required: false,
  },
  {
    name: 'toolRef',
    type: 'string',
    description: 'Exact published Tool reference when kind is exact.',
    required: false,
  },
  {
    name: 'input',
    type: 'object',
    description: 'Validated Tool arguments when kind is exact.',
    required: false,
  },
  {
    name: 'maxSpendAud',
    type: 'string',
    description: 'Maximum AUD total for kind: exact; not used for need selection.',
    required: false,
  },
  {
    name: 'idempotencyKey',
    type: 'string',
    description: 'Fresh caller-owned purchase key for kind: exact; reuse only when retrying that exact request.',
    required: false,
  },
]

export const toolProcureAction = defineAction<ToolProcureInput, ToolProcureResult>({
  id: TOOL_PROCURE_ACTION_ID,
  name: 'Procure a Tool capability',
  summary: 'Select a published Tool by need and return typed input requirements, or Quote and Call an exact Tool with caller-supplied input and a new purchase key.',
  boundaries: [
    'Enforces caller-specific authority and exact Australian GST itemization.',
    'Provider failure is not proof of a refund; inspect the original Call for its authoritative outcome.',
    'Returns the original Quote and Call references for recovery without a second purchase.',
  ],
  schema: toolProcureInputSchema,
  outputSchema: toolProcureResultSchema,
  parameters,
  readOnly: false,
  effect: {
    class: 'payment',
    reversible: false,
    recipientKind: 'business',
    dataClasses: ['operation_input'],
    spendExposure: 'bounded',
    approval: 'policy_eligible',
  },
  surfaces: ['http', 'mcp', 'cli'],
  mcp: { idempotent: true, openWorld: true, destructive: true },
  credentialAdmission: {
    scope: MARKET_TOOLS_CALL_SCOPE,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: 'tool.procure:v1',
    consequenceClass: 'external_effect',
    materialInputPaths: ['kind', 'need', 'toolRef', 'input', 'maxSpendAud'],
    authorityRequirement: 'principal',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['operation_commitment', 'purchase_receipt'],
    safeContinuations: [],
    invalidationConditions: [],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.callService === undefined || context.request === undefined) throw new Error('call_service_unavailable')
    const correlationId = context.correlationId ?? globalThis.crypto.randomUUID()
    const engine = new CapabilityProcurementEngine({
      catalogSearcher: context.catalogSearcher ?? defaultProductionCatalogSearcher,
      callService: context.callService,
      principal: context.agentAccessPrincipal,
      identity: createProcureIdentityPort(context.request, JSON.stringify(data), correlationId),
      correlationId,
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
