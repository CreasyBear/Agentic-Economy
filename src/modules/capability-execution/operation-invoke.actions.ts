import { OPERATION_INVOKE_ROUTE_CONTRACT } from './operation-invoke-entry'
import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  executeOperationInvoke,
  operationInvokeInputSchema,
  operationInvokeResultSchema,
  type OperationInvokeInput,
  type OperationInvokeResult,
} from './operation-invoke'

const operationInvokeParameters: readonly ActionParameter[] = [
  {
    name: 'operationRef',
    type: 'string',
    description: 'Current opaque operation reference returned by operation discovery.',
    required: true,
  },
  {
    name: 'input',
    type: 'object',
    description: 'Inputs keyed exactly as the current operation contract publishes them.',
    required: true,
  },
  {
    name: 'idempotencyKey',
    type: 'string',
    description: 'Stable bounded command identity for safe replay of this invocation.',
    required: true,
  },
]

const operationInvokeBoundaries = [
  'Requires an AE-issued bearer key with market_operations:invoke; the key identifies the caller but never grants provider authority or consequential approval.',
  'AE resolves the current operation, provider, endpoint, credentials, price, authority, and evidence server-side. The caller cannot supply or override transport, provider, credential, payment, or approval details.',
  'Every call is bound to the caller principal, current operation revision, policy generation, connection generation, input, and idempotency identity; replaying a changed command is refused.',
  'Supplier credentials and internal connection references remain server-side and are never returned in action output, MCP content, HTTP problems, usage, or evidence.',
] as const

export const operationInvokeAction = defineAction<OperationInvokeInput, OperationInvokeResult>({
  id: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId,
  name: 'Invoke an admitted Market Operation',
  summary: 'Run one current admitted Market Operation through AE policy, provider authority, durable invocation, and evidence controls.',
  boundaries: operationInvokeBoundaries,
  schema: operationInvokeInputSchema,
  outputSchema: operationInvokeResultSchema,
  parameters: operationInvokeParameters,
  readOnly: false,
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'provider_system',
    dataClasses: ['operation_input', 'operation_output', 'usage_evidence'],
    spendExposure: 'bounded',
    approval: 'mandate_eligible',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission: {
    scope: OPERATION_INVOKE_ROUTE_CONTRACT.scope,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.contractVersion,
    consequenceClass: 'external_effect',
    materialInputPaths: ['operationRef', 'input', 'idempotencyKey'],
    authorityRequirement: 'principal',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['operation_invocation_result', 'operation_invocation_evidence_hash', 'operation_usage'],
    safeContinuations: ['inspect_invocation', 'reconcile_invocation'],
    invalidationConditions: [
      'action_contract_version_changed',
      'operation_ref_changed',
      'operation_revision_changed',
      'policy_generation_changed',
      'provider_connection_generation_changed',
      'input_changed',
      'idempotency_key_changed',
    ],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.operationInvokeService === undefined) throw new Error('operation_invoke_service_unavailable')
    return await executeOperationInvoke({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    }, context.operationInvokeService)
  },
})
