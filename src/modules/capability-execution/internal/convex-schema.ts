import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  acceptedAuthorityValue,
  type CanonicalClaimAuthority,
} from '@/modules/action-execution/runtime'
import { spendingPeriodsValue, promotionalCreditAllocationValue, managedCallBookingValue } from '@/modules/money/public'
import { purchaseResolutionRecordValidator } from '@/modules/capability-execution/purchase-resolution'
import { providerUnitObservationValue } from './provider-service-unit-values'

export type CallPersistedAuthority = CanonicalClaimAuthority & Readonly<{
  format: 'operation-invoke-authority:v1'
  callRef: string
  toolRef: string
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
export const callAuthorityValue = v.object({
  format: v.literal('operation-invoke-authority:v1'),
  callRef: v.string(),
  toolRef: v.string(),
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

export const operationExecutionPurposeValue = v.literal('market_call')

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
const callReceiptFields = {
  receiptRef: v.string(),
  state: v.union(v.literal('settled'), v.literal('refunded'), v.literal('reconciliation_required')),
  priceDigest: v.string(),
  transactionRef: v.optional(v.string()),
  accountingTransactionRefs: v.optional(v.array(v.string())),
  refundState: v.optional(v.union(v.literal('released'), v.literal('not_applicable'), v.literal('unknown'))),
  lossState: v.optional(v.union(v.literal('none'), v.literal('provider_output_invalid'), v.literal('provider_http_error'), v.literal('unknown'))),
  externalSettlementRef: v.optional(v.string()),
  evidenceHash: v.string(),
  issuedAt: v.string(),
} as const
export const callReceiptValue = v.union(
  v.object({
    ...callReceiptFields,
    commercialModel: v.literal('account_aud'),
    buyerCharge: exactAmountValue,
    serviceFee: exactAmountValue,
    totalBuyerCharge: exactAmountValue,
    providerObligation: v.object({
      amount: exactAmountValue,
      settlementMethod: v.literal('managed_x402'),
      payoutEligible: v.literal(false),
    }),
    providerSettlement: v.union(
      v.object({
        amount: exactAmountValue,
        network: v.literal('eip155:8453'),
        asset: v.literal('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
        transactionHash: v.optional(v.string()),
        paymentIdentifier: v.optional(v.string()),
      }),
      v.object({
        amount: exactAmountValue,
        network: v.literal('eip155:84532'),
        asset: v.literal('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
        transactionHash: v.optional(v.string()),
        paymentIdentifier: v.optional(v.string()),
      }),
    ),
  }),
)
const authorityRequestValue = v.object({
  kind: v.union(v.literal('approval_required'), v.literal('spending_policy')),
  toolRef: v.string(),
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

export const callResultValue = v.union(
  v.object({
    kind: v.literal('completed'),
    callRef: v.string(),
    toolRef: v.string(),
    output: jsonValue,
    evidenceHash: v.string(),
    usage: v.optional(usageValue),
    receipt: v.optional(callReceiptValue),
  }),
  v.object({
    kind: v.literal('completed'),
    callRef: v.string(),
    toolRef: v.string(),
    contentExpiredAt: v.number(),
    evidenceHash: v.string(),
    usage: v.optional(usageValue),
    receipt: v.optional(callReceiptValue),
  }),
  v.object({ kind: v.literal('pending'), callRef: v.string(), toolRef: v.string(), retryAfterMs: v.number() }),
  v.object({ kind: v.literal('needs_authority'), callRef: v.string(), toolRef: v.string(), authorityRequest: authorityRequestValue }),
  v.object({ kind: v.literal('reconciliation_required'), callRef: v.string(), toolRef: v.string(), evidence: reconciliationValue, receipt: v.optional(callReceiptValue) }),
  v.object({ kind: v.literal('refused'), toolRef: v.optional(v.string()), code: v.string(), retryable: v.boolean(), nextAction: v.optional(v.string()), receipt: v.optional(callReceiptValue) }),
)

const statusState = v.union(
  v.literal('gathering_information'), v.literal('awaiting_authority'), v.literal('authorized'),
  v.literal('leased'), v.literal('in_progress'), v.literal('retryable'), v.literal('reconciliation_required'),
  v.literal('terminal'), v.literal('cancelled'), v.literal('invalidated'),
)

export const statusResultValue = v.union(
  v.object({
    kind: v.literal('found'), callRef: v.string(), version: v.number(), toolRef: v.string(), state: statusState,
    previousInput: v.optional(jsonObject),
    usage: v.optional(usageValue), evidenceHash: v.optional(v.string()), attemptRef: v.optional(v.string()),
    effectGeneration: v.optional(v.number()), result: v.optional(callResultValue), receipt: v.optional(callReceiptValue),
    purchaseResolution: v.optional(purchaseResolutionRecordValidator),
  }),
  v.object({
    kind: v.literal('unchanged'), callRef: v.string(), version: v.number(), retryAfterMs: v.number(),
  }),
  v.object({
    kind: v.literal('refused'), callRef: v.string(),
    code: v.union(v.literal('invocation_not_found'), v.literal('grant_not_found'), v.literal('grant_revoked'), v.literal('grant_expired'), v.literal('grant_generation_stale'), v.literal('environment_mismatch'), v.literal('invocation_runtime_unavailable')),
    retryable: v.boolean(), nextAction: v.optional(v.string()), receipt: v.optional(callReceiptValue),
  }),
)

export const recoveryResultValue = v.union(
  statusResultValue,
  v.object({ kind: v.literal('reconciliation_required'), callRef: v.string(), toolRef: v.string(), evidence: reconciliationValue, receipt: v.optional(callReceiptValue) }),
)

export const callReconciliationValue = v.object({
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
    v.literal('authorization_expired'),
  ),
})

const providerConsequenceJournalStateValue = v.union(
  v.literal('pending'),
  v.literal('started'),
  v.literal('completed'),
  v.literal('aborted'),
)


const paidCallReportFields = {
  reportRef: v.string(), callRef: v.string(), accountRef: v.string(), reporterRef: v.string(),
  toolRef: v.string(), providerRef: v.string(), environment: v.union(v.literal('sandbox'), v.literal('production')),
  reason: v.literal('answer_not_useful'), booking: managedCallBookingValue,
  originalSettlementRefs: v.array(v.string()), originalResolution: purchaseResolutionRecordValidator,
  reportDigest: v.string(), createdAt: v.number(), updatedAt: v.number(),
}

export const capabilityCallTables = {
  paidCallReports: defineTable(v.union(
    v.object({ ...paidCallReportFields, state: v.literal('pending'), nextWorkAt: v.number() }),
    v.object({ ...paidCallReportFields, state: v.literal('posted'), postedAt: v.number(), buyerRefundTransactionRef: v.string(), transactionRefs: v.array(v.string()) }),
  ))
    .index('by_callRef', ['callRef'])
    .index('by_accountRef_and_buyerRefundTransactionRef', ['accountRef', 'buyerRefundTransactionRef'])
    .index('by_reporterRef_and_createdAt', ['reporterRef', 'createdAt'])
    .index('by_toolRef_and_createdAt', ['toolRef', 'createdAt'])
    .index('by_environment_and_state_and_nextWorkAt', ['environment', 'state', 'nextWorkAt']),

  purchaseResolutionRecords: defineTable({
    ...purchaseResolutionRecordValidator.fields,
    createdAt: v.number(),
  })
    .index('by_callRef', ['callRef'])
    .index('by_accountRef_and_resolvedAt', ['accountRef', 'resolvedAt'])
    .index('by_customerRef_and_resolvedAt', ['customerRef', 'resolvedAt'])
    .index('by_resolvedAt', ['resolvedAt']),
  capabilityServiceUsageRecords: defineTable({
    usageRef: v.string(),
    callRef: v.string(),
    callDigest: v.optional(v.string()),
    quoteRef: v.optional(v.string()),
    accountRef: v.string(),
    principalRef: v.string(),
    credentialRef: v.string(),
    applicationRef: v.string(),
    toolRef: v.string(),
    providerRef: v.string(),
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    unitDefinitionRef: v.literal('delivered_request:v1'),
    quantityUnits: v.literal('1'),
    quantityExponent: v.literal(0),
    source: v.literal('validated_call_result'),
    sourceEvidenceHash: v.optional(v.string()),
    supportDigest: v.optional(v.string()),
    providerUnitHeadRef: v.optional(v.string()),
    receiptRef: v.optional(v.string()),
    priceDigest: v.string(),
    timeBasis: v.union(v.literal('receipt_issued'), v.literal('call_updated')),
    callCreatedAt: v.number(),
    occurredAt: v.number(),
    observedAt: v.number(),
  })
    .index('by_usageRef', ['usageRef'])
    .index('by_accountRef_and_callDigest', ['accountRef', 'callDigest'])
    .index('by_callRef', ['callRef'])
    .index('by_accountRef_and_callCreatedAt', ['accountRef', 'callCreatedAt'])
    .index('by_accountRef_and_occurredAt', ['accountRef', 'occurredAt']),
  capabilityServiceUnitObservations: defineTable(providerUnitObservationValue)
    .index('by_callRef_and_sequence', ['callRef', 'sequence'])
    .index('by_observationRef', ['observationRef']),
  capabilityServiceUsageRevisions: defineTable({
    usageRef: v.string(), accountRef: v.string(), callRef: v.string(), revisionRef: v.string(), previousRevisionRef: v.string(), revision: v.number(),
    sourceDigest: v.string(), support: v.object({
      state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
      resultKind: v.union(v.literal('completed'), v.literal('pending'), v.literal('needs_authority'), v.literal('reconciliation_required'), v.literal('refused'), v.null()),
      evidenceHash: v.union(v.string(), v.null()), evidenceConflict: v.boolean(),
    }),
    quantityUnits: v.union(v.literal('1'), v.null()), effectiveAt: v.number(), observedAt: v.number(), source: v.literal('canonical_call_support'),
  }).index('by_usageRef_and_revision', ['usageRef', 'revision']).index('by_revisionRef', ['revisionRef']),
  capabilityCallProjections: defineTable({
    callRef: v.string(),
    accountRef: v.string(),
    principalRef: v.string(),
    credentialRef: v.string(),
    applicationRef: v.string(),
    toolRef: v.string(),
    providerRef: v.string(),
    toolLabel: v.string(),
    state: v.union(
      v.literal('completed'),
      v.literal('refused'),
      v.literal('outcome_unknown'),
    ),
    deliveryState: v.union(v.literal('delivered'), v.literal('not_delivered'), v.literal('unknown')),
    paymentState: v.union(v.literal('settled'), v.literal('released'), v.literal('unknown'), v.literal('not_applicable')),
    providerObligationState: v.optional(v.union(
      v.literal('accrued'),
      v.literal('held'),
      v.literal('payable'),
      v.literal('settled'),
      v.literal('reversed'),
      v.literal('disputed'),
    )),
    providerAmountUnits: v.optional(v.string()),
    audAmountUnits: v.optional(v.string()),
    receiptRef: v.optional(v.string()),
    recoveryRef: v.optional(v.string()),
    serviceUsageRef: v.optional(v.string()),
    deliveredRequestUnits: v.optional(v.string()),
    currentDeliveredRequestUnits: v.optional(v.union(v.literal('1'), v.null())),
    measurementRevisionRef: v.optional(v.string()),
    providerUnitObservation: v.optional(providerUnitObservationValue),
    observedAt: v.optional(v.number()),
    latencyMs: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_callRef', ['callRef'])
    .index('by_createdAt', ['createdAt'])
    .index('by_accountRef_and_createdAt', ['accountRef', 'createdAt'])
    .index('by_accountRef_and_principalRef_and_createdAt', ['accountRef', 'principalRef', 'createdAt'])
    .index('by_accountRef_and_toolRef_and_createdAt', ['accountRef', 'toolRef', 'createdAt'])
    .index('by_accountRef_and_providerRef_and_createdAt', ['accountRef', 'providerRef', 'createdAt'])
    .index('by_providerRef_and_createdAt', ['providerRef', 'createdAt'])
    .index('by_toolRef_and_createdAt', ['toolRef', 'createdAt'])
    .index('by_accountRef_and_applicationRef_and_createdAt', ['accountRef', 'applicationRef', 'createdAt']),
  capabilityQuotes: defineTable({
    quoteRef: v.string(),
    principalId: v.string(),
    accountRef: v.string(),
    credentialId: v.string(),
    applicationRef: v.string(),
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    grantRef: v.string(),
    grantGeneration: v.number(),
    grantPolicyDigest: v.string(),
    grantExpiresAt: v.number(),
    toolRef: v.string(),
    toolVersion: v.number(),
    toolMaterialDigest: v.string(),
    currentToolDigest: v.string(),
    toolJson: v.string(),
    normalizedInputJson: v.optional(v.string()),
    contentExpiredAt: v.optional(v.number()),
    inputDigest: v.string(),
    pricingJson: v.string(),
    pricingDigest: v.string(),
    decisionAudUnits: v.string(),
    sourceUsdcUnits: v.optional(v.string()),
    x402RequirementDigest: v.optional(v.string()),
    x402RequirementJson: v.optional(v.string()),
    x402PaymentRequiredJson: v.optional(v.string()),
    x402RequirementObservedAt: v.optional(v.number()),
    rateEvidenceJson: v.optional(v.string()),
    rateEvidenceDigest: v.optional(v.string()),
    budgetPolicyRef: v.string(),
    budgetGeneration: v.number(),
    maximumSpendPerCallUnits: v.string(),
    formanceSchemaVersion: v.string(),
    policyGeneration: v.number(),
    legalCustomerRef: v.string(),
    legalCustomerGeneration: v.number(),
    buyerRevenueUnits: v.string(),
    buyerTaxUnits: v.string(),
    accountAvailableUnits: v.string(),
    budgetAvailableUnits: v.string(),
    // Period identities and native readbacks are immutable Quote evidence.
    // They are optional only for historical periodless rows.
    spendingPeriods: v.optional(spendingPeriodsValue),
    dailyPeriodAvailableUnits: v.optional(v.string()),
    monthlyPeriodAvailableUnits: v.optional(v.string()),
    dailyPeriodObservedAt: v.optional(v.number()),
    monthlyPeriodObservedAt: v.optional(v.number()),
    legalExposureAvailableUnits: v.string(),
    balanceUnits: v.string(),
    treasuryCustodyRef: v.optional(v.string()),
    treasuryCustodyGeneration: v.optional(v.number()),
    treasuryVersion: v.optional(v.number()),
    treasuryEvidenceRef: v.optional(v.string()),
    treasuryEvidenceDigest: v.optional(v.string()),
    treasurySpendableUnits: v.optional(v.string()),
    commercialPolicyRefs: v.array(v.string()),
    commercialPolicyDigest: v.string(),
    evidenceDigest: v.string(),
    state: v.union(v.literal('issued'), v.literal('consumed'), v.literal('expired')),
    consumedCallRef: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_quoteRef', ['quoteRef'])
    .index('by_contentExpiredAt_and_expiresAt', ['contentExpiredAt', 'expiresAt'])
    .index('by_credentialId_and_createdAt', ['credentialId', 'createdAt'])
    .index('by_state_and_expiresAt', ['state', 'expiresAt'])
    .index('by_createdAt', ['createdAt']),
  capabilityCalls: defineTable({
    quoteRef: v.optional(v.string()),
    callRef: v.string(),
    // Attribution belongs to the first reservation, never to a later replay.
    chatTurnRef: v.optional(v.string()),
    principalId: v.string(),
    ownerId: v.string(),
    credentialId: v.string(),
    dispatchedCredentialId: v.optional(v.string()),
    applicationRef: v.string(),
    toolRef: v.string(),
    idempotencyKey: v.string(),
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    grantRef: v.string(),
    grantGeneration: v.number(),
    policyDigest: v.string(),
    grantExpiresAt: v.number(),
    toolJson: v.optional(v.string()),
    inputJson: v.optional(v.string()),
    contentExpiredAt: v.optional(v.number()),
    inputDigest: v.string(),
    requestDigest: v.string(),
    formanceFinancialState: v.optional(v.union(
      v.literal('reservation_pending'),
      v.literal('reserved'),
      v.literal('possibly_submitted'),
      v.literal('outcome_unknown'),
      v.literal('released'),
      v.literal('settled'),
    )),
    promotionalCreditAllocation: v.optional(promotionalCreditAllocationValue),
    formanceReservationAttempt: v.optional(v.object({
      generation: v.number(), leaseUntil: v.number(), ambiguous: v.boolean(),
    })),
    formanceReservationRefs: v.optional(v.array(v.string())),
    formanceReservationDigest: v.optional(v.string()),
    formanceReleaseRefs: v.optional(v.array(v.string())),
    formanceSettlementRefs: v.optional(v.array(v.string())),
    buyerSaleTransactionRef: v.optional(v.string()),
    formanceUnknownReference: v.optional(v.string()),
    formanceUnknownStatusRef: v.optional(v.string()),
    authority: v.optional(callAuthorityValue),
    state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
    workId: v.optional(v.string()),
    dispatchState: v.optional(v.union(
      v.literal('enqueued'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('reconciliation_required'),
    )),
    result: v.optional(callResultValue),
    usage: v.optional(usageValue),
    evidenceHash: v.optional(v.string()),
    attemptRef: v.optional(v.string()),
    reconciliation: v.optional(callReconciliationValue),
    x402UnpaidProbe: v.optional(v.union(
      v.object({ kind: v.literal('started'), startedAt: v.number() }),
      v.object({ kind: v.literal('matched'), requirementDigest: v.string() }),
      v.object({ kind: v.literal('refused') }),
    )),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_callRef', ['callRef'])
    .index('by_chatTurnRef', ['chatTurnRef'])
    .index('by_contentExpiredAt_and_createdAt', ['contentExpiredAt', 'createdAt'])
    .index('by_environment_and_createdAt', ['environment', 'createdAt'])
    .index('by_ownerId_and_buyerSaleTransactionRef', ['ownerId', 'buyerSaleTransactionRef'])
    // Idempotency is keyed by the stable Principal, never by the rotating
    // credential: a replaced credential must replay, not mint a second Call.
    .index('by_principalId_and_idempotencyKey', ['principalId', 'idempotencyKey'])
    .index('by_principalId_and_formanceFinancialState', ['principalId', 'formanceFinancialState'])
    .index('by_credentialId_and_createdAt', ['credentialId', 'createdAt'])
    .index('by_credentialId_and_state', ['credentialId', 'state'])
    .index('by_credentialId_and_state_and_grantExpiresAt', ['credentialId', 'state', 'grantExpiresAt'])
    .index('by_principalId_and_callRef', ['principalId', 'callRef'])
    .index('by_principalId_and_createdAt', ['principalId', 'createdAt'])
    .index('by_principalId_and_state', ['principalId', 'state'])
    .index('by_principalId_and_toolRef_and_state', ['principalId', 'toolRef', 'state'])
    .index('by_toolRef_and_state', ['toolRef', 'state'])
    .index('by_toolRef_and_state_and_updatedAt', ['toolRef', 'state', 'updatedAt'])
    .index('by_toolRef_and_createdAt', ['toolRef', 'createdAt'])
    .index('by_ownerId_and_toolRef_and_state', ['ownerId', 'toolRef', 'state'])
    .index('by_ownerId_and_state_and_createdAt', ['ownerId', 'state', 'createdAt'])
    .index('by_state_and_result_kind_and_createdAt', ['state', 'result.kind', 'createdAt'])
    .index('by_state_and_reconciliation_nextAttemptAt', ['state', 'reconciliation.nextAttemptAt'])
    .index('by_environment_state_reconciliation_disposition_reason_due', [
      'environment', 'state', 'reconciliation.disposition', 'reconciliation.reason', 'reconciliation.nextAttemptAt',
    ])
    .index('by_createdAt', ['createdAt']),
  // Authority and effect provenance remain after the content-bearing transport
  // observation expires. Provider/payment secrets are never stored here.
  providerConsequenceJournal: defineTable({
    ticketRef: v.string(),
    effectRef: v.string(),
    commandId: v.string(),
    state: providerConsequenceJournalStateValue,
    journalTokenDigest: v.string(),
    requestDigest: v.string(),
    invocationDigest: v.string(),
    operationKeyDigest: v.string(),
    ticketClaimsDigest: v.string(),
    callRef: v.string(),
    toolRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
    leaseRef: v.string(),
    connectionRef: v.string(),
    authorityGeneration: v.number(),
    providerRef: v.string(),
    adapterId: v.string(),
    authorityDigest: v.string(),
    grantedScopes: v.array(v.string()),
    grantedResources: v.array(v.string()),
    readinessValidUntil: v.number(),
    readinessDigest: v.optional(v.string()),
    owningAccountRef: v.string(),
    activeAccountRef: v.string(),
    actorPrincipalRef: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
    secretRef: v.string(),
    secretGeneration: v.string(),
    secretPointerRevision: v.number(),
    paymentSecretRef: v.optional(v.string()),
    paymentSecretGeneration: v.optional(v.string()),
    paymentSecretPointerRevision: v.optional(v.number()),
    paymentAccountRef: v.optional(v.string()),
    signingSecretRef: v.string(),
    signingSecretGeneration: v.string(),
    signingSecretPointerRevision: v.number(),
    signingAccountRef: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
    claimRef: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    observationJson: v.optional(v.string()),
    contentExpiredAt: v.optional(v.number()),
    observationDigest: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    abortedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_ticketRef', ['ticketRef'])
    .index('by_contentExpiredAt_and_issuedAt', ['contentExpiredAt', 'issuedAt'])
    .index('by_callRef', ['callRef'])
    .index('by_effectRef', ['effectRef'])
    .index('by_commandId', ['commandId'])
    .index('by_claimRef', ['claimRef'])
    .index('by_state_and_expiresAt', ['state', 'expiresAt']),
} as const
