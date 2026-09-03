import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  acceptedAuthorityValue,
  type CanonicalClaimAuthority,
} from '@/modules/action-invocation/runtime'

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

export const operationExecutionPurposeValue = v.union(
  v.literal('market_call'),
  v.literal('seller_onboarding_canary'),
)

export const sellerOnboardingCanaryExecutionEnvelopeValue = v.object({
  executionPurpose: v.literal('seller_onboarding_canary'),
  canaryRef: v.string(),
  canaryCommitmentDigest: v.string(),
  invocationRef: v.string(),
  operationRef: v.string(),
  ownerId: v.string(),
  businessId: v.string(),
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  accessPathRef: v.string(),
  accessPathSourceHash: v.string(),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  operationMaterialDigest: v.string(),
  contractDigest: v.string(),
  bindingDigest: v.string(),
  priceDigest: v.string(),
  sellerPayTo: v.string(),
  sellerClaimDigest: v.string(),
  readinessDigest: v.string(),
  readinessObservedAt: v.number(),
  readinessValidUntil: v.number(),
  expectedOutputSchemaDigest: v.string(),
  expectedOutputEvidenceDigest: v.string(),
  expiresAt: v.number(),
  inputDigest: v.string(),
  idempotencyKey: v.string(),
  funding: v.object({
    kind: v.literal('ae_owned'),
    principalId: v.string(),
    ownerId: v.string(),
    credentialId: v.string(),
    applicationRef: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
    policyDigest: v.string(),
    budgetRef: v.string(),
    maximumSpend: exactAmountValue,
    requestedSpend: exactAmountValue,
    ledgerEffects: v.literal('external_spend_only'),
  }),
  accountingPolicy: v.object({
    recordBuyerUsage: v.literal(false),
    accrueProviderEarnings: v.literal(false),
    accruePlatformRake: v.literal(false),
    recordQualifiedUse: v.literal(false),
  }),
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
const operationInvokeReceiptFields = {
  receiptRef: v.string(),
  state: v.union(v.literal('settled'), v.literal('refunded'), v.literal('reconciliation_required')),
  priceDigest: v.string(),
  transactionRef: v.optional(v.string()),
  accountingTransactionRefs: v.optional(v.array(v.string())),
  refundState: v.optional(v.union(v.literal('released'), v.literal('not_applicable'), v.literal('unknown'))),
  lossState: v.optional(v.union(v.literal('none'), v.literal('provider_output_invalid'), v.literal('unknown'))),
  externalSettlementRef: v.optional(v.string()),
  evidenceHash: v.string(),
  issuedAt: v.string(),
} as const
export const operationInvokeReceiptValue = v.union(
  v.object({
    ...operationInvokeReceiptFields,
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
  v.object({
    ...operationInvokeReceiptFields,
    commercialModel: v.literal('seller_canary_x402'),
    providerQuotedAmount: exactAmountValue,
    agenticEconomyFee: exactAmountValue,
    totalBuyerAuthorization: exactAmountValue,
    settlementTransactionHash: v.optional(v.string()),
    paymentIdentifier: v.optional(v.string()),
    network: v.literal('eip155:8453'),
    asset: v.literal('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  }),
  v.object({
    ...operationInvokeReceiptFields,
    commercialModel: v.literal('seller_canary_x402'),
    providerQuotedAmount: exactAmountValue,
    agenticEconomyFee: exactAmountValue,
    totalBuyerAuthorization: exactAmountValue,
    settlementTransactionHash: v.optional(v.string()),
    paymentIdentifier: v.optional(v.string()),
    network: v.literal('eip155:84532'),
    asset: v.literal('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  }),
)
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
    // Seller-onboarding canaries are non-buyer conformance proofs. The canary
    // projector is the only completion path
    // allowed to omit this field; ordinary completion still requires it.
    usage: v.optional(usageValue),
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
    kind: v.literal('found'), invocationRef: v.string(), version: v.number(), operationRef: v.string(), state: statusState,
    previousInput: v.optional(jsonObject),
    usage: v.optional(usageValue), evidenceHash: v.optional(v.string()), attemptRef: v.optional(v.string()),
    effectGeneration: v.optional(v.number()), result: v.optional(operationResultValue), receipt: v.optional(operationInvokeReceiptValue),
  }),
  v.object({
    kind: v.literal('unchanged'), invocationRef: v.string(), version: v.number(), retryAfterMs: v.number(),
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
    v.literal('authorization_expired'),
  ),
})

const providerConsequenceJournalStateValue = v.union(
  v.literal('pending'),
  v.literal('started'),
  v.literal('completed'),
  v.literal('aborted'),
)


export const capabilityOperationInvocationTables = {
  capabilityOperationCallProjections: defineTable({
    callRef: v.string(),
    accountRef: v.string(),
    principalRef: v.string(),
    credentialRef: v.string(),
    applicationRef: v.string(),
    operationRef: v.string(),
    providerRef: v.string(),
    operationLabel: v.string(),
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
    latencyMs: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_callRef', ['callRef'])
    .index('by_accountRef_and_createdAt', ['accountRef', 'createdAt'])
    .index('by_accountRef_and_principalRef_and_createdAt', ['accountRef', 'principalRef', 'createdAt'])
    .index('by_accountRef_and_operationRef_and_createdAt', ['accountRef', 'operationRef', 'createdAt'])
    .index('by_accountRef_and_providerRef_and_createdAt', ['accountRef', 'providerRef', 'createdAt'])
    .index('by_accountRef_and_applicationRef_and_createdAt', ['accountRef', 'applicationRef', 'createdAt']),
  capabilityOperationCommitments: defineTable({
    commitmentRef: v.string(),
    principalId: v.string(),
    accountRef: v.string(),
    credentialId: v.string(),
    applicationRef: v.string(),
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    grantRef: v.string(),
    grantGeneration: v.number(),
    grantPolicyDigest: v.string(),
    grantExpiresAt: v.number(),
    operationRef: v.string(),
    operationRevision: v.number(),
    operationMaterialDigest: v.string(),
    currentOperationDigest: v.string(),
    operationJson: v.string(),
    normalizedInputJson: v.string(),
    inputDigest: v.string(),
    pricingJson: v.string(),
    pricingDigest: v.string(),
    decisionAudUnits: v.string(),
    sourceUsdcUnits: v.optional(v.string()),
    x402RequirementDigest: v.optional(v.string()),
    x402RequirementJson: v.optional(v.string()),
    x402RequirementObservedAt: v.optional(v.number()),
    rateEvidenceJson: v.optional(v.string()),
    rateEvidenceDigest: v.optional(v.string()),
    budgetPolicyRef: v.string(),
    budgetGeneration: v.number(),
    maximumSpendPerInvocationUnits: v.string(),
    formanceSchemaVersion: v.string(),
    policyGeneration: v.number(),
    legalCustomerRef: v.string(),
    legalCustomerGeneration: v.number(),
    buyerRevenueUnits: v.string(),
    buyerTaxUnits: v.string(),
    accountAvailableUnits: v.string(),
    budgetAvailableUnits: v.string(),
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
    consumedInvocationRef: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_commitmentRef', ['commitmentRef'])
    .index('by_credentialId_and_createdAt', ['credentialId', 'createdAt'])
    .index('by_state_and_expiresAt', ['state', 'expiresAt']),
  capabilityOperationInvocations: defineTable({
    commitmentRef: v.optional(v.string()),
    invocationRef: v.string(),
    principalId: v.string(),
    ownerId: v.string(),
    credentialId: v.string(),
    applicationRef: v.string(),
    operationRef: v.string(),
    // Presence is the complete, server-built seller canary authority. Ordinary
    // market calls have no canary field and cannot acquire one through invoke.
    sellerOnboardingCanary: v.optional(sellerOnboardingCanaryExecutionEnvelopeValue),
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
    formanceFinancialState: v.optional(v.union(
      v.literal('reservation_pending'),
      v.literal('reserved'),
      v.literal('possibly_submitted'),
      v.literal('outcome_unknown'),
      v.literal('released'),
      v.literal('settled'),
    )),
    formanceReservationRefs: v.optional(v.array(v.string())),
    formanceReservationDigest: v.optional(v.string()),
    formanceReleaseRefs: v.optional(v.array(v.string())),
    formanceSettlementRefs: v.optional(v.array(v.string())),
    formanceUnknownReference: v.optional(v.string()),
    formanceUnknownStatusRef: v.optional(v.string()),
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
    .index('by_sellerOnboardingCanary_canaryRef', ['sellerOnboardingCanary.canaryRef'])
    .index('by_sellerOnboardingCanary_target', [
      'sellerOnboardingCanary.businessId',
      'sellerOnboardingCanary.offeringRef',
      'sellerOnboardingCanary.offeringRevision',
      'sellerOnboardingCanary.offeringSourceHash',
      'sellerOnboardingCanary.publicationRef',
      'sellerOnboardingCanary.publicationRevision',
    ])
    .index('by_credentialId_and_idempotencyKey', ['credentialId', 'idempotencyKey'])
    .index('by_credentialId_and_createdAt', ['credentialId', 'createdAt'])
    .index('by_credentialId_and_state', ['credentialId', 'state'])
    .index('by_credentialId_and_state_and_grantExpiresAt', ['credentialId', 'state', 'grantExpiresAt'])
    .index('by_principalId_and_invocationRef', ['principalId', 'invocationRef'])
    .index('by_ownerId_and_state_and_createdAt', ['ownerId', 'state', 'createdAt'])
    .index('by_state_and_reconciliation_nextAttemptAt', ['state', 'reconciliation.nextAttemptAt']),
  // Append-only proof that a seller canary was re-armed only after either a
  // durable pre-claim refusal with no canonical attempt, or an exact canonical
  // safe-before-release attempt whose durable ledgers prove it ended unpaid.
  sellerOnboardingCanaryRearmAudits: defineTable({
    auditRef: v.string(),
    canaryRef: v.string(),
    invocationRef: v.string(),
    priorWorkId: v.string(),
    rearmedWorkId: v.string(),
    refusalCode: v.union(
      v.literal('grant_not_found'),
      v.literal('grant_generation_stale'),
      v.literal('operation_not_current'),
      v.literal('provider_refused'),
      v.literal('pre_release_failed'),
    ),
    priorResultDigest: v.string(),
    // Optional for compatibility with audits written before structured refusal
    // provenance was introduced. Every new rearm writes this object.
    refusalProvenance: v.optional(v.union(
      v.object({
        phase: v.literal('pre_claim'),
        source: v.union(
          v.literal('known_preclaim_code'),
          v.literal('legacy_exact_provider_approval'),
        ),
        nextAction: v.optional(v.string()),
      }),
      v.object({
        phase: v.literal('safe_before_release'),
        source: v.literal('canonical_retryable_attempt'),
        nextAction: v.string(),
        priorAttemptRef: v.string(),
        priorAttemptNumber: v.number(),
        priorEffectGeneration: v.number(),
        controlDigest: v.string(),
        attemptDigest: v.string(),
      }),
    )),
    rearmedEnvelopeDigest: v.string(),
    rearmedAuthorityDigest: v.string(),
    rearmedAt: v.number(),
  })
    .index('by_auditRef', ['auditRef'])
    .index('by_invocationRef', ['invocationRef'])
    .index('by_canaryRef', ['canaryRef']),
  // Authority-provenance-only journal. It stores no provider or payment secret
  // material; every field either pins the admitted consequence snapshot or
  // prevents a duplicate/ambiguous external effect.
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
    invocationRef: v.string(),
    operationRef: v.string(),
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
    observationDigest: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    abortedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_ticketRef', ['ticketRef'])
    .index('by_effectRef', ['effectRef'])
    .index('by_commandId', ['commandId'])
    .index('by_claimRef', ['claimRef'])
    .index('by_state_and_expiresAt', ['state', 'expiresAt']),
} as const
