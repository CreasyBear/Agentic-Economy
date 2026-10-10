import { z } from 'zod'

import { brandNonEmpty, type Brand } from '@/modules/common/ids'

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
  'payment_unavailable',
  'price_changed',
  'payee_changed',
  'reconciliation_required',
  'invocation_not_found',
  'invocation_cancelled',
  'lease_not_current',
  'result_invalid',
  'source_unavailable',
] as const
export const callRefusalCodeSchema = z.enum(callRefusalCodeValues)

const priceChangedCodes = new Set(['payment_amount_mismatch', 'payment_exceeds_step_ceiling'])
/** AE declined to sign or submit: custody, caps, screening, fences. Never the Provider's fault. */
const paymentUnavailableCodes = new Set([
  'payment_signature_unavailable', 'payment_custody_unavailable', 'payment_submission_fence_failed',
  'payment_submission_fence_unavailable', 'credential_unavailable', 'signing_material_invalid',
])
/** Retry the same request: price_changed needs a new Quote first, so it is not retryable as-is. */
const retryableRefusalCodes: ReadonlySet<CallRefusalCode> = new Set<CallRefusalCode>([
  'rate_limited', 'concurrency_limited', 'treasury_capacity_unavailable',
  'invocation_runtime_unavailable', 'authority_reader_unavailable', 'source_unavailable',
])
/** The Provider's endpoint answered badly or not at all (a gateway timeout is upstream, RFC 9110 15.6.5). */
const providerFaultPattern = /^(provider_|operation_transport_)/u

/**
 * Maps a transport or recorded refusal code to its public category.
 * Private detail stays in audit; AE-side faults never read as a Provider refusal.
 * Invariant: this projection changes no state, receipt, authority or retry fact.
 */
export function publicCallRefusalCode(code: string | undefined): CallRefusalCode {
  if (code === 'payment_requirement_outside_authority') return 'pre_release_failed'
  // An unrecorded cause is AE's recording gap, never blamed on the Provider.
  if (code === undefined || /^operation_worker_/u.test(code)) return 'invocation_runtime_unavailable'
  if (priceChangedCodes.has(code)) return 'price_changed'
  if (paymentUnavailableCodes.has(code) || /^(spend|screening)_/u.test(code)) return 'payment_unavailable'
  const known = callRefusalCodeSchema.safeParse(code)
  // Provider faults (providerFaultPattern) and other unlisted codes read as the Provider's refusal.
  return known.success ? known.data : 'provider_refused'
}

/** A Provider failure lowers that Provider's reliability; AE-side faults (worker, custody, caps, screening) never count. */
export function isProviderFault(privateCode: string): boolean {
  return providerFaultPattern.test(privateCode) || privateCode === 'payee_changed'
}

/** One fresh Quote can clear an expired Quote or a changed price; a receipt means payment began, so never re-quote. */
export function requotableRefusal(result: Readonly<{ kind: string; code?: string; receipt?: unknown }>): boolean {
  return result.kind === 'refused' && result.receipt === undefined
    && (result.code === 'price_changed' || result.code === 'operation_not_current')
}

const paymentReasonCopy: Readonly<Record<string, string>> = {
  spend_call_cap_exceeded: 'the per-Call custody cap',
  spend_new_payee_cap_exceeded: 'the new-payee custody cap',
  spend_payee_cap_exceeded: 'the daily per-payee custody cap',
  spend_platform_cap_exceeded: 'the daily platform custody cap',
}

function refusalWhatHappened(code: CallRefusalCode, privateCode: string | undefined): string {
  switch (code) {
    case 'payment_unavailable': {
      const cap = privateCode === undefined ? undefined : paymentReasonCopy[privateCode]
      if (cap !== undefined) return `Agentic Economy did not sign the payment because it would exceed ${cap} (${privateCode})`
      if (privateCode !== undefined && privateCode.startsWith('screening_')) return `Agentic Economy did not sign the payment because payee screening did not pass (${privateCode})`
      return `Agentic Economy could not sign the payment${privateCode === undefined ? '' : ` (${privateCode})`}`
    }
    case 'price_changed': return "The Provider's live price no longer matches the Quote"
    case 'payee_changed': return "The Provider's payment address no longer matches the Quote"
    default: return `The Call was refused (${code})`
  }
}

