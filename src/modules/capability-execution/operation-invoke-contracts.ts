import { z } from 'zod'

import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
  x402PaymentProfileForEnvironment,
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
  'provider_output_invalid',
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

export const operationInvokeReceiptStateValues = [
  'settled',
  'refunded',
  'reconciliation_required',
] as const
export const operationInvokeReceiptStateSchema = z.enum(operationInvokeReceiptStateValues)

export const operationInvokeReceiptAsset = BASE_MAINNET_USDC_ADDRESS
export const operationInvokeReceiptBaseSepoliaAsset = BASE_SEPOLIA_USDC_ADDRESS

export type OperationInvokeReceiptPaymentProfile =
  | Readonly<{
      network: typeof BASE_MAINNET_NETWORK
      asset: typeof operationInvokeReceiptAsset
    }>
  | Readonly<{
      network: typeof BASE_SEPOLIA_NETWORK
      asset: typeof operationInvokeReceiptBaseSepoliaAsset
    }>

export function operationInvokeReceiptPaymentProfile(
  environment: AgentAccessPrincipal['environment'],
  network: string,
  asset: string,
): OperationInvokeReceiptPaymentProfile | undefined {
  const profile = x402PaymentProfileForEnvironment(environment)
  if (
    profile?.profile === 'base-usdc-exact'
    && network === profile.network
    && asset.toLowerCase() === profile.asset.toLowerCase()
  ) return { network: profile.network, asset: profile.asset }
  if (
    profile?.profile === 'base-sepolia-usdc-exact'
    && network === profile.network
    && asset.toLowerCase() === profile.asset.toLowerCase()
  ) return { network: profile.network, asset: profile.asset }
  return undefined
}

type OperationInvokeReceiptFields = Readonly<{
  receiptRef: string
  state: (typeof operationInvokeReceiptStateValues)[number]
  providerQuotedAmount: ExactAmount
  agenticEconomyFee: ExactAmount
  totalBuyerAuthorization: ExactAmount
  priceDigest: string
  transactionRef?: string
  settlementTransactionHash?: string
  paymentIdentifier?: string
  accountingTransactionRefs?: string[]
  refundState?: 'released' | 'not_applicable' | 'unknown'
  lossState?: 'none' | 'provider_output_invalid' | 'unknown'
  externalSettlementRef?: string
  evidenceHash: string
  issuedAt: string
}>

export type OperationInvokeReceipt = OperationInvokeReceiptFields & OperationInvokeReceiptPaymentProfile

const operationInvokeReceiptFields = {
  receiptRef: z.string().min(1),
  state: operationInvokeReceiptStateSchema,
  providerQuotedAmount: exactAmountSchema,
  agenticEconomyFee: exactAmountSchema,
  totalBuyerAuthorization: exactAmountSchema,
  priceDigest: z.string().min(1),
  transactionRef: z.string().min(1).exactOptional(),
  settlementTransactionHash: z.string().min(1).exactOptional(),
  paymentIdentifier: z.string().min(1).exactOptional(),
  accountingTransactionRefs: z.array(z.string().min(1)).min(1).exactOptional(),
  refundState: z.enum(['released', 'not_applicable', 'unknown']).exactOptional(),
  lossState: z.enum(['none', 'provider_output_invalid', 'unknown']).exactOptional(),
  externalSettlementRef: z.string().min(1).exactOptional(),
  evidenceHash: z.string().min(1),
  issuedAt: z.string().min(1),
} as const

export const operationInvokeReceiptSchema: z.ZodType<OperationInvokeReceipt> = z.discriminatedUnion('network', [
  z.strictObject({
    ...operationInvokeReceiptFields,
    network: z.literal(BASE_MAINNET_NETWORK),
    asset: z.literal(operationInvokeReceiptAsset),
  }),
  z.strictObject({
    ...operationInvokeReceiptFields,
    network: z.literal(BASE_SEPOLIA_NETWORK),
    asset: z.literal(operationInvokeReceiptBaseSepoliaAsset),
  }),
]).meta({ id: 'OperationInvokeReceipt' })

export const operationInvokeUsageSchema: z.ZodType<OperationInvokeUsageSummary> = z.strictObject({
  usageRef: z.string().min(1),
  observedAt: z.number().int().nonnegative(),
  chargeState: operationInvokeChargeStateSchema,
  amount: exactAmountSchema,
  priceDigest: z.string().min(1),
  transactionRef: z.string().min(1).exactOptional(),
  durationMs: z.number().int().nonnegative().exactOptional(),
}).meta({ id: 'OperationInvokeUsage' })

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
    receipt: operationInvokeReceiptSchema.exactOptional(),
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
    receipt: operationInvokeReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal(operationInvokeResultKindValues[4]),
    operationRef: z.string().exactOptional(),
    code: operationInvokeRefusalCodeSchema,
    retryable: z.boolean(),
    nextAction: z.string().exactOptional(),
    receipt: operationInvokeReceiptSchema.exactOptional(),
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
      receipt?: OperationInvokeReceipt
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
      receipt?: OperationInvokeReceipt
    }>
  | Readonly<{
      kind: 'refused'
      operationRef?: string
      code: OperationInvokeRefusalCode
      retryable: boolean
      nextAction?: string
      receipt?: OperationInvokeReceipt
    }>

export const operationEnvironmentMismatchNextAction =
  'Use a grant issued for the operation runtime environment.'

export function isPrincipalEnvironmentCompatibleWithOperation(
  principalEnvironment: AgentAccessPrincipal['environment'],
  operation: Pick<PublishedOperation, 'runtimeEnvironment'>,
): boolean {
  return principalEnvironment === operation.runtimeEnvironment
}
