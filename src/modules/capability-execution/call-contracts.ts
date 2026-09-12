import { z } from 'zod'

import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import { idempotencyKeySchema } from '@/modules/common/action'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  type PublishedTool,
  type RuntimePublishedToolDescriptor,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/public'
import {
  exactAmountSchema,
  type ExactAmount,
  type ChargeState,
} from '@/modules/money/public'

export const callRefusalCodeValues = [
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
export const callRefusalCodeSchema = z.enum(callRefusalCodeValues)

const callChargeStateSchema = z.enum([
  'free_tier',
  'paid',
  'insufficient_credit',
  'outcome_unknown',
  'refunded',
])

export const callInputSchema: z.ZodType<CallInput> = z.strictObject({
  quoteRef: z.string().regex(/^operation-commitment:v1:[0-9a-f]{64}$/u),
  idempotencyKey: idempotencyKeySchema,
})

export const resolvedCallInputSchema: z.ZodType<ResolvedCallInput> = z.strictObject({
  quoteRef: z.string().regex(/^operation-commitment:v1:[0-9a-f]{64}$/u),
  decisionPrice: exactAmountSchema.exactOptional(),
  toolRef: z.string().trim().min(1).max(300),
  input: z.record(z.string(), jsonValueSchema),
  idempotencyKey: idempotencyKeySchema,
})

const authorityRequestSchema = z.strictObject({
  kind: z.enum(['approval_required', 'spending_policy']),
  toolRef: z.string(),
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

export type CallInput = Readonly<{
  quoteRef: string
  idempotencyKey: string
}>
export type ResolvedCallInput = Readonly<{
  quoteRef: string
  decisionPrice?: ExactAmount
  toolRef: string
  input: Record<string, JsonValue>
  idempotencyKey: string
}>
export type PublicAuthorityRequest = Readonly<{
  kind: 'approval_required' | 'spending_policy'
  toolRef: string
  consequence: RuntimePublishedToolDescriptor['consequenceClass']
  retryClass: RuntimePublishedToolDescriptor['retryClass']
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

export type CallUsageSummary = Readonly<{
  usageRef: string
  observedAt: number
  chargeState: ChargeState
  amount: ExactAmount
  priceDigest: string
  transactionRef?: string
  durationMs?: number
}>

export const callReceiptStateValues = [
  'settled',
  'refunded',
  'reconciliation_required',
] as const
export const callReceiptStateSchema = z.enum(callReceiptStateValues)

export const callReceiptAsset = BASE_MAINNET_USDC_ADDRESS
export const callReceiptBaseSepoliaAsset = BASE_SEPOLIA_USDC_ADDRESS

export type CallReceiptPaymentProfile =
  | Readonly<{
      network: typeof BASE_MAINNET_NETWORK
      asset: typeof callReceiptAsset
    }>
  | Readonly<{
      network: typeof BASE_SEPOLIA_NETWORK
      asset: typeof callReceiptBaseSepoliaAsset
    }>

export function callReceiptPaymentProfile(
  environment: AgentAccessPrincipal['environment'],
  network: string,
  asset: string,
): CallReceiptPaymentProfile | undefined {
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

type CallReceiptFields = Readonly<{
  receiptRef: string
  state: (typeof callReceiptStateValues)[number]
  priceDigest: string
  transactionRef?: string
  accountingTransactionRefs?: string[]
  refundState?: 'released' | 'not_applicable' | 'unknown'
  lossState?: 'none' | 'provider_output_invalid' | 'unknown'
  externalSettlementRef?: string
  evidenceHash: string
  issuedAt: string
}>

export type CallReceipt = CallReceiptFields & (
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
      providerSettlement: CallReceiptPaymentProfile & Readonly<{
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
    }> & CallReceiptPaymentProfile)
)

const callReceiptFields = {
  receiptRef: z.string().min(1),
  state: callReceiptStateSchema,
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

export const callReceiptSchema: z.ZodType<CallReceipt> = z.union([
  z.strictObject({
    ...callReceiptFields,
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
        asset: z.literal(callReceiptAsset),
      }),
      z.strictObject({
        ...providerSettlementFields,
        network: z.literal(BASE_SEPOLIA_NETWORK),
        asset: z.literal(callReceiptBaseSepoliaAsset),
      }),
    ]),
  }),
  z.strictObject({
    ...callReceiptFields,
    commercialModel: z.literal('seller_canary_x402'),
    providerQuotedAmount: exactAmountSchema,
    agenticEconomyFee: exactAmountSchema,
    totalBuyerAuthorization: exactAmountSchema,
    settlementTransactionHash: z.string().min(1).exactOptional(),
    paymentIdentifier: z.string().min(1).exactOptional(),
    network: z.literal(BASE_MAINNET_NETWORK),
    asset: z.literal(callReceiptAsset),
  }),
  z.strictObject({
    ...callReceiptFields,
    commercialModel: z.literal('seller_canary_x402'),
    providerQuotedAmount: exactAmountSchema,
    agenticEconomyFee: exactAmountSchema,
    totalBuyerAuthorization: exactAmountSchema,
    settlementTransactionHash: z.string().min(1).exactOptional(),
    paymentIdentifier: z.string().min(1).exactOptional(),
    network: z.literal(BASE_SEPOLIA_NETWORK),
    asset: z.literal(callReceiptBaseSepoliaAsset),
  }),
]).meta({ id: 'CallReceipt' })

export const callUsageSchema: z.ZodType<CallUsageSummary> = z.strictObject({
  usageRef: z.string().min(1),
  observedAt: z.number().int().nonnegative(),
  chargeState: callChargeStateSchema,
  amount: exactAmountSchema,
  priceDigest: z.string().min(1),
  transactionRef: z.string().min(1).exactOptional(),
  durationMs: z.number().int().nonnegative().exactOptional(),
}).meta({ id: 'CallUsage' })

export const callResultKindValues = [
  'completed',
  'pending',
  'needs_authority',
  'reconciliation_required',
  'refused',
] as const
export const callResultSchema: z.ZodType<CallResult> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal(callResultKindValues[0]),
    callRef: z.string(),
    toolRef: z.string(),
    output: jsonValueSchema,
    evidenceHash: z.string(),
    usage: callUsageSchema,
    receipt: callReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal(callResultKindValues[1]),
    callRef: z.string(),
    toolRef: z.string(),
    retryAfterMs: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal(callResultKindValues[2]),
    callRef: z.string(),
    toolRef: z.string(),
    authorityRequest: authorityRequestSchema,
  }),
  z.strictObject({
    kind: z.literal(callResultKindValues[3]),
    callRef: z.string(),
    toolRef: z.string(),
    evidence: reconciliationStateSchema,
    receipt: callReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal(callResultKindValues[4]),
    toolRef: z.string().exactOptional(),
    code: callRefusalCodeSchema,
    retryable: z.boolean(),
    nextAction: z.string().exactOptional(),
    receipt: callReceiptSchema.exactOptional(),
  }),
])