function refusalNextStep(code: CallRefusalCode, privateCode: string | undefined): string {
  switch (code) {
    case 'payment_unavailable':
      return privateCode !== undefined && privateCode in paymentReasonCopy
        ? 'Choose a cheaper Tool or try again after the cap resets.'
        : 'Try again later or contact Help.'
    case 'price_changed': return 'Request a new Quote at the current price.'
    case 'payee_changed': return 'Check the Provider before requesting a new Quote.'
    default: return retryableRefusalCodes.has(code) ? 'Retry shortly.' : 'Choose another Tool or contact Help.'
  }
}

/**
 * Builds the public refusal for a terminal Call: category, retryable derived from it,
 * and one sentence saying what happened, whether anything was charged, and the next step.
 */
export function categorizedCallRefusal(
  privateCode: string | undefined,
  charged: boolean,
): Readonly<{ code: CallRefusalCode; retryable: boolean; nextAction: string }> {
  const code = publicCallRefusalCode(privateCode)
  const detail = privateCode === code ? undefined : privateCode
  return {
    code,
    retryable: !charged && retryableRefusalCodes.has(code),
    nextAction: `${refusalWhatHappened(code, detail)}. ${charged ? 'This Call was charged; see its receipt.' : 'Nothing was charged.'} ${refusalNextStep(code, detail)}`,
  }
}
const callRefPattern = /^operation-invocation:v1:[0-9a-f]{64}$/u
const quoteRefPattern = /^operation-commitment:v1:[0-9a-f]{64}$/u

export type CallRef = Brand<string, 'CallRef'>
export type QuoteRef = Brand<string, 'QuoteRef'>

export function parseCallRef(value: string):
  | Readonly<{ kind: 'valid'; ref: CallRef }>
  | Readonly<{ kind: 'malformed' }> {
  const ref = value.trim()
  return callRefPattern.test(ref)
    ? { kind: 'valid', ref: brandNonEmpty(ref, 'CallRef') }
    : { kind: 'malformed' }
}

export function parseQuoteRef(value: string):
  | Readonly<{ kind: 'valid'; ref: QuoteRef }>
  | Readonly<{ kind: 'malformed' }> {
  const ref = value.trim()
  return quoteRefPattern.test(ref)
    ? { kind: 'valid', ref: brandNonEmpty(ref, 'QuoteRef') }
    : { kind: 'malformed' }
}

const callChargeStateSchema = z.enum([
  'free_tier',
  'paid',
  'insufficient_credit',
  'outcome_unknown',
  'refunded',
])

export const callInputSchema: z.ZodType<CallInput> = z.strictObject({
  quoteRef: z.string().regex(quoteRefPattern),
  idempotencyKey: idempotencyKeySchema,
})

