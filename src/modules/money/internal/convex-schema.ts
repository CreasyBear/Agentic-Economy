import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const currency = v.string()
const amountMinor = v.number()
const identifier = v.string()
const evidenceRefs = v.array(v.string())

export const moneyTables = {
  moneyAccounts: defineTable({
    accountRef: identifier,
    accountKind: v.union(v.literal('operator_credit'), v.literal('provider_earnings'), v.literal('ae_rake')),
    principalId: v.optional(identifier),
    businessId: v.optional(identifier),
    currency,
    balanceMinor: amountMinor,
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
    amountMinor,
    currency,
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
    .index('by_externalRef', ['externalRef']),
  moneyUsageEvents: defineTable({
    usageRef: identifier,
    principalId: identifier,
    credentialId: identifier,
    currency,
    serviceRef: identifier,
    offeringRef: identifier,
    businessId: identifier,
    invocationRef: identifier,
    attemptRef: identifier,
    operationKey: identifier,
    priceDigest: identifier,
    chargeState: v.union(v.literal('free_tier'), v.literal('paid'), v.literal('insufficient_credit'), v.literal('outcome_unknown'), v.literal('refunded')),
    amountMinor,
    transactionRef: v.optional(identifier),
    observedAt: v.number(),
  })
    .index('by_principalId_and_observedAt', ['principalId', 'observedAt'])
    .index('by_principalId_and_credentialId_and_observedAt', ['principalId', 'credentialId', 'observedAt'])
    .index('by_businessId_and_observedAt', ['businessId', 'observedAt'])
    .index('by_invocationRef', ['invocationRef']),
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
  moneyStripeEvents: defineTable({
    stripeEventId: identifier,
    eventType: identifier,
    payloadDigest: identifier,
    status: v.union(v.literal('received'), v.literal('applied'), v.literal('ignored'), v.literal('failed')),
    appliedRef: v.optional(identifier),
    receivedAt: v.number(),
    appliedAt: v.optional(v.number()),
  }).index('by_stripeEventId', ['stripeEventId']),
  moneyPayoutAccounts: defineTable({
    businessId: identifier,
    currency,
    stripeAccountId: identifier,
    state: v.union(v.literal('not_started'), v.literal('onboarding_started'), v.literal('submitted'), v.literal('restricted'), v.literal('ready')),
    detailsSubmitted: v.boolean(),
    recipientCapabilityActive: v.boolean(),
    requirementsDigest: identifier,
    lastStripeEventId: v.optional(identifier),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_businessId_and_currency', ['businessId', 'currency']),
  moneyPayouts: defineTable({
    payoutRef: identifier,
    businessId: identifier,
    currency,
    grossAccrualMinor: amountMinor,
    rakeMinor: amountMinor,
    providerNetMinor: amountMinor,
    minimumPayoutMinor: amountMinor,
    state: v.union(v.literal('review'), v.literal('held_kyc'), v.literal('held_threshold'), v.literal('transfer_pending'), v.literal('paid'), v.literal('failed'), v.literal('outcome_unknown')),
    periodStart: identifier,
    periodEnd: identifier,
    stripeTransferId: v.optional(identifier),
    idempotencyKey: identifier,
    failureCode: v.optional(identifier),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_businessId_and_currency_and_state', ['businessId', 'currency', 'state'])
    .index('by_periodStart_and_state', ['periodStart', 'state'])
    .index('by_stripeTransferId', ['stripeTransferId']),
} as const
