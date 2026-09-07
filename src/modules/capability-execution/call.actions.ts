import { CALL_ROUTE_CONTRACT } from './call-entry'
import { defineAction, type ActionParameter } from '@/modules/common/action'
import { executeCall } from './call-authority'
import {
  callInputSchema,
  callMachineResultSchema,
  projectCallMachineResult,
  type CallInput,
  type CallMachineResult,
} from './call-contracts'

const callParameters: readonly ActionParameter[] = [
  {
    name: 'quoteRef',
    type: 'string',
    description: 'Unexpired caller-bound Quote returned by tool.quote.',
    required: true,
  },
  {
    name: 'idempotencyKey',
    type: 'string',
    description: 'Stable bounded command identity for safe replay of this Call.',
    required: true,
  },
]

const callBoundaries = [
  'Requires an AE-issued bearer key with market_tools:call; the key identifies the caller but never grants provider authority or consequential approval.',
  'AE resolves the current Tool, Provider, endpoint, credentials, price, authority, and evidence server-side. The caller cannot supply or override transport, Provider, credential, payment, or approval details.',
  'Every Call is bound to the caller principal, current Tool version, policy generation, connection generation, input, and idempotency identity; replaying a changed command is refused.',
  'Provider credentials and internal connection references remain server-side and are never returned in action output, MCP content, HTTP problems, usage, or evidence.',
] as const

export const callAction = defineAction<CallInput, CallMachineResult>({
  id: CALL_ROUTE_CONTRACT.call.actionId,
  name: 'Call an admitted Tool',
  summary: 'Run one current admitted Tool through AE policy, Provider authority, durable Call, and evidence controls.',
  boundaries: callBoundaries,
  schema: callInputSchema,
  outputSchema: callMachineResultSchema,
  parameters: callParameters,
  readOnly: false,
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'provider_system',
    dataClasses: ['tool_input', 'tool_output', 'usage_evidence'],
    spendExposure: 'bounded',
    approval: 'policy_eligible',
  },
  surfaces: ['http', 'mcp', 'cli', 'chat'],
  mcp: { idempotent: true, openWorld: true, destructive: true },
  credentialAdmission: {
    scope: CALL_ROUTE_CONTRACT.scope,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: CALL_ROUTE_CONTRACT.call.contractVersion,
    consequenceClass: 'external_effect',
    materialInputPaths: ['quoteRef', 'idempotencyKey'],
    authorityRequirement: 'principal',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['call_result', 'call_evidence_hash', 'call_usage'],
    safeContinuations: ['call.status', 'call.reconcile'],
    invalidationConditions: [
      'action_contract_version_changed',
      'quote_ref_changed',
      'quote_expired',
      'quote_material_changed',
      'idempotency_key_changed',
    ],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.callService === undefined) throw new Error('call_service_unavailable')
    return projectCallMachineResult(await executeCall({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    }, context.callService))
  },
})
