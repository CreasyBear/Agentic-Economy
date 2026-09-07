import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { exactAmountSchema } from '@/modules/money/public'
import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  callReceiptSchema,
  callResultSchema,
  callUsageSchema,
} from './call-contracts'
import {
  callStatusRefusalCodeSchema,
  callStatusStateSchema,
  type CallRecoveryResult,
  type CallStatusResult,
} from './call-recovery-contracts'
import type { ReconciliationEvidence } from '@/modules/action-execution/runtime'
import { CALL_ROUTE_CONTRACT } from './call-entry'

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum)

export const callStatusResultSchema: z.ZodType<CallStatusResult> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('found'),
    callRef: boundedText(300),
    version: z.number().int().nonnegative(),
    toolRef: boundedText(300),
    previousInput: z.record(z.string(), jsonValueSchema).exactOptional(),
    state: callStatusStateSchema,
    usage: callUsageSchema.exactOptional(),
    evidenceHash: boundedText(300).exactOptional(),
    attemptRef: boundedText(300).exactOptional(),
    effectGeneration: z.number().int().positive().exactOptional(),
    result: callResultSchema.exactOptional(),
    receipt: callReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('unchanged'),
    callRef: boundedText(300),
    version: z.number().int().nonnegative(),
    retryAfterMs: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    callRef: boundedText(300),
    code: callStatusRefusalCodeSchema,
    retryable: z.boolean(),
    nextAction: boundedText(300).exactOptional(),
    receipt: callReceiptSchema.exactOptional(),
  }),
])

const publicReconciliationStateSchema = z.strictObject({
  attemptRef: boundedText(300),
  effectGeneration: z.number().int().positive(),
  requiredAt: boundedText(100),
  retry: z.literal('reconcile_before_retry'),
  evidenceSource: boundedText(300),
})

export const callRecoveryResultSchema: z.ZodType<CallRecoveryResult> = z.union([
  callStatusResultSchema,
  z.strictObject({
    kind: z.literal('reconciliation_required'),
    callRef: boundedText(300),
    toolRef: boundedText(300),
    evidence: publicReconciliationStateSchema,
    receipt: callReceiptSchema.exactOptional(),
  }),
])

export type CallStatusActionInput = Readonly<{
  callRef: string
  afterVersion?: number
}>

export type CallCancelActionInput = Readonly<{
  callRef: string
  idempotencyKey: string
}>
export const callReconciliationEvidenceSchema: z.ZodType<ReconciliationEvidence> = z.strictObject({
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

export const x402CallReconciliationEvidenceSchema = z.strictObject({
  kind: z.literal('x402_payment_reconciliation'),
  version: z.literal(1),
  evidenceRef: boundedText(300),
  source: boundedText(300),
  invocationRef: boundedText(300),
  attemptRef: boundedText(300),
  effectGeneration: z.number().int().positive(),
  operationRef: boundedText(300),
  inputDigest: boundedText(300),
  requestDigest: boundedText(300),
  transportObservationDigest: boundedText(300),
  paymentObservationDigest: boundedText(300),
  providerRef: boundedText(300),
  paymentIdentifier: boundedText(300),
  reservationRef: boundedText(300),
  challengeDigest: boundedText(300),
  amount: exactAmountSchema,
  settlementStatus: z.enum(['settled', 'not_settled']),
  paymentResponseDigest: boundedText(300),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  observedAt: boundedText(80).refine((value) => Number.isFinite(Date.parse(value)), 'observedAt must be an ISO timestamp.'),
  digest: boundedText(300),
}).superRefine((evidence, context) => {
  const { digest, ...material } = evidence
  if (canonicalDigest(material) !== digest) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['digest'], message: 'digest does not match x402 reconciliation evidence.' })
  }
})

export const callReconciliationEvidenceInputSchema = z.union([
  callReconciliationEvidenceSchema,
  x402CallReconciliationEvidenceSchema,
])

export type CallReconciliationEvidenceInput = z.infer<
  typeof callReconciliationEvidenceInputSchema
>

export type CallReconcileActionInput = Readonly<{
  callRef: string
  evidence: CallReconciliationEvidenceInput
  idempotencyKey: string
}>

export const callStatusInputSchema: z.ZodType<CallStatusActionInput> = z.strictObject({
  callRef: boundedText(300),
  afterVersion: z.number().int().nonnegative().exactOptional(),
})

export const callCancelInputSchema: z.ZodType<CallCancelActionInput> = z.strictObject({
  callRef: boundedText(300),
  idempotencyKey: boundedText(200),
})

export const callReconcileInputSchema: z.ZodType<CallReconcileActionInput> = z.strictObject({
  callRef: boundedText(300),
  evidence: callReconciliationEvidenceInputSchema,
  idempotencyKey: boundedText(200),
})

