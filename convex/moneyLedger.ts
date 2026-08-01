import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, query } from './_generated/server'

const identifier = v.string()
const moneyArgs = {
  principalId: identifier,
  currency: identifier,
}
const limit = v.number()

function principalAllowed(identity: { tokenIdentifier?: string } | null, principalId: string): boolean {
  if (identity === null || identity.tokenIdentifier === undefined) return false
  return identity.tokenIdentifier === principalId || `clerk_api_key:${identity.tokenIdentifier}` === principalId
}

async function ownerPrincipalAllowed(
  identity: { issuer?: string; subject?: string; tokenIdentifier?: string } | null,
  principalId: string,
  loadPrincipal: () => Promise<Readonly<{ ownerId: string; ownerTokenIdentifier?: string }> | null>,
): Promise<boolean> {
  if (principalAllowed(identity, principalId)) return true
  if (identity?.subject === undefined) return false
  const principal = await loadPrincipal()
  if (principal === null || principal.ownerId !== identity.subject) return false
  if (principal.ownerTokenIdentifier === undefined) return true
  const identityRefs = [
    identity.tokenIdentifier,
    identity.issuer === undefined ? undefined : `${identity.issuer}|${identity.subject}`,
  ].filter((value): value is string => value !== undefined)
  return identityRefs.includes(principal.ownerTokenIdentifier)
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) return 1
  return Math.min(value, 100)
}

type ReconcileChargeResult =
  | Readonly<{ kind: 'accepted'; transactionRef: string; outcome: 'released' }>
  | Readonly<{ kind: 'accepted'; transactionRef: string; currency: string }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>

