import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  operationInvokeReceiptSchema,
  operationInvokeResultSchema,
  operationInvokeUsageSchema,
} from './operation-invoke-contracts'
import {
  operationInvokeStatusRefusalCodeSchema,
  operationInvokeStatusStateSchema,
  type OperationInvokeRecoveryResult,
  type OperationInvokeStatusResult,
} from './operation-recovery-contracts'
import type { ReconciliationEvidence } from '@/modules/action-invocation/reconciliation-evidence'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from './operation-invoke-entry'

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum)

export const operationInvokeStatusResultSchema: z.ZodType<OperationInvokeStatusResult> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('found'),
    invocationRef: boundedText(300),
    operationRef: boundedText(300),
    state: operationInvokeStatusStateSchema,
    usage: operationInvokeUsageSchema.exactOptional(),
    evidenceHash: boundedText(300).exactOptional(),
    attemptRef: boundedText(300).exactOptional(),
    effectGeneration: z.number().int().positive().exactOptional(),
    result: operationInvokeResultSchema.exactOptional(),
    receipt: operationInvokeReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    invocationRef: boundedText(300),
    code: operationInvokeStatusRefusalCodeSchema,
    retryable: z.boolean(),
    nextAction: boundedText(300).exactOptional(),
    receipt: operationInvokeReceiptSchema.exactOptional(),
  }),
])

const publicReconciliationStateSchema = z.strictObject({
  attemptRef: boundedText(300),
  effectGeneration: z.number().int().positive(),
  requiredAt: boundedText(100),
  retry: z.literal('reconcile_before_retry'),
  evidenceSource: boundedText(300),
})

export const operationInvokeRecoveryResultSchema: z.ZodType<OperationInvokeRecoveryResult> = z.union([
  operationInvokeStatusResultSchema,
  z.strictObject({
    kind: z.literal('reconciliation_required'),
    invocationRef: boundedText(300),
    operationRef: boundedText(300),
    evidence: publicReconciliationStateSchema,
    receipt: operationInvokeReceiptSchema.exactOptional(),
  }),
])

export type OperationStatusActionInput = Readonly<{
  invocationRef: string
}>

export type OperationCancelActionInput = Readonly<{
  invocationRef: string
  idempotencyKey: string
}>
export const operationReconciliationEvidenceSchema: z.ZodType<ReconciliationEvidence> = z.strictObject({
  kind: z.literal('action_invocation_reconciliation'),
  version: z.literal(1),
  evidenceRef: boundedText(300),
  source: boundedText(300),
  invocationRef: boundedText(300),
  attemptRef: boundedText(300),
  effectGeneration: z.number().int().positive(),
  operationRef: boundedText(300).exactOptional(),
  inputDigest: boundedText(300).exactOptional(),
  requestDigest: boundedText(300).exactOptional(),
  providerIdentity: boundedText(300).exactOptional(),
  paymentIdentifier: boundedText(300).exactOptional(),
  transportObservationDigest: boundedText(300).exactOptional(),
  paymentObservationDigest: boundedText(300).exactOptional(),
  resolution: z.enum(['not_released', 'released']),
  observedAt: boundedText(80).refine((value) => Number.isFinite(Date.parse(value)), 'observedAt must be an ISO timestamp.'),
  digest: boundedText(300),
}).superRefine((evidence, context) => {
  const { digest, ...material } = evidence
  if (canonicalDigest(material) !== digest) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['digest'], message: 'digest does not match reconciliation evidence.' })
  }
})

export type OperationReconcileActionInput = Readonly<{
  invocationRef: string
  evidence: ReconciliationEvidence
  idempotencyKey: string
}>

export const operationStatusInputSchema: z.ZodType<OperationStatusActionInput> = z.strictObject({
  invocationRef: boundedText(300),
})

export const operationCancelInputSchema: z.ZodType<OperationCancelActionInput> = z.strictObject({
  invocationRef: boundedText(300),
  idempotencyKey: boundedText(200),
})

export const operationReconcileInputSchema: z.ZodType<OperationReconcileActionInput> = z.strictObject({
  invocationRef: boundedText(300),
  evidence: operationReconciliationEvidenceSchema,
  idempotencyKey: boundedText(200),
})

const recoveryBoundaries = [
  'Requires an AE-issued bearer key with market_operations:invoke; the key identifies the caller and does not grant provider authority.',
  'AE resolves the invocation owner, operation, provider connection, authority, and evidence lineage server-side.',
  'These actions never accept endpoint, provider, credential, payment, or transport overrides.',
  'Supplier credentials and internal connection references remain server-side; only normalized result and evidence projections admitted by the runtime may be returned.',
] as const
const statusParameters: readonly ActionParameter[] = [
  {
    name: 'invocationRef',
    type: 'string',
    description: 'Opaque invocation reference returned by operation.invoke.',
    required: true,
  },
]