const recoveryBoundaries = [
  'Requires an AE-issued bearer key with market_tools:call; the key identifies the caller and does not grant provider authority.',
  'AE resolves the Call owner, Tool, Provider connection, authority, and evidence lineage server-side.',
  'These actions never accept endpoint, provider, credential, payment, or transport overrides.',
  'Provider credentials and internal connection references remain server-side; only normalized result and evidence projections admitted by the runtime may be returned.',
] as const
const statusParameters: readonly ActionParameter[] = [
  {
    name: 'callRef',
    type: 'string',
    description: 'Opaque Call reference returned by tool.call.',
    required: true,
  },
  {
    name: 'afterVersion',
    type: 'number',
    description: 'Return an unchanged response when no newer Call version is available.',
    required: false,
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
  scope: CALL_ROUTE_CONTRACT.scope,
  authority: 'descriptor_classified',
} as const

const correlationId = (context: { correlationId?: string }): string => (
  context.correlationId ?? globalThis.crypto.randomUUID()
)

export const callStatusAction = defineAction<CallStatusActionInput, CallStatusResult>({
  id: CALL_ROUTE_CONTRACT.status.actionId,
  name: 'Read Call status',
  summary: 'Read the bounded status, usage, and evidence projection for your own Call.',
  boundaries: recoveryBoundaries,
  schema: callStatusInputSchema,
  outputSchema: callStatusResultSchema,
  parameters: statusParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: ['call_status', 'usage_evidence'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission,
  invocationContract: {
    version: CALL_ROUTE_CONTRACT.status.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['callRef'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['call_status'],
    safeContinuations: ['call.cancel', 'call.reconcile'],
    invalidationConditions: ['grant_generation_changed', 'call_owner_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.callService === undefined) throw new Error('call_service_unavailable')
    return await context.callService.readCallStatus({
      callRef: data.callRef,
      ...(data.afterVersion === undefined ? {} : { afterVersion: data.afterVersion }),
      principal: context.agentAccessPrincipal,
      correlationId: correlationId(context),
    })
  },
})

export const callCancelAction = defineAction<CallCancelActionInput, CallRecoveryResult>({
  id: CALL_ROUTE_CONTRACT.cancel.actionId,
  name: 'Cancel Call',
  summary: 'Cancel your own Call before release, or receive a reconciliation state when release may have started.',
  boundaries: recoveryBoundaries,
  schema: callCancelInputSchema,
  outputSchema: callRecoveryResultSchema,
  parameters: commandParameters,
  readOnly: false,
  effect: {
    class: 'commitment',
    reversible: false,
    recipientKind: 'none',
    dataClasses: ['call_control'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  mcp: { idempotent: true, openWorld: false, destructive: true },
  credentialAdmission,
  invocationContract: {
    version: CALL_ROUTE_CONTRACT.cancel.contractVersion,
    consequenceClass: 'external_effect',
    materialInputPaths: ['callRef', 'idempotencyKey'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['call_cancellation'],
    safeContinuations: ['call.status', 'call.reconcile'],
    invalidationConditions: ['grant_generation_changed', 'call_owner_changed', 'idempotency_key_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.callService === undefined) throw new Error('call_service_unavailable')
    return await context.callService.cancelCall({
      callRef: data.callRef,
      idempotencyKey: data.idempotencyKey,
      principal: context.agentAccessPrincipal,
      correlationId: correlationId(context),
    })
  },
})

export const callReconcileAction = defineAction<CallReconcileActionInput, CallRecoveryResult>({
  id: CALL_ROUTE_CONTRACT.reconcile.actionId,
  name: 'Reconcile Call',
  summary: 'Submit bounded reconciliation evidence for your own uncertain Call before retrying.',
  boundaries: recoveryBoundaries,
  schema: callReconcileInputSchema,
  outputSchema: callRecoveryResultSchema,
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
  mcp: { idempotent: true, openWorld: false, destructive: false },
  credentialAdmission,
  invocationContract: {
    version: CALL_ROUTE_CONTRACT.reconcile.contractVersion,
    consequenceClass: 'external_effect',
    materialInputPaths: ['callRef', 'evidence', 'idempotencyKey'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['call_reconciliation'],
    safeContinuations: ['call.status', 'call.reconcile'],
    invalidationConditions: ['grant_generation_changed', 'call_owner_changed', 'idempotency_key_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.callService === undefined) throw new Error('call_service_unavailable')
    return await context.callService.reconcileCall({
      callRef: data.callRef,
      evidence: data.evidence,
      idempotencyKey: data.idempotencyKey,
      principal: context.agentAccessPrincipal,
      correlationId: correlationId(context),
    })
  },
})