export const authorizeInvocationCharge = internalMutation({
  args: {
    principalId: identifier,
    currency: identifier,
    operatorAccountRef: identifier,
    providerAccountRef: identifier,
    rakeAccountRef: identifier,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    expectedAccountVersion: v.number(),
    amountMinor: v.number(),
    rakeBps: v.number(),
    priceDigest: identifier,
    credentialId: identifier,
    serviceRef: identifier,
    offeringRef: identifier,
    businessId: identifier,
    invocationRef: identifier,
    attemptRef: identifier,
    operationKey: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
    freeTier: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.principalId)) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor < 0) return { kind: 'refused' as const, code: 'price_unavailable' as const, retryable: false }
    const operator = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', args.operatorAccountRef)).unique()
    const provider = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', args.providerAccountRef)).unique()
    const rake = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', args.rakeAccountRef)).unique()
    if (operator === null || provider === null || rake === null) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    if (operator.currency !== args.currency || provider.currency !== args.currency || rake.currency !== args.currency) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const prior = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey)).unique()
    if (prior !== null) {
      if (prior.inputDigest !== args.inputDigest || prior.principalId !== args.principalId) return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      return { kind: 'accepted' as const, chargeState: prior.kind === 'charge' ? 'paid' as const : 'free_tier' as const, currency: prior.currency, amountMinor: args.amountMinor, priceDigest: args.priceDigest, transactionRef: prior.transactionRef }
    }
    if (args.freeTier || args.amountMinor === 0) {
      await ctx.db.insert('moneyUsageEvents', {
        usageRef: `${args.invocationRef}:${args.attemptRef}:${args.operationKey}`,
        principalId: args.principalId,
        credentialId: args.credentialId,
        currency: args.currency,
        serviceRef: args.serviceRef,
        offeringRef: args.offeringRef,
        businessId: args.businessId,
        invocationRef: args.invocationRef,
        attemptRef: args.attemptRef,
        operationKey: args.operationKey,
        priceDigest: args.priceDigest,
        chargeState: 'free_tier',
        amountMinor: 0,
        observedAt: args.observedAt,
      })
      return { kind: 'accepted' as const, chargeState: 'free_tier' as const, currency: args.currency, amountMinor: 0, priceDigest: args.priceDigest }
    }
    if (!Number.isSafeInteger(args.rakeBps) || args.rakeBps < 0 || args.rakeBps > 10_000) return { kind: 'refused' as const, code: 'rake_not_configured' as const, retryable: false }
    const rakeProduct = args.amountMinor * args.rakeBps
    if (!Number.isSafeInteger(rakeProduct)) return { kind: 'refused' as const, code: 'rake_not_configured' as const, retryable: false }
    const rakeMinor = Math.floor(rakeProduct / 10_000)
    const providerNetMinor = args.amountMinor - rakeMinor
    if (!Number.isSafeInteger(providerNetMinor) || providerNetMinor < 0) return { kind: 'refused' as const, code: 'rake_not_configured' as const, retryable: false }
    if (operator.state !== 'active' || operator.balanceMinor < args.amountMinor) {
      await ctx.db.insert('moneyUsageEvents', {
        usageRef: `${args.invocationRef}:${args.attemptRef}:${args.operationKey}`,
        principalId: args.principalId,
        credentialId: args.credentialId,
        currency: args.currency,
        serviceRef: args.serviceRef,
        offeringRef: args.offeringRef,
        businessId: args.businessId,
        invocationRef: args.invocationRef,
        attemptRef: args.attemptRef,
        operationKey: args.operationKey,
        priceDigest: args.priceDigest,
        chargeState: 'insufficient_credit',
        amountMinor: args.amountMinor,
        observedAt: args.observedAt,
      })
      return { kind: 'refused' as const, code: 'insufficient_credit' as const, retryable: false, nextAction: 'credit_topup_required' as const, currency: args.currency, requiredAmountMinor: args.amountMinor, availableAmountMinor: operator.balanceMinor }
    }
    if (operator.version !== args.expectedAccountVersion) return { kind: 'refused' as const, code: 'ledger_cas_conflict' as const, retryable: true }
    const transaction = { transactionRef: args.transactionRef, kind: 'charge' as const, idempotencyKey: args.idempotencyKey, inputDigest: args.inputDigest, principalId: args.principalId, currency: args.currency, state: 'applied' as const, expectedAccountVersion: args.expectedAccountVersion, createdAt: args.observedAt, updatedAt: args.observedAt }
    const common = { transactionRef: args.transactionRef, idempotencyKey: args.idempotencyKey, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:charge`, accountRef: operator.accountRef, entryType: 'charge', direction: 'debit', amountMinor: args.amountMinor, currency: args.currency, principalId: args.principalId, invocationRef: args.invocationRef, attemptRef: args.attemptRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:provider`, accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'credit', amountMinor: providerNetMinor, currency: args.currency, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:rake`, accountRef: rake.accountRef, entryType: 'rake', direction: 'credit', amountMinor: rakeMinor, currency: args.currency, businessId: args.businessId })
    await ctx.db.patch('moneyAccounts', operator._id, { balanceMinor: operator.balanceMinor - args.amountMinor, version: operator.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', provider._id, { balanceMinor: provider.balanceMinor + providerNetMinor, version: provider.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', rake._id, { balanceMinor: rake.balanceMinor + rakeMinor, version: rake.version + 1, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', transaction)
    await ctx.db.insert('moneyUsageEvents', { usageRef: `${args.invocationRef}:${args.attemptRef}:${args.operationKey}`, principalId: args.principalId, credentialId: args.credentialId, currency: args.currency, serviceRef: args.serviceRef, offeringRef: args.offeringRef, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef, operationKey: args.operationKey, priceDigest: args.priceDigest, chargeState: 'paid', amountMinor: args.amountMinor, transactionRef: args.transactionRef, observedAt: args.observedAt })
    return { kind: 'accepted' as const, chargeState: 'paid' as const, currency: args.currency, amountMinor: args.amountMinor, priceDigest: args.priceDigest, transactionRef: args.transactionRef, providerNetMinor, rakeMinor }
  },
})
export const applyCreditTopup = internalMutation({
  args: {
    principalId: identifier,
    accountRef: identifier,
    currency: identifier,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    amountMinor: v.number(),
    stripeEventId: identifier,
    eventType: v.literal('payment_intent.succeeded'),
    externalRef: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.principalId)) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor < 0 || args.evidenceRefs.length === 0) return { kind: 'refused' as const, code: 'credit_topup_amount_invalid' as const, retryable: false }
    const priorEvent = await ctx.db.query('moneyStripeEvents').withIndex('by_stripeEventId', (q) => q.eq('stripeEventId', args.stripeEventId)).unique()
    if (priorEvent?.status === 'applied') return { kind: 'accepted' as const, transactionRef: priorEvent.appliedRef ?? args.transactionRef, amountMinor: args.amountMinor, currency: args.currency }
    const account = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', args.accountRef)).unique()
    if (account === null || account.accountKind !== 'operator_credit' || account.principalId !== args.principalId || account.currency !== args.currency) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const priorTransaction = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey)).unique()
    if (priorTransaction !== null) {
      if (priorTransaction.inputDigest !== args.inputDigest || priorTransaction.principalId !== args.principalId) return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: priorTransaction.transactionRef, amountMinor: args.amountMinor, currency: args.currency }
    }
    const transaction = { transactionRef: args.transactionRef, kind: 'topup' as const, idempotencyKey: args.idempotencyKey, inputDigest: args.inputDigest, principalId: args.principalId, currency: args.currency, state: 'applied' as const, expectedAccountVersion: account.version, externalRef: args.externalRef, createdAt: args.observedAt, updatedAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { entryRef: `${args.transactionRef}:topup`, accountRef: account.accountRef, entryType: 'topup', direction: 'credit', amountMinor: args.amountMinor, currency: args.currency, transactionRef: args.transactionRef, idempotencyKey: args.idempotencyKey, principalId: args.principalId, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', account._id, { balanceMinor: account.balanceMinor + args.amountMinor, version: account.version + 1, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', transaction)
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', { stripeEventId: args.stripeEventId, eventType: args.eventType, payloadDigest: args.sourceDigest, status: 'applied', appliedRef: args.transactionRef, receivedAt: args.observedAt, appliedAt: args.observedAt })
    else await ctx.db.patch('moneyStripeEvents', priorEvent._id, { status: 'applied', appliedRef: args.transactionRef, appliedAt: args.observedAt })
    return { kind: 'accepted' as const, transactionRef: args.transactionRef, amountMinor: args.amountMinor, currency: args.currency }
  },
})


export const releasePayoutAccrual = internalMutation({
  args: {
    businessId: identifier,
    currency: identifier,
    providerAccountRef: identifier,
    payoutRef: identifier,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    amountMinor: v.number(),
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', args.providerAccountRef)).unique()
    if (account === null || account.accountKind !== 'provider_earnings' || account.businessId !== args.businessId || account.currency !== args.currency) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor <= 0) return { kind: 'refused' as const, code: 'payout_not_ready' as const, retryable: false }
    if (account.balanceMinor < args.amountMinor) return { kind: 'refused' as const, code: 'payout_below_threshold' as const, retryable: false }
    const prior = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey)).unique()
    if (prior !== null) {
      if (prior.inputDigest !== args.inputDigest) return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: prior.transactionRef, amountMinor: args.amountMinor, currency: args.currency }
    }
    await ctx.db.insert('moneyLedgerEntries', { entryRef: `${args.transactionRef}:payout`, accountRef: account.accountRef, entryType: 'payout_accrual', direction: 'debit', amountMinor: args.amountMinor, currency: args.currency, transactionRef: args.transactionRef, idempotencyKey: args.idempotencyKey, businessId: args.businessId, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', account._id, { balanceMinor: account.balanceMinor - args.amountMinor, version: account.version + 1, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', { transactionRef: args.transactionRef, kind: 'payout_accrual', idempotencyKey: args.idempotencyKey, inputDigest: args.inputDigest, principalId: `business:${args.businessId}`, currency: args.currency, state: 'applied', expectedAccountVersion: account.version, externalRef: args.payoutRef, createdAt: args.observedAt, updatedAt: args.observedAt })
    return { kind: 'accepted' as const, transactionRef: args.transactionRef, amountMinor: args.amountMinor, currency: args.currency }
  },
})
export const appendRefund = internalMutation({
  args: {
    principalId: identifier,
    originalTransactionRef: identifier,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.principalId)) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    const original = await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', args.originalTransactionRef)).unique()
    if (original === null || original.kind !== 'charge' || original.principalId !== args.principalId) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const prior = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey)).unique()
    if (prior !== null) {
      if (prior.inputDigest !== args.inputDigest) return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: prior.transactionRef, currency: original.currency }
    }
    const existingReversal = await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', args.transactionRef)).unique()
    if (existingReversal !== null) return { kind: 'accepted' as const, transactionRef: existingReversal.transactionRef, currency: original.currency }
    const entries = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', args.originalTransactionRef)).take(4)
    const charge = entries.find((entry) => entry.entryType === 'charge' && entry.direction === 'debit')
    const provider = entries.find((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'credit')
    const rake = entries.find((entry) => entry.entryType === 'rake' && entry.direction === 'credit')
    if (charge === undefined || provider === undefined || rake === undefined) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const operatorAccount = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', charge.accountRef)).unique()
    const providerAccount = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', provider.accountRef)).unique()
    const rakeAccount = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', rake.accountRef)).unique()
    if (operatorAccount === null || providerAccount === null || rakeAccount === null || providerAccount.balanceMinor < provider.amountMinor || rakeAccount.balanceMinor < rake.amountMinor) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const common = { transactionRef: args.transactionRef, idempotencyKey: args.idempotencyKey, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:operator`, accountRef: operatorAccount.accountRef, entryType: 'refund', direction: 'credit', amountMinor: charge.amountMinor, currency: original.currency, principalId: args.principalId, reversalOf: args.originalTransactionRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:provider`, accountRef: providerAccount.accountRef, entryType: 'refund', direction: 'debit', amountMinor: provider.amountMinor, currency: original.currency, ...(provider.businessId === undefined ? {} : { businessId: provider.businessId }), reversalOf: args.originalTransactionRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:rake`, accountRef: rakeAccount.accountRef, entryType: 'refund', direction: 'debit', amountMinor: rake.amountMinor, currency: original.currency, ...(rake.businessId === undefined ? {} : { businessId: rake.businessId }), reversalOf: args.originalTransactionRef })
    await ctx.db.patch('moneyAccounts', operatorAccount._id, { balanceMinor: operatorAccount.balanceMinor + charge.amountMinor, version: operatorAccount.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', providerAccount._id, { balanceMinor: providerAccount.balanceMinor - provider.amountMinor, version: providerAccount.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', rakeAccount._id, { balanceMinor: rakeAccount.balanceMinor - rake.amountMinor, version: rakeAccount.version + 1, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', { transactionRef: args.transactionRef, kind: 'refund', idempotencyKey: args.idempotencyKey, inputDigest: args.inputDigest, principalId: args.principalId, currency: original.currency, state: 'reversed', expectedAccountVersion: operatorAccount.version, reversalOf: args.originalTransactionRef, createdAt: args.observedAt, updatedAt: args.observedAt })
    await ctx.db.patch('moneyTransactions', original._id, { state: 'reversed', updatedAt: args.observedAt })
    return { kind: 'accepted' as const, transactionRef: args.transactionRef, currency: original.currency }
  },
})

