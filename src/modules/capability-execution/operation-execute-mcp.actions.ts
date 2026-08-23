import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  operationExecuteInputSchema,
  type OperationExecuteInput,
  type OperationExecuteResult,
} from './operation-execute.functions'

const operationExecuteRefusedReasons = [
  'operation_not_found',
  'operation_not_keyless',
  'operation_not_executable',
  'input_invalid',
  'endpoint_invalid',
] as const

const operationExecuteErrorCodes = [
  'fetch_failed',
  'response_invalid',
  'provider_error',
  'source_unavailable',
] as const

/** Explicit envelope returned by the canonical keyless operation executor. */
export const operationExecuteResultSchema: z.ZodType<OperationExecuteResult> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('ok'),
    operationRef: z.string(),
    capabilityId: z.string(),
    name: z.string(),
    output: z.unknown(),
    evidenceHash: z.string(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    operationRef: z.string(),
    reason: z.enum(operationExecuteRefusedReasons),
  }),
  z.strictObject({
    kind: z.literal('error'),
    operationRef: z.string(),
    code: z.enum(operationExecuteErrorCodes),
    retryable: z.boolean(),
    reason: z.string(),
  }),
])

const operationExecuteParameters: readonly ActionParameter[] = [
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
    required: false,
  },
]

const operationExecuteBoundaries = [
  'Call ae_registry_operations_detail first and proceed only when that exact current descriptor includes an execute relation; this tool then rereads and validates the authoritative descriptor before any request.',
  'Only public HTTPS keyless http-json:v1 GET or POST operations with effects containing neither financial_exposure nor external_state_change are eligible. The caller cannot supply or override the endpoint, method, credential, headers, payment, or provider configuration.',
  'Observation only. Does not book, pay, dispatch, contact a provider, fulfil a request, or claim fulfilment.',
  'Search results and operation references are hints, not execution authority; stale, withdrawn, keyed, x402, effectful, private, or otherwise non-executable references are refused.',
] as const

export const operationExecuteAction = defineAction<OperationExecuteInput, OperationExecuteResult>({
  id: 'operation.execute',
  name: 'Execute an admitted read operation',
  summary: 'Run one current admitted keyless, read-only http-json GET or POST operation with no financial_exposure or external_state_change effects through the canonical executor and return its literal evidence envelope.',
  boundaries: operationExecuteBoundaries,
  schema: operationExecuteInputSchema as z.ZodType<OperationExecuteInput>,
  outputSchema: operationExecuteResultSchema,
  parameters: operationExecuteParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: ['operation_input', 'public_operation_output'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['mcp'],
  invocationContract: {
    version: 'operation.execute:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['operationRef', 'input'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['operation_execution_result', 'operation_evidence_hash'],
    safeContinuations: ['inspect_operation', 'report_result'],
    invalidationConditions: ['action_contract_version_changed', 'operation_ref_changed', 'input_changed'],
  },
  run: async ({ data }) => {
    const { executeKeylessOperation } = await import('./operation-execute.server')
    return executeKeylessOperation(data)
  },
})
