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
  type ChargeState,
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
  'insufficient_balance',
  'treasury_capacity_unavailable',
  'commercial_policy_unavailable',
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
  commitmentRef: z.string().regex(/^operation-commitment:v1:[0-9a-f]{64}$/u),
  idempotencyKey: z.string().trim().min(1).max(200),
})

export const resolvedOperationInvokeInputSchema: z.ZodType<ResolvedOperationInvokeInput> = z.strictObject({
  commitmentRef: z.string().regex(/^operation-commitment:v1:[0-9a-f]{64}$/u),
  decisionPrice: exactAmountSchema.exactOptional(),
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
  commitmentRef: string
  idempotencyKey: string
}>
export type ResolvedOperationInvokeInput = Readonly<{
  commitmentRef: string
  decisionPrice?: ExactAmount
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
  chargeState: ChargeState
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
  priceDigest: string
  transactionRef?: string
  accountingTransactionRefs?: string[]
  refundState?: 'released' | 'not_applicable' | 'unknown'
  lossState?: 'none' | 'provider_output_invalid' | 'unknown'
  externalSettlementRef?: string
  evidenceHash: string
  issuedAt: string
}>

export type OperationInvokeReceipt = OperationInvokeReceiptFields & (
  | Readonly<{
      commercialModel: 'account_aud'
      buyerCharge: ExactAmount
      serviceFee: ExactAmount
      totalBuyerCharge: ExactAmount
      providerObligation: Readonly<{
        amount: ExactAmount
        settlementMethod: 'managed_x402'
        payoutEligible: false
      }>
      providerSettlement: OperationInvokeReceiptPaymentProfile & Readonly<{
        amount: ExactAmount
        transactionHash?: string
        paymentIdentifier?: string
      }>
    }>
  | (Readonly<{
      commercialModel: 'seller_canary_x402'
      providerQuotedAmount: ExactAmount
      agenticEconomyFee: ExactAmount
      totalBuyerAuthorization: ExactAmount
      settlementTransactionHash?: string
      paymentIdentifier?: string
    }> & OperationInvokeReceiptPaymentProfile)
)

const operationInvokeReceiptFields = {
  receiptRef: z.string().min(1),
  state: operationInvokeReceiptStateSchema,
  priceDigest: z.string().min(1),
  transactionRef: z.string().min(1).exactOptional(),
  accountingTransactionRefs: z.array(z.string().min(1)).min(1).exactOptional(),
  refundState: z.enum(['released', 'not_applicable', 'unknown']).exactOptional(),
  lossState: z.enum(['none', 'provider_output_invalid', 'unknown']).exactOptional(),
  externalSettlementRef: z.string().min(1).exactOptional(),
  evidenceHash: z.string().min(1),
  issuedAt: z.string().min(1),
} as const

const providerSettlementFields = {
  amount: exactAmountSchema,
  transactionHash: z.string().min(1).exactOptional(),
  paymentIdentifier: z.string().min(1).exactOptional(),
} as const

export const operationInvokeReceiptSchema: z.ZodType<OperationInvokeReceipt> = z.union([
  z.strictObject({
    ...operationInvokeReceiptFields,
    commercialModel: z.literal('account_aud'),
    buyerCharge: exactAmountSchema,
    serviceFee: exactAmountSchema,
    totalBuyerCharge: exactAmountSchema,
    providerObligation: z.strictObject({
      amount: exactAmountSchema,
      settlementMethod: z.literal('managed_x402'),
      payoutEligible: z.literal(false),
    }),
    providerSettlement: z.union([
      z.strictObject({
        ...providerSettlementFields,
        network: z.literal(BASE_MAINNET_NETWORK),
        asset: z.literal(operationInvokeReceiptAsset),
      }),
      z.strictObject({
        ...providerSettlementFields,
        network: z.literal(BASE_SEPOLIA_NETWORK),
        asset: z.literal(operationInvokeReceiptBaseSepoliaAsset),
      }),
    ]),
  }),
  z.strictObject({
    ...operationInvokeReceiptFields,
    commercialModel: z.literal('seller_canary_x402'),
    providerQuotedAmount: exactAmountSchema,
    agenticEconomyFee: exactAmountSchema,
    totalBuyerAuthorization: exactAmountSchema,
    settlementTransactionHash: z.string().min(1).exactOptional(),
    paymentIdentifier: z.string().min(1).exactOptional(),
    network: z.literal(BASE_MAINNET_NETWORK),
    asset: z.literal(operationInvokeReceiptAsset),
  }),
  z.strictObject({
    ...operationInvokeReceiptFields,
    commercialModel: z.literal('seller_canary_x402'),
    providerQuotedAmount: exactAmountSchema,
    agenticEconomyFee: exactAmountSchema,
    totalBuyerAuthorization: exactAmountSchema,
    settlementTransactionHash: z.string().min(1).exactOptional(),
    paymentIdentifier: z.string().min(1).exactOptional(),
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

const operationInvokeOwnerHandoffSchema = z.strictObject({
  kind: z.literal('authorize'),
  invocationRef: z.string(),
  operationRef: z.string(),
})

export const operationInvokeMachineResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('completed'),
    invocationRef: z.string(),
    operationRef: z.string(),
    output: jsonValueSchema,
    evidenceHash: z.string(),
    usage: operationInvokeUsageSchema,
    receipt: operationInvokeReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('pending'),
    invocationRef: z.string(),
    operationRef: z.string(),
    retryAfterMs: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal('outcome_unknown'),
    invocationRef: z.string(),
    operationRef: z.string(),
    evidence: reconciliationStateSchema,
    receipt: operationInvokeReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    operationRef: z.string().exactOptional(),
    invocationRef: z.string().exactOptional(),
    code: operationInvokeRefusalCodeSchema,
    retryable: z.boolean(),
    nextAction: z.string().exactOptional(),
    ownerHandoff: operationInvokeOwnerHandoffSchema.exactOptional(),
    receipt: operationInvokeReceiptSchema.exactOptional(),
  }),
]).meta({ id: 'OperationInvokeMachineResult' })

export type OperationInvokeMachineResult = z.infer<typeof operationInvokeMachineResultSchema>

export function projectOperationInvokeMachineResult(
  result: OperationInvokeResult,
): OperationInvokeMachineResult {
  if (result.kind === 'needs_authority') {
    return operationInvokeMachineResultSchema.parse({
      kind: 'refused',
      invocationRef: result.invocationRef,
      operationRef: result.operationRef,
      code: 'authority_required',
      retryable: false,
      nextAction: 'Ask the Account owner to authorize this exact invocation.',
      ownerHandoff: {
        kind: 'authorize',
        invocationRef: result.invocationRef,
        operationRef: result.operationRef,
      },
    })
  }
  if (result.kind === 'reconciliation_required') {
    return operationInvokeMachineResultSchema.parse({
      ...result,
      kind: 'outcome_unknown',
    })
  }
  return operationInvokeMachineResultSchema.parse(result)
}
export const operationEnvironmentMismatchNextAction =
  'Use a grant issued for the operation runtime environment.'

export function isPrincipalEnvironmentCompatibleWithOperation(
  principalEnvironment: AgentAccessPrincipal['environment'],
  operation: Pick<PublishedOperation, 'runtimeEnvironment'>,
): boolean {
  return principalEnvironment === operation.runtimeEnvironment
}