export const reconcileCharge = internalMutation({
  args: {
    principalId: identifier,
    transactionRef: identifier,
    outcome: v.union(v.literal('not_released'), v.literal('released')),
    refundTransactionRef: identifier,
    refundIdempotencyKey: identifier,
    refundInputDigest: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  handler: async (ctx, args): Promise<ReconcileChargeResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.principalId)) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false as const }
    const transaction = await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', args.transactionRef)).unique()
    if (transaction === null || transaction.principalId !== args.principalId || transaction.kind !== 'charge') return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false as const }
    if (args.outcome === 'released') {
      if (transaction.state === 'outcome_unknown') await ctx.db.patch('moneyTransactions', transaction._id, { state: 'applied', updatedAt: args.observedAt })
      return { kind: 'accepted' as const, transactionRef: args.transactionRef, outcome: 'released' as const }
    }
    return await ctx.runMutation(internal.moneyLedger.appendRefund, { principalId: args.principalId, originalTransactionRef: args.transactionRef, transactionRef: args.refundTransactionRef, idempotencyKey: args.refundIdempotencyKey, inputDigest: args.refundInputDigest, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, observedAt: args.observedAt })
  },
})


export const markChargeOutcomeUnknown = internalMutation({
  args: { transactionRef: identifier, principalId: identifier, now: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.principalId)) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    const transaction = await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', args.transactionRef)).unique()
    if (transaction === null || transaction.principalId !== args.principalId || transaction.kind !== 'charge') return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    if (transaction.state === 'outcome_unknown') return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    await ctx.db.patch('moneyTransactions', transaction._id, { state: 'outcome_unknown', updatedAt: args.now })
    return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
  },
})