export const resolvedCallInputSchema: z.ZodType<ResolvedCallInput> = z.strictObject({
  quoteRef: z.string().regex(quoteRefPattern),
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
  lossState?: 'none' | 'provider_output_invalid' | 'provider_http_error' | 'unknown'
  externalSettlementRef?: string
  evidenceHash: string
  issuedAt: string
}>

export type CallReceipt = CallReceiptFields & Readonly<{
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

const callReceiptFields = {
  receiptRef: z.string().min(1),
  state: callReceiptStateSchema,
  priceDigest: z.string().min(1),
  transactionRef: z.string().min(1).exactOptional(),
  accountingTransactionRefs: z.array(z.string().min(1)).min(1).exactOptional(),
  refundState: z.enum(['released', 'not_applicable', 'unknown']).exactOptional(),
  lossState: z.enum(['none', 'provider_output_invalid', 'provider_http_error', 'unknown']).exactOptional(),
  externalSettlementRef: z.string().min(1).exactOptional(),
  evidenceHash: z.string().min(1),
  issuedAt: z.string().min(1),
} as const

const providerSettlementFields = {
  amount: exactAmountSchema,
  transactionHash: z.string().min(1).exactOptional(),
  paymentIdentifier: z.string().min(1).exactOptional(),
} as const

export const callReceiptSchema: z.ZodType<CallReceipt> = z.strictObject({
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
}).meta({ id: 'CallReceipt' })

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
/** Content expiry preserves the completed purchase, usage, receipt and digests.
 * A completed result contains either its original output or an expiry marker. */
export type CompletedCallResult = Readonly<{
  kind: 'completed'
  callRef: string
  toolRef: string
  evidenceHash: string
  usage: CallUsageSummary
  receipt?: CallReceipt
}> & (
  | Readonly<{ output: JsonValue; contentExpiredAt?: never }>
  | Readonly<{ output?: never; contentExpiredAt: number }>
)

const completedCallFields = {
  kind: z.literal('completed'),
  callRef: z.string(),
  toolRef: z.string(),
  evidenceHash: z.string(),
  usage: callUsageSchema,
  receipt: callReceiptSchema.exactOptional(),
} as const

const completedCallResultSchema: z.ZodType<CompletedCallResult> = z.union([
  z.strictObject({ ...completedCallFields, output: jsonValueSchema }),
  z.strictObject({
    ...completedCallFields,
    contentExpiredAt: z.number().int().nonnegative().describe('Call content was deleted under the retention policy; the completed purchase and receipt remain valid.'),
  }),
])

export const callResultSchema: z.ZodType<CallResult> = z.union([
  completedCallResultSchema,
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
  | CompletedCallResult
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

export const callNextSchema = z.strictObject({
  action: z.literal('call.status'),
  args: z.strictObject({ callRef: z.string().regex(callRefPattern), afterVersion: z.number().int().nonnegative().exactOptional() }),
  authority: z.literal('same_principal'),
  retryAfterMs: z.number().int().positive().exactOptional(),
})
export type CallNext = z.infer<typeof callNextSchema>

const callOwnerHandoffSchema = z.strictObject({
  actor: z.literal('account_owner'),
  reason: z.literal('authority_required'),
  destination: z.literal('/agent-access'),
  callRef: z.string(),
  toolRef: z.string(),
})

export const callMachineResultSchema = z.union([
  completedCallResultSchema,
  z.strictObject({
    kind: z.literal('pending'),
    callRef: z.string(),
    toolRef: z.string(),
    retryAfterMs: z.number().int().positive(),
    next: z.array(callNextSchema).max(1),
  }),
  z.strictObject({
    kind: z.literal('outcome_unknown'),
    callRef: z.string(),
    toolRef: z.string(),
    evidence: reconciliationStateSchema,
    next: z.array(callNextSchema).max(1),
    receipt: callReceiptSchema.exactOptional(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    toolRef: z.string().exactOptional(),
    callRef: z.string().exactOptional(),
    code: callRefusalCodeSchema,
    retryable: z.boolean(),
    detail: z.string().exactOptional(),
    next: z.array(callNextSchema).max(1).exactOptional(),
    ownerHandoff: callOwnerHandoffSchema.exactOptional(),
    receipt: callReceiptSchema.exactOptional(),
  }),
]).meta({ id: 'CallMachineResult' })

export type CallMachineResult = z.infer<typeof callMachineResultSchema>

export function projectCallMachineResult(
  result: CallResult,
): CallMachineResult {
  const call = 'callRef' in result ? parseCallRef(result.callRef) : undefined
  if (result.kind === 'needs_authority') {
    return callMachineResultSchema.parse({
      kind: 'refused',
      callRef: result.callRef,
      toolRef: result.toolRef,
      code: 'authority_required',
      retryable: false,
      detail: 'Ask the Account owner to approve this Call at /agent-access.',
      next: call?.kind === 'valid' ? [{ action: 'call.status', args: { callRef: call.ref }, authority: 'same_principal' }] : [],
      ownerHandoff: {
        actor: 'account_owner',
        reason: 'authority_required',
        destination: '/agent-access',
        callRef: result.callRef,
        toolRef: result.toolRef,
      },
    })
  }
  if (result.kind === 'reconciliation_required') {
    return callMachineResultSchema.parse({
      ...result,
      kind: 'outcome_unknown',
      next: call?.kind === 'valid' ? [{ action: 'call.status', args: { callRef: call.ref }, authority: 'same_principal' }] : [],
    })
  }
  if (result.kind === 'pending') return callMachineResultSchema.parse({
    ...result,
    next: call?.kind === 'valid' ? [{ action: 'call.status', args: { callRef: call.ref }, authority: 'same_principal', retryAfterMs: result.retryAfterMs }] : [],
  })
  if (result.kind === 'refused') {
    const { nextAction, ...facts } = result
    return callMachineResultSchema.parse({ ...facts, ...(nextAction === undefined ? {} : { detail: nextAction }) })
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
