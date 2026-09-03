import { defineAction, type ActionParameter } from '@/modules/common/action'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import {
  OPERATION_INSPECT_ACTION_ID,
  OPERATION_INSPECT_PATH,
  operationInspectInputSchema,
  operationInspectResultSchema,
  type OperationInspectInput,
  type OperationInspectResult,
} from './operation-commitment'

const parameters: readonly ActionParameter[] = [
  {
    name: 'operationRef',
    type: 'string',
    description: 'Exact current Operation reference returned by compact search.',
    required: true,
  },
  {
    name: 'input',
    type: 'object',
    description: 'Concrete input to validate and bind into the expiring Commitment.',
    required: true,
  },
]

export const operationInspectAction = defineAction<OperationInspectInput, OperationInspectResult>({
  id: OPERATION_INSPECT_ACTION_ID,
  name: 'Inspect and commit an Operation purchase',
  summary: 'Resolve caller-specific authority, AUD price, budget, balance, payment readiness, and current terms into one expiring Commitment.',
  boundaries: [
    'Requires an AE-issued Agent key and resolves Account, Agent Principal, Grant, Operation, pricing, and policy facts server-side.',
    'Creates no Invocation, reservation, signature, payment, or Provider effect.',
    'A Commitment is exact, caller-bound, current-revision-bound, and expires; changed material requires another inspection.',
  ],
  schema: operationInspectInputSchema,
  outputSchema: operationInspectResultSchema,
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
  credentialAdmission: {
    scope: MARKET_OPERATIONS_INVOKE_SCOPE,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: 'operation.inspect:v2',
    consequenceClass: 'read_only',
    materialInputPaths: ['operationRef', 'input'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['operation_commitment'],
    safeContinuations: ['operation.invoke', 'registry.operations.list', 'registry.operations.search', 'registry.operations.describe', 'funding.handoff.create'],
    invalidationConditions: [
      'commitment_expired',
      'operation_revision_changed',
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
    if (context.operationInvokeService?.inspectOperation === undefined) throw new Error('operation_inspect_service_unavailable')
    return await context.operationInvokeService.inspectOperation({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})

export const OPERATION_INSPECT_ROUTE_CONTRACT = Object.freeze({
  actionId: OPERATION_INSPECT_ACTION_ID,
  contractVersion: 'operation.inspect:v2',
  method: 'POST' as const,
  path: OPERATION_INSPECT_PATH,
  routerPath: OPERATION_INSPECT_PATH,
  requiredHeaders: ['Authorization', 'Content-Type'] as const,
})