export const readCreditAccount = query({
  args: { ...moneyArgs },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!await ownerPrincipalAllowed(identity, args.principalId, async () => await ctx.db.query('customerRequestAgentPrincipals').withIndex('by_principalId', (q) => q.eq('principalId', args.principalId)).unique())) return { kind: 'refused' as const, code: 'billing_identity_missing' as const }
    const account = await ctx.db.query('moneyAccounts').withIndex('by_principalId_and_currency', (q) => q.eq('principalId', args.principalId).eq('currency', args.currency)).unique()
    if (account === null) return { kind: 'refused' as const, code: 'billing_identity_missing' as const }
    return { kind: 'ok' as const, principalId: args.principalId, currency: args.currency, balanceMinor: account.balanceMinor, autoRecharge: { enabled: false, thresholdMinor: 0, rechargeAmountMinor: 0 }, evidence: 'source' as const }
  },
})

export const listCreditActivity = query({
  args: { principalId: identifier, credentialId: v.optional(identifier), currency: v.optional(identifier), from: v.optional(v.number()), to: v.optional(v.number()), cursor: v.optional(identifier), limit },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!await ownerPrincipalAllowed(identity, args.principalId, async () => await ctx.db.query('customerRequestAgentPrincipals').withIndex('by_principalId', (q) => q.eq('principalId', args.principalId)).unique())) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, items: [] as const }
    const rows = await ctx.db.query('moneyUsageEvents').withIndex('by_principalId_and_observedAt', (q) => {
      const ranged = q.eq('principalId', args.principalId)
      return args.from === undefined ? ranged : ranged.gte('observedAt', args.from)
    }).order('desc').take(boundedLimit(args.limit))
    const items = rows.filter((row) => (args.credentialId === undefined || row.credentialId === args.credentialId) && (args.currency === undefined || row.currency === args.currency) && (args.to === undefined || row.observedAt <= args.to)).map((row) => ({ activityRef: row.usageRef, credentialId: row.credentialId, serviceRef: row.serviceRef, offeringRef: row.offeringRef, businessId: row.businessId, operationKey: row.operationKey, grossAmountMinor: row.amountMinor, currency: row.currency, chargeState: row.chargeState, observedAt: row.observedAt, ...(row.transactionRef === undefined ? {} : { transactionRef: row.transactionRef }) }))
    return { kind: 'ok' as const, items, ...(args.cursor === undefined ? {} : { nextCursor: args.cursor }) }
  },
})

