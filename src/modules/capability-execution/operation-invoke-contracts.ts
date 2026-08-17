import { z } from 'zod'

import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import {
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import {
  exactAmountSchema,
  type ExactAmount,
  type MoneyUsageEvent,
} from '@/modules/money/public'

export const operationInvokeRefusalCodeValues = [
  'operation_ref_invalid',
  'operation_not_found',
  'operation_not_current',
  'operation_not_ready',
  'operation_unsupported',
  'input_invalid',
  'grant_not_found',
  'grant_revoked',
  'grant_expired',
  'grant_generation_stale',
  'environment_mismatch',
  'rate_limited',
  'concurrency_limited',
  'budget_exceeded',
  'idempotency_conflict',
  'invocation_runtime_unavailable',
  'authority_reader_unavailable',
  'authority_required',
  'authority_denied',
  'provider_refused',
  'pre_release_failed',
  'outcome_unknown',
  'payment_lane_not_brokered',
  'reconciliation_required',
  'invocation_not_found',
  'invocation_cancelled',
  'lease_not_current',
  'result_invalid',
  'source_unavailable',
] as const
export const operationInvokeRefusalCodeSchema = z.enum(operationInvokeRefusalCodeValues)

export const operationInvokeStatusStateValues = [
  'gathering_information',
  'awaiting_authority',
  'authorized',
  'leased',
  'in_progress',
  'retryable',
  'reconciliation_required',
  'terminal',
  'cancelled',
  'invalidated',
] as const
export const operationInvokeStatusStateSchema = z.enum(operationInvokeStatusStateValues)

export const operationInvokeStatusRefusalCodeValues = [
  'invocation_not_found',
  'grant_not_found',
  'grant_revoked',
  'grant_expired',
  'grant_generation_stale',
  'environment_mismatch',
  'invocation_runtime_unavailable',
] as const
export const operationInvokeStatusRefusalCodeSchema = z.enum(operationInvokeStatusRefusalCodeValues)

const operationInvokeChargeStateSchema = z.enum([
  'free_tier',
  'paid',
  'insufficient_credit',
  'outcome_unknown',
  'refunded',
])

export const operationInvokeInputSchema: z.ZodType<OperationInvokeInput> = z.strictObject({
  operationRef: z.string().trim().min(1).max(300),
  input: z.record(z.string(), jsonValueSchema),
  idempotencyKey: z.string().trim().min(1).max(200),
})

const authorityRequestSchema = z.strictObject({
  kind: z.enum(['approve_each', 'bounded_mandate']),
  operationRef: z.string(),
  consequence: z.enum(['read_only', 'communication', 'external_effect']),
  retryClass: z.enum(['replayable', 'attributable_retry', 'reconcile_before_retry']),
  maximumSpend: exactAmountSchema.exactOptional(),
  dataFields: z.array(z.string()),
  expiresAt: z.string().exactOptional(),
})
const reconciliationStateSchema = z.strictObject({
  attemptRef: z.string(),
  effectGeneration: z.number(),
  requiredAt: z.string(),
  retry: z.literal('reconcile_before_retry'),
  evidenceSource: z.string(),
})

export type OperationInvokeInput = Readonly<{
  operationRef: string
  input: Record<string, JsonValue>
  idempotencyKey: string
}>
export type PublicAuthorityRequest = Readonly<{
  kind: 'approve_each' | 'bounded_mandate'
  operationRef: string
  consequence: RuntimePublishedOperationDescriptor['consequenceClass']
  retryClass: RuntimePublishedOperationDescriptor['retryClass']
  maximumSpend?: ExactAmount
  dataFields: readonly string[]
  expiresAt?: string
}>

export type PublicReconciliationState = Readonly<{
  attemptRef: string
  effectGeneration: number
  requiredAt: string
  retry: 'reconcile_before_retry'
  evidenceSource: string
}>

export type OperationInvokeUsageSummary = Readonly<{
  usageRef: string
  observedAt: number
  chargeState: MoneyUsageEvent['chargeState']
  amount: ExactAmount
  priceDigest: string
  transactionRef?: string
  durationMs?: number
}>

export const operationInvokeUsageSchema: z.ZodType<OperationInvokeUsageSummary> = z.strictObject({
  usageRef: z.string().min(1),
  observedAt: z.number().int().nonnegative(),
  chargeState: operationInvokeChargeStateSchema,
  amount: exactAmountSchema,
  priceDigest: z.string().min(1),
  transactionRef: z.string().min(1).exactOptional(),
  durationMs: z.number().int().nonnegative().exactOptional(),
})

export const operationInvokeResultKindValues = [
  'completed',
  'pending',
  'needs_authority',
  'reconciliation_required',
  'refused',
] as const
export const operationInvokeResultSchema: z.ZodType<OperationInvokeResult> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[0]),
    invocationRef: z.string(),
    operationRef: z.string(),
    output: jsonValueSchema,
    evidenceHash: z.string(),
    usage: operationInvokeUsageSchema,
  }),
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[1]),
    invocationRef: z.string(),
    operationRef: z.string(),
    retryAfterMs: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[2]),
    invocationRef: z.string(),
    operationRef: z.string(),
    authorityRequest: authorityRequestSchema,
  }),
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[3]),
    invocationRef: z.string(),
    operationRef: z.string(),
    evidence: reconciliationStateSchema,
  }),
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[4]),
    operationRef: z.string().exactOptional(),
    code: operationInvokeRefusalCodeSchema,
    retryable: z.boolean(),
    nextAction: z.string().exactOptional(),
  }),
])

