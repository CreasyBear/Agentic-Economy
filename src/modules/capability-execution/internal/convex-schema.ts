import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { acceptedAuthorityValue } from '@/modules/action-invocation/public'
import type { CanonicalClaimAuthority } from '@/modules/action-invocation/canonical-claim'

export type OperationInvokePersistedAuthority = CanonicalClaimAuthority & Readonly<{
  format: 'operation-invoke-authority:v1'
  invocationRef: string
  operationRef: string
  inputDigest: string
  grantRef: string
  grantGeneration: number
  grantDigest: string
}>

export const jsonValue = v.any() // runtime-validated JsonValue boundary
export const jsonObject = v.record(v.string(), jsonValue)

export const exactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
export const operationInvokeAuthorityValue = v.object({
  format: v.literal('operation-invoke-authority:v1'),
  invocationRef: v.string(),
  operationRef: v.string(),
  inputDigest: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  grantDigest: v.string(),
  reference: v.string(),
  decisionDigest: v.string(),
  targetDigest: v.string(),
  consequence: v.string(),
  limits: v.record(v.string(), v.union(v.number(), exactAmountValue)),
  expiresAt: v.string(),
  acceptedBasis: acceptedAuthorityValue,
})

export const usageValue = v.object({
  usageRef: v.string(),
  observedAt: v.number(),
  chargeState: v.union(
    v.literal('free_tier'),
    v.literal('paid'),
    v.literal('insufficient_credit'),
    v.literal('outcome_unknown'),
    v.literal('refunded'),
  ),
  amount: exactAmountValue,
  priceDigest: v.string(),
  transactionRef: v.optional(v.string()),
  durationMs: v.optional(v.number()),
})
export const operationInvokeReceiptValue = v.object({
  receiptRef: v.string(),
  state: v.union(v.literal('settled'), v.literal('refunded'), v.literal('reconciliation_required')),
  network: v.literal('eip155:8453'),
  asset: v.literal('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  providerQuotedAmount: exactAmountValue,
  agenticEconomyFee: exactAmountValue,
  totalBuyerAuthorization: exactAmountValue,
  priceDigest: v.string(),
  transactionRef: v.optional(v.string()),
  settlementTransactionHash: v.optional(v.string()),
  paymentIdentifier: v.optional(v.string()),
  accountingTransactionRefs: v.optional(v.array(v.string())),
  refundState: v.optional(v.union(v.literal('released'), v.literal('not_applicable'), v.literal('unknown'))),
  lossState: v.optional(v.union(v.literal('none'), v.literal('provider_output_invalid'), v.literal('unknown'))),
  externalSettlementRef: v.optional(v.string()),
  evidenceHash: v.string(),
  issuedAt: v.string(),
})
const authorityRequestValue = v.object({
  kind: v.union(v.literal('approve_each'), v.literal('bounded_mandate')),
  operationRef: v.string(),
  consequence: v.union(v.literal('read_only'), v.literal('communication'), v.literal('external_effect')),
  retryClass: v.union(v.literal('replayable'), v.literal('attributable_retry'), v.literal('reconcile_before_retry')),
  maximumSpend: v.optional(exactAmountValue),
  dataFields: v.array(v.string()),
  expiresAt: v.optional(v.string()),
})

export const reconciliationValue = v.object({
  attemptRef: v.string(),
  effectGeneration: v.number(),
  requiredAt: v.string(),
  retry: v.literal('reconcile_before_retry'),
  evidenceSource: v.string(),
})
export const reconciliationEvidenceValue = v.object({
  kind: v.literal('action_invocation_reconciliation'),
  version: v.literal(1),
  evidenceRef: v.string(),
  source: v.string(),
  invocationRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  operationRef: v.optional(v.string()),
  inputDigest: v.optional(v.string()),
  requestDigest: v.optional(v.string()),
  providerIdentity: v.optional(v.string()),
  paymentIdentifier: v.optional(v.string()),
  transportObservationDigest: v.optional(v.string()),
  paymentObservationDigest: v.optional(v.string()),
  resolution: v.union(v.literal('not_released'), v.literal('released')),
  observedAt: v.string(),
  digest: v.string(),
})

export const operationResultValue = v.union(
  v.object({
    kind: v.literal('completed'),
    invocationRef: v.string(),
    operationRef: v.string(),
    output: jsonValue,
    evidenceHash: v.string(),
    usage: usageValue,
    receipt: v.optional(operationInvokeReceiptValue),
  }),
  v.object({ kind: v.literal('pending'), invocationRef: v.string(), operationRef: v.string(), retryAfterMs: v.number() }),
  v.object({ kind: v.literal('needs_authority'), invocationRef: v.string(), operationRef: v.string(), authorityRequest: authorityRequestValue }),
  v.object({ kind: v.literal('reconciliation_required'), invocationRef: v.string(), operationRef: v.string(), evidence: reconciliationValue, receipt: v.optional(operationInvokeReceiptValue) }),
  v.object({ kind: v.literal('refused'), operationRef: v.optional(v.string()), code: v.string(), retryable: v.boolean(), nextAction: v.optional(v.string()), receipt: v.optional(operationInvokeReceiptValue) }),
)

const statusState = v.union(
  v.literal('gathering_information'), v.literal('awaiting_authority'), v.literal('authorized'),
  v.literal('leased'), v.literal('in_progress'), v.literal('retryable'), v.literal('reconciliation_required'),
  v.literal('terminal'), v.literal('cancelled'), v.literal('invalidated'),
)

export const statusResultValue = v.union(
  v.object({
    kind: v.literal('found'), invocationRef: v.string(), operationRef: v.string(), state: statusState,
    usage: v.optional(usageValue), evidenceHash: v.optional(v.string()), attemptRef: v.optional(v.string()),
    effectGeneration: v.optional(v.number()), result: v.optional(operationResultValue), receipt: v.optional(operationInvokeReceiptValue),
  }),
  v.object({
    kind: v.literal('refused'), invocationRef: v.string(),
    code: v.union(v.literal('invocation_not_found'), v.literal('grant_not_found'), v.literal('grant_revoked'), v.literal('grant_expired'), v.literal('grant_generation_stale'), v.literal('environment_mismatch'), v.literal('invocation_runtime_unavailable')),
    retryable: v.boolean(), nextAction: v.optional(v.string()), receipt: v.optional(operationInvokeReceiptValue),
  }),
)

export const recoveryResultValue = v.union(
  statusResultValue,
  v.object({ kind: v.literal('reconciliation_required'), invocationRef: v.string(), operationRef: v.string(), evidence: reconciliationValue, receipt: v.optional(operationInvokeReceiptValue) }),
)

export const invocationReconciliationValue = v.object({
  attemptCount: v.number(),
  nextAttemptAt: v.number(),
  leaseOwner: v.optional(v.string()),
  leaseExpiresAt: v.optional(v.number()),
  disposition: v.union(v.literal('automatic'), v.literal('manual_review')),
  reason: v.union(
    v.literal('unknown_settlement'),
    v.literal('pending_accounting'),
    v.literal('refund_pending'),
    v.literal('custody_cap'),
    v.literal('recovery_failed'),
  ),
})


export const capabilityOperationInvocationTables = {
  capabilityOperationInvocations: defineTable({
    invocationRef: v.string(),
    principalId: v.string(),
    ownerId: v.string(),
    credentialId: v.string(),
    applicationRef: v.string(),
    operationRef: v.string(),
    idempotencyKey: v.string(),
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    grantRef: v.string(),
    grantGeneration: v.number(),
    policyDigest: v.string(),
    grantExpiresAt: v.number(),
    operationJson: v.optional(v.string()),
    inputJson: v.optional(v.string()),
    inputDigest: v.string(),
    requestDigest: v.string(),
    authority: v.optional(operationInvokeAuthorityValue),
    state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
    workId: v.optional(v.string()),
    dispatchState: v.optional(v.union(
      v.literal('enqueued'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('reconciliation_required'),
    )),
    result: v.optional(operationResultValue),
    usage: v.optional(usageValue),
    evidenceHash: v.optional(v.string()),
    attemptRef: v.optional(v.string()),
    reconciliation: v.optional(invocationReconciliationValue),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_invocationRef', ['invocationRef'])
    .index('by_credentialId_and_idempotencyKey', ['credentialId', 'idempotencyKey'])
    .index('by_credentialId_and_createdAt', ['credentialId', 'createdAt'])
    .index('by_credentialId_and_state', ['credentialId', 'state'])
    .index('by_credentialId_and_state_and_grantExpiresAt', ['credentialId', 'state', 'grantExpiresAt'])
    .index('by_principalId_and_invocationRef', ['principalId', 'invocationRef'])
    .index('by_ownerId_and_state_and_createdAt', ['ownerId', 'state', 'createdAt'])
    .index('by_state_and_reconciliation_nextAttemptAt', ['state', 'reconciliation.nextAttemptAt'])
} as const