export const readKeyUsage = query({
  args: { principalId: identifier, credentialId: v.optional(identifier), from: v.optional(v.number()), to: v.optional(v.number()), cursor: v.optional(identifier), limit },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!await ownerPrincipalAllowed(identity, args.principalId, async () => await ctx.db.query('customerRequestAgentPrincipals').withIndex('by_principalId', (q) => q.eq('principalId', args.principalId)).unique())) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, items: [] as const }
    const rows = await ctx.db.query('moneyUsageEvents').withIndex('by_principalId_and_observedAt', (q) => q.eq('principalId', args.principalId)).order('desc').take(boundedLimit(args.limit))
    const filtered = rows.filter((row) => (args.credentialId === undefined || row.credentialId === args.credentialId) && (args.from === undefined || row.observedAt >= args.from) && (args.to === undefined || row.observedAt <= args.to))
    const byKey = new Map<string, { credentialId: string; callCount: number; paidCallCount: number; freeCallCount: number; grossSpendMinor: number; currency: string; states: string[] }>()
    for (const row of filtered) {
      const prior = byKey.get(row.credentialId)
      if (prior === undefined) byKey.set(row.credentialId, { credentialId: row.credentialId, callCount: 1, paidCallCount: row.chargeState === 'paid' ? 1 : 0, freeCallCount: row.chargeState === 'free_tier' ? 1 : 0, grossSpendMinor: row.chargeState === 'paid' ? row.amountMinor : 0, currency: row.currency, states: [row.chargeState] })
      else {
        prior.callCount += 1
        if (row.chargeState === 'paid') { prior.paidCallCount += 1; prior.grossSpendMinor += row.amountMinor }
        if (row.chargeState === 'free_tier') prior.freeCallCount += 1
        if (!prior.states.includes(row.chargeState)) prior.states.push(row.chargeState)
      }
    }
    return { kind: 'ok' as const, items: [...byKey.values()], ...(args.cursor === undefined ? {} : { nextCursor: args.cursor }) }
  },
})

export const readProviderEarnings = query({
  args: { businessId: identifier, currency: identifier, cursor: v.optional(identifier), limit },
  handler: async (ctx, args) => {
    const account = await ctx.db.query('moneyAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', args.currency)).unique()
    if (account === null) return { kind: 'refused' as const, code: 'payout_not_ready' as const }
    return { kind: 'ok' as const, businessId: args.businessId, currency: args.currency, grossAccrualMinor: account.balanceMinor, rakeMinor: 0, providerNetMinor: account.balanceMinor, paidOutMinor: 0, heldMinor: account.balanceMinor, evidence: 'source' as const }
  },
})

export const readPayoutStatus = query({
  args: { businessId: identifier, currency: identifier },
  handler: async (ctx, args) => {
    const account = await ctx.db.query('moneyPayoutAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', args.currency)).unique()
    const payout = account === null ? null : await ctx.db.query('moneyPayouts').withIndex('by_businessId_and_currency_and_state', (q) => q.eq('businessId', args.businessId).eq('currency', args.currency).eq('state', 'review')).order('desc').take(1)
    const current = payout?.[0]
    return { kind: 'ok' as const, businessId: args.businessId, currency: args.currency, accountState: account?.state ?? 'missing', ...(current === undefined ? {} : { payoutState: current.state }), providerNetMinor: current?.providerNetMinor ?? 0, minimumPayoutMinor: current?.minimumPayoutMinor ?? 0, evidence: 'source' as const }
  },
})