export type CallRefusalCode = (typeof callRefusalCodeValues)[number]

export type CallResult =
  | Readonly<{
      kind: 'completed'
      callRef: string
      toolRef: string
      output: JsonValue
      evidenceHash: string
      usage: CallUsageSummary
      receipt?: CallReceipt
    }>
  | Readonly<{
      kind: 'pending'
      callRef: string
      toolRef: string
      retryAfterMs: number
    }>
  | Readonly<{
      kind: 'needs_authority'
      callRef: string
      toolRef: string
      authorityRequest: PublicAuthorityRequest
    }>
  | Readonly<{
      kind: 'reconciliation_required'
      callRef: string
      toolRef: string
      evidence: PublicReconciliationState
      receipt?: CallReceipt
    }>
  | Readonly<{
      kind: 'refused'
      toolRef?: string
      code: CallRefusalCode
      retryable: boolean
      nextAction?: string
      receipt?: CallReceipt
    }>

const callOwnerHandoffSchema = z.strictObject({
  kind: z.literal('authorize'),
  callRef: z.string(),
  toolRef: z.string(),
})

export const callMachineResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('completed'),
    callRef: z.string(),
    toolRef: z.string(),
    output: jsonValueSchema,
    evidenceHash: z.string(),
    usage: callUsageSchema,
    receipt: callReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('pending'),
    callRef: z.string(),
    toolRef: z.string(),
    retryAfterMs: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal('outcome_unknown'),
    callRef: z.string(),
    toolRef: z.string(),
    evidence: reconciliationStateSchema,
    receipt: callReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    toolRef: z.string().exactOptional(),
    callRef: z.string().exactOptional(),
    code: callRefusalCodeSchema,
    retryable: z.boolean(),
    nextAction: z.string().exactOptional(),
    ownerHandoff: callOwnerHandoffSchema.exactOptional(),
    receipt: callReceiptSchema.exactOptional(),
  }),
]).meta({ id: 'CallMachineResult' })

export type CallMachineResult = z.infer<typeof callMachineResultSchema>

export function projectCallMachineResult(
  result: CallResult,
): CallMachineResult {
  if (result.kind === 'needs_authority') {
    return callMachineResultSchema.parse({
      kind: 'refused',
      callRef: result.callRef,
      toolRef: result.toolRef,
      code: 'authority_required',
      retryable: false,
      nextAction: 'Ask the Account owner to authorize this exact Call.',
      ownerHandoff: {
        kind: 'authorize',
        callRef: result.callRef,
        toolRef: result.toolRef,
      },
    })
  }
  if (result.kind === 'reconciliation_required') {
    return callMachineResultSchema.parse({
      ...result,
      kind: 'outcome_unknown',
    })
  }
  return callMachineResultSchema.parse(result)
}
export const toolEnvironmentMismatchNextAction =
  'Use a grant issued for the Tool runtime environment.'

export function isPrincipalEnvironmentCompatibleWithTool(
  principalEnvironment: AgentAccessPrincipal['environment'],
  operation: Pick<PublishedTool, 'runtimeEnvironment'>,
): boolean {
  return principalEnvironment === operation.runtimeEnvironment
}