export type OperationInvokeRefusalCode = (typeof operationInvokeRefusalCodeValues)[number]

export type OperationInvokeResult =
  | Readonly<{
      kind: 'completed'
      invocationRef: string
      operationRef: string
      output: JsonValue
      evidenceHash: string
      usage: OperationInvokeUsageSummary
    }>
  | Readonly<{
      kind: 'pending'
      invocationRef: string
      operationRef: string
      retryAfterMs: number
    }>
  | Readonly<{
      kind: 'needs_authority'
      invocationRef: string
      operationRef: string
      authorityRequest: PublicAuthorityRequest
    }>
  | Readonly<{
      kind: 'reconciliation_required'
      invocationRef: string
      operationRef: string
      evidence: PublicReconciliationState
    }>
  | Readonly<{
      kind: 'refused'
      operationRef?: string
      code: OperationInvokeRefusalCode
      retryable: boolean
      nextAction?: string
    }>

export const operationEnvironmentMismatchNextAction =
  'Use a grant issued for the operation runtime environment.'

export function isPrincipalEnvironmentCompatibleWithOperation(
  principalEnvironment: AgentAccessPrincipal['environment'],
  operation: Pick<PublishedOperation, 'runtimeEnvironment'>,
): boolean {
  return principalEnvironment === operation.runtimeEnvironment
}

export type OperationInvokeStatusState = z.infer<typeof operationInvokeStatusStateSchema>

export type OperationInvokeStatusResult =
  | Readonly<{
      kind: 'found'
      invocationRef: string
      operationRef: string
      state: OperationInvokeStatusState
      usage?: OperationInvokeUsageSummary
      evidenceHash?: string
      attemptRef?: string
      effectGeneration?: number
      result?: OperationInvokeResult
    }>
  | Readonly<{
      kind: 'refused'
      invocationRef: string
      code: Extract<OperationInvokeRefusalCode, 'invocation_not_found' | 'grant_not_found' | 'grant_revoked' | 'grant_expired' | 'grant_generation_stale' | 'environment_mismatch' | 'invocation_runtime_unavailable'>
      retryable: boolean
      nextAction?: string
    }>
export type OperationInvokeRecoveryResult =
  | OperationInvokeStatusResult
  | Readonly<{
      kind: 'reconciliation_required'
      invocationRef: string
      operationRef: string
      evidence: PublicReconciliationState
    }>