const commandParameters: readonly ActionParameter[] = [
  ...statusParameters,
  {
    name: 'idempotencyKey',
    type: 'string',
    description: 'Stable bounded command identity for replay-safe cancellation or reconciliation.',
    required: true,
  },
]

const reconcileParameters: readonly ActionParameter[] = [
  ...commandParameters,
  {
    name: 'evidence',
    type: 'object',
    description: 'Evidence object for the server-side reconciliation contract.',
    required: true,
  },
]

const credentialAdmission = {
  scope: OPERATION_INVOKE_ROUTE_CONTRACT.scope,
  authority: 'descriptor_classified',
} as const

const correlationId = (context: { correlationId?: string }): string => (
  context.correlationId ?? globalThis.crypto.randomUUID()
)

export const operationStatusAction = defineAction<OperationStatusActionInput, OperationInvokeStatusResult>({
  id: OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId,
  name: 'Read operation invocation status',
  summary: 'Read the bounded status, usage, and evidence projection for your own operation invocation.',
  boundaries: recoveryBoundaries,
  schema: operationStatusInputSchema,
  outputSchema: operationInvokeStatusResultSchema,
  parameters: statusParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: ['invocation_status', 'usage_evidence'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission,
  invocationContract: {
    version: OPERATION_INVOKE_ROUTE_CONTRACT.status.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['invocationRef'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['operation_invocation_status'],
    safeContinuations: ['operation.cancel', 'operation.reconcile'],
    invalidationConditions: ['grant_generation_changed', 'invocation_owner_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.operationInvokeService === undefined) throw new Error('operation_invoke_service_unavailable')
    return await context.operationInvokeService.readInvocationStatus({
      invocationRef: data.invocationRef,
      principal: context.agentAccessPrincipal,
      correlationId: correlationId(context),
    })
  },
})

export const operationCancelAction = defineAction<OperationCancelActionInput, OperationInvokeRecoveryResult>({
  id: OPERATION_INVOKE_ROUTE_CONTRACT.cancel.actionId,
  name: 'Cancel operation invocation',
  summary: 'Cancel your own operation invocation before release, or receive a reconciliation state when release may have started.',
  boundaries: recoveryBoundaries,
  schema: operationCancelInputSchema,
  outputSchema: operationInvokeRecoveryResultSchema,
  parameters: commandParameters,
  readOnly: false,
  effect: {
    class: 'commitment',
    reversible: false,
    recipientKind: 'none',
    dataClasses: ['invocation_control'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission,
  invocationContract: {
    version: OPERATION_INVOKE_ROUTE_CONTRACT.cancel.contractVersion,
    consequenceClass: 'external_effect',
    materialInputPaths: ['invocationRef', 'idempotencyKey'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['operation_invocation_cancellation'],
    safeContinuations: ['operation.status', 'operation.reconcile'],
    invalidationConditions: ['grant_generation_changed', 'invocation_owner_changed', 'idempotency_key_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.operationInvokeService === undefined) throw new Error('operation_invoke_service_unavailable')
    return await context.operationInvokeService.cancelInvocation({
      invocationRef: data.invocationRef,
      idempotencyKey: data.idempotencyKey,
      principal: context.agentAccessPrincipal,
      correlationId: correlationId(context),
    })
  },
})

export const operationReconcileAction = defineAction<OperationReconcileActionInput, OperationInvokeRecoveryResult>({
  id: OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId,
  name: 'Reconcile operation invocation',
  summary: 'Submit bounded reconciliation evidence for your own uncertain operation invocation before retrying.',
  boundaries: recoveryBoundaries,
  schema: operationReconcileInputSchema,
  outputSchema: operationInvokeRecoveryResultSchema,
  parameters: reconcileParameters,
  readOnly: false,
  effect: {
    class: 'commitment',
    reversible: false,
    recipientKind: 'none',
    dataClasses: ['reconciliation_evidence'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission,
  invocationContract: {
    version: OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.contractVersion,
    consequenceClass: 'external_effect',
    materialInputPaths: ['invocationRef', 'evidence', 'idempotencyKey'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['operation_invocation_reconciliation'],
    safeContinuations: ['operation.status', 'operation.invoke'],
    invalidationConditions: ['grant_generation_changed', 'invocation_owner_changed', 'idempotency_key_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.operationInvokeService === undefined) throw new Error('operation_invoke_service_unavailable')
    return await context.operationInvokeService.reconcileInvocation({
      invocationRef: data.invocationRef,
      evidence: data.evidence,
      idempotencyKey: data.idempotencyKey,
      principal: context.agentAccessPrincipal,
      correlationId: correlationId(context),
    })
  },
})
