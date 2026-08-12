import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const currency = v.string()
const exponent = v.number()
const units = v.string()
const identifier = v.string()
const evidenceRefs = v.array(v.string())

export const moneyTables = {
  moneyAccounts: defineTable({
    accountRef: identifier,
    accountKind: v.union(v.literal('operator_credit'), v.literal('provider_earnings'), v.literal('ae_rake')),
    principalId: v.optional(identifier),
    businessId: v.optional(identifier),
    currency,
    exponent,
    balanceUnits: units,
    version: v.number(),
    state: v.union(v.literal('active'), v.literal('locked')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_accountRef', ['accountRef'])
    .index('by_principalId_and_currency', ['principalId', 'currency'])
    .index('by_businessId_and_currency', ['businessId', 'currency']),
  moneyLedgerEntries: defineTable({
    entryRef: identifier,
    accountRef: identifier,
    entryType: v.union(v.literal('topup'), v.literal('charge'), v.literal('refund'), v.literal('payout_accrual'), v.literal('rake')),
    direction: v.union(v.literal('credit'), v.literal('debit')),
    amountUnits: units,
    currency,
    exponent,
    transactionRef: identifier,
    idempotencyKey: identifier,
    principalId: v.optional(identifier),
    businessId: v.optional(identifier),
    invocationRef: v.optional(identifier),
    attemptRef: v.optional(identifier),
    sourceDigest: identifier,
    evidenceRefs,
    reversalOf: v.optional(identifier),
    createdAt: v.number(),
  })
    .index('by_transactionRef', ['transactionRef'])
    .index('by_accountRef_and_createdAt', ['accountRef', 'createdAt'])
    .index('by_principalId_and_createdAt', ['principalId', 'createdAt'])
    .index('by_businessId_and_createdAt', ['businessId', 'createdAt']),
  moneyTransactions: defineTable({
    transactionRef: identifier,
    kind: v.union(v.literal('topup'), v.literal('charge'), v.literal('refund'), v.literal('payout_accrual'), v.literal('rake')),
    idempotencyKey: identifier,
    inputDigest: identifier,
    principalId: identifier,
    currency,
    credentialId: v.optional(identifier),
    budgetPolicyRef: v.optional(identifier),
    budgetGeneration: v.optional(v.number()),
    budgetEnvironment: v.optional(v.union(v.literal('sandbox'), v.literal('production'))),
    budgetDayStart: v.optional(identifier),
    budgetMonthStart: v.optional(identifier),
    budgetState: v.optional(v.union(v.literal('reserved'), v.literal('settled'), v.literal('released'), v.literal('unknown'))),
    settledAt: v.optional(v.number()),
    amountUnits: v.optional(units),
    exponent,
    state: v.union(v.literal('pending'), v.literal('applied'), v.literal('outcome_unknown'), v.literal('reversed')),
    expectedAccountVersion: v.number(),
    externalRef: v.optional(identifier),
    reversalOf: v.optional(identifier),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_idempotencyKey', ['idempotencyKey'])
    .index('by_transactionRef', ['transactionRef'])
    .index('by_principalId_and_createdAt', ['principalId', 'createdAt'])
    .index('by_credentialId_and_budgetState', ['credentialId', 'budgetState'])
    .index('by_externalRef', ['externalRef'])
    .index('by_reversalOf', ['reversalOf']),
  moneyUsageEvents: defineTable({
    usageRef: identifier,
    principalId: identifier,
    credentialId: identifier,
    currency,
    exponent,
    serviceRef: identifier,
    offeringRef: identifier,
    businessId: identifier,
    invocationRef: identifier,
    attemptRef: identifier,
    operationKey: identifier,
    priceDigest: identifier,
    chargeState: v.union(v.literal('free_tier'), v.literal('paid'), v.literal('insufficient_credit'), v.literal('outcome_unknown'), v.literal('refunded')),
    amountUnits: units,
    transactionRef: v.optional(identifier),
    observedAt: v.number(),
  })
    .index('by_principalId_and_credentialId_and_currency_and_observedAt', ['principalId', 'credentialId', 'currency', 'observedAt'])
    .index('by_businessId_and_observedAt', ['businessId', 'observedAt'])
    .index('by_invocationRef', ['invocationRef'])
    .index('by_usageRef', ['usageRef']),
  moneyCredentialBudgetStates: defineTable({
    principalId: identifier,
    credentialId: identifier,
    budgetPolicyRef: identifier,
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    generation: v.number(),
    windowKind: v.union(v.literal('day'), v.literal('month'), v.literal('concurrency')),
    windowStart: identifier,
    currency,
    exponent,
    settledUnits: units,
    reservedUnits: units,
    reservedCount: v.number(),
    version: v.number(),
    updatedAt: v.number(),
  })
    .index('by_principal_credential_env_generation_window', [
      'principalId', 'credentialId', 'environment', 'generation', 'windowKind', 'windowStart',
    ])
    .index('by_credentialId_and_environment_and_generation_and_windowKind', ['credentialId', 'environment', 'generation', 'windowKind']),
  moneyCredentialUsageSummaries: defineTable({
    principalId: identifier,
    credentialId: identifier,
    currency,
    exponent,
    callCount: v.number(),
    paidCallCount: v.number(),
    freeCallCount: v.number(),
    grossSpendUnits: units,
    states: v.array(v.union(v.literal('free_tier'), v.literal('paid'), v.literal('insufficient_credit'), v.literal('outcome_unknown'), v.literal('refunded'))),
    updatedAt: v.number(),
  }).index('by_principalId_and_credentialId_and_currency', ['principalId', 'credentialId', 'currency']),
  moneyFreeTierCounters: defineTable({
    counterRef: identifier,
    principalId: identifier,
    offeringRef: identifier,
    window: v.union(v.literal('day'), v.literal('month')),
    windowStart: identifier,
    callsUsed: v.number(),
    version: v.number(),
    updatedAt: v.number(),
  })
    .index('by_principalId_and_offeringRef_and_windowStart', ['principalId', 'offeringRef', 'windowStart'])
    .index('by_offeringRef_and_windowStart', ['offeringRef', 'windowStart']),
  moneyTopupCommands: defineTable({
    commandRef: identifier,
    principalId: identifier,
    accountRef: identifier,
    currency,
    exponent,
    amountUnits: units,
    processingFeeUnits: units,
    chargeAmountUnits: units,
    idempotencyKey: identifier,
    inputDigest: identifier,
    successReturnRef: identifier,
    providerRecoveryDeadlineAt: v.number(),
    state: v.union(v.literal('pending'), v.literal('succeeded'), v.literal('failed'), v.literal('outcome_unknown')),
    externalRef: v.optional(identifier),
    paymentId: v.optional(identifier),
    providerStatus: v.optional(v.union(v.literal('pending'), v.literal('succeeded'), v.literal('failed'), v.literal('outcome_unknown'))),
    metadataDigest: v.optional(identifier),
    requestDigest: v.optional(identifier),
    checkoutSessionDigest: v.optional(identifier),
    paymentIntentDigest: v.optional(identifier),
    evidenceDigest: v.optional(identifier),
    providerEvidenceRef: v.optional(identifier),
    appliedStripeEventId: v.optional(identifier),
    appliedPayloadDigest: v.optional(identifier),
    appliedTransactionRef: v.optional(identifier),
    buyerBalanceBeforeUnits: v.optional(units),
    buyerBalanceAfterUnits: v.optional(units),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_commandRef', ['commandRef'])
    .index('by_idempotencyKey', ['idempotencyKey'])
    .index('by_externalRef', ['externalRef']),
  moneyConnectAccountCommands: defineTable({
    commandRef: identifier,
    businessId: identifier,
    currency,
    exponent,
    idempotencyKey: identifier,
    inputDigest: identifier,
    providerRequestDigest: identifier,
    providerRecoveryDeadlineAt: v.number(),
    recoveryLeaseGeneration: v.number(),
    recoveryLeaseOwner: v.optional(identifier),
    recoveryLeaseExpiresAt: v.optional(v.number()),
    state: v.union(v.literal('pending'), v.literal('succeeded'), v.literal('failed'), v.literal('outcome_unknown')),
    stripeAccountId: v.optional(identifier),
    providerEvidenceRef: v.optional(identifier),
    failureCode: v.optional(identifier),
    failureRetryable: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_commandRef', ['commandRef'])
    .index('by_businessId_and_currency', ['businessId', 'currency'])
    .index('by_businessId_and_currency_and_idempotencyKey', ['businessId', 'currency', 'idempotencyKey'])
    .index('by_idempotencyKey', ['idempotencyKey']),
  moneyStripeEvents: defineTable({
    stripeEventId: identifier,
    eventType: identifier,
    payloadDigest: identifier,
    commandRef: v.optional(identifier),
    providerObjectId: identifier,
    providerObjectDigest: v.optional(identifier),
    providerObjectVersion: v.optional(v.number()),
    sessionId: v.optional(identifier),
    paymentId: v.optional(identifier),
    paymentIntentDigest: v.optional(identifier),
    checkoutStatus: v.optional(v.union(v.literal('paid'), v.literal('failed'), v.literal('expired'))),
    currency: v.optional(currency),
    amountUnits: v.optional(units),
    exponent: v.optional(exponent),
    metadataDigest: v.optional(identifier),
    status: v.union(v.literal('received'), v.literal('applied'), v.literal('ignored'), v.literal('failed')),
    appliedRef: v.optional(identifier),
    receivedAt: v.number(),
    appliedAt: v.optional(v.number()),
  }).index('by_stripeEventId', ['stripeEventId']),
  moneyPayoutAccounts: defineTable({
    businessId: identifier,
    currency,
    exponent,
    stripeAccountId: identifier,
    state: v.union(v.literal('not_started'), v.literal('onboarding_started'), v.literal('submitted'), v.literal('restricted'), v.literal('ready')),
    detailsSubmitted: v.boolean(),
    recipientCapabilityActive: v.boolean(),
    requirementsDigest: identifier,
    lastStripeEventId: v.optional(identifier),
    lastStripePayloadDigest: v.optional(identifier),
    providerObjectDigest: v.optional(identifier),
    providerObjectVersion: v.optional(v.number()),
    lastStripeObservedAt: v.optional(v.number()),
    version: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_businessId_and_currency', ['businessId', 'currency']).index('by_stripeAccountId', ['stripeAccountId']),
  moneyPayouts: defineTable({
    payoutRef: identifier,
    businessId: identifier,
    currency,
    exponent,
    grossAccrualUnits: units,
    rakeUnits: units,
    providerNetUnits: units,
    minimumPayoutUnits: units,
    state: v.union(v.literal('review'), v.literal('held_kyc'), v.literal('held_threshold'), v.literal('transfer_pending'), v.literal('paid'), v.literal('reversed'), v.literal('failed'), v.literal('outcome_unknown')),
    periodStart: identifier,
    periodEnd: identifier,
    providerAccountRef: v.optional(identifier),
    destinationAccountId: v.optional(identifier),
    stripeTransferId: v.optional(identifier),
    payoutCommandId: v.optional(identifier),
    inputDigest: v.optional(identifier),
    transferRequestDigest: v.optional(identifier),
    transferEvidenceDigest: v.optional(identifier),
    transferReversalEvidenceDigest: v.optional(identifier),
    transferObservedAt: v.optional(v.number()),
    providerRecoveryDeadlineAt: v.optional(v.number()),
    transferStatus: v.optional(v.union(v.literal('pending'), v.literal('succeeded'), v.literal('failed'), v.literal('reversed'), v.literal('outcome_unknown'))),
    providerHeldBeforeUnits: v.optional(units),
    providerHeldAfterUnits: v.optional(units),
    providerPaidBeforeUnits: v.optional(units),
    providerPaidAfterUnits: v.optional(units),
    idempotencyKey: identifier,
    failureCode: v.optional(identifier),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_businessId_and_currency_and_state', ['businessId', 'currency', 'state'])
    .index('by_businessId_and_currency_and_state_and_updatedAt', ['businessId', 'currency', 'state', 'updatedAt'])
    .index('by_periodStart_and_state', ['periodStart', 'state'])
    .index('by_stripeTransferId', ['stripeTransferId'])
    .index('by_payoutRef', ['payoutRef'])
    .index('by_businessId_and_currency_and_updatedAt', ['businessId', 'currency', 'updatedAt']),
} as const
