import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, internalQuery, query, type MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  accountRefForOperator,
  accountRefForProvider,
  accountRefForRake,
  evaluateLiveMoneyGate,
  transitionPayout,
  validateChargeAccounts,
  type MoneyPayout,
} from '../src/modules/money/public'
type MoneyUsageEventInput = Omit<Doc<'moneyUsageEvents'>, '_id' | '_creationTime'>

async function insertMoneyUsageEvent(ctx: MutationCtx, event: MoneyUsageEventInput): Promise<boolean> {
  const existing = await ctx.db.query('moneyUsageEvents').withIndex('by_usageRef', (q) => q.eq('usageRef', event.usageRef)).unique()
  if (existing !== null) return false
  await ctx.db.insert('moneyUsageEvents', event)
  const summary = await ctx.db.query('moneyCredentialUsageSummaries').withIndex('by_principalId_and_credentialId_and_currency', (q) => q.eq('principalId', event.principalId).eq('credentialId', event.credentialId).eq('currency', event.currency)).unique()
  const states = summary === null || summary.states.includes(event.chargeState) ? summary?.states ?? [event.chargeState] : [...summary.states, event.chargeState]
  const paidCall = event.chargeState === 'paid' ? 1 : 0
  const freeCall = event.chargeState === 'free_tier' ? 1 : 0
  const spend = event.chargeState === 'paid' ? event.amountMinor : 0
  if (summary === null) {
    await ctx.db.insert('moneyCredentialUsageSummaries', { principalId: event.principalId, credentialId: event.credentialId, currency: event.currency, callCount: 1, paidCallCount: paidCall, freeCallCount: freeCall, grossSpendMinor: spend, states, updatedAt: event.observedAt })
  } else {
    await ctx.db.patch(summary._id, { callCount: summary.callCount + 1, paidCallCount: summary.paidCallCount + paidCall, freeCallCount: summary.freeCallCount + freeCall, grossSpendMinor: summary.grossSpendMinor + spend, states, updatedAt: event.observedAt })
  }
  return true
}

const identifier = v.string()
const moneyArgs = {
  principalId: identifier,
  currency: identifier,
}

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

function safeBalance(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

type ReconcileChargeResult =
  | Readonly<{ kind: 'accepted'; transactionRef: string; outcome: 'released' }>
  | Readonly<{ kind: 'accepted'; transactionRef: string; currency: string }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>;

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
    priceSourceDigest: identifier,
    authorityMaximumSpendMinor: v.number(),
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
    if (args.amountMinor > 0 && !args.freeTier) {
      const gate = evaluateLiveMoneyGate()
      if (gate.kind === 'refused') return gate
    }
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor < 0 || !Number.isSafeInteger(args.authorityMaximumSpendMinor) || args.authorityMaximumSpendMinor < 0) return { kind: 'refused' as const, code: 'price_unavailable' as const, retryable: false }
    const offering = await ctx.db.query('capabilityOfferings').withIndex('by_offeringId', (q) => q.eq('offeringId', args.offeringRef)).unique()
    if (offering === null || offering.businessId.toString() !== args.businessId || offering.status !== 'active') return { kind: 'refused' as const, code: 'price_unavailable' as const, retryable: false }
    const publishedPrice = offering.presentation.price
    if (publishedPrice.kind !== 'fixed') return { kind: 'refused' as const, code: 'price_unavailable' as const, retryable: false }
    if (publishedPrice.currency !== args.currency) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const expectedPriceDigest = canonicalDigest({ version: 'pricing:v1', unit: 'call', currency: publishedPrice.currency, paidAmountMinor: publishedPrice.amountMinor })
    if (args.amountMinor !== publishedPrice.amountMinor || args.priceDigest !== expectedPriceDigest || args.priceSourceDigest !== expectedPriceDigest || args.freeTier || args.rakeBps !== 1_000) return { kind: 'refused' as const, code: 'price_changed' as const, retryable: false }
    if (args.amountMinor > args.authorityMaximumSpendMinor) return { kind: 'refused' as const, code: 'price_changed' as const, retryable: false }
    const expectedOperatorRef = accountRefForOperator(args.principalId, args.currency)
    const expectedProviderRef = accountRefForProvider(args.businessId, args.currency)
    const expectedRakeRef = accountRefForRake(args.currency)
    if (args.operatorAccountRef !== expectedOperatorRef || args.providerAccountRef !== expectedProviderRef || args.rakeAccountRef !== expectedRakeRef) return { kind: 'refused' as const, code: 'billing_identity_mismatch' as const, retryable: false }
    const [operator, provider, rake] = await Promise.all([
      ctx.db.query('moneyAccounts').withIndex('by_principalId_and_currency', (q) => q.eq('principalId', args.principalId).eq('currency', args.currency)).unique(),
      ctx.db.query('moneyAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', args.currency)).unique(),
      ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', expectedRakeRef)).unique(),
    ])
    const accountRefusal = validateChargeAccounts({ operator: operator ?? undefined, provider: provider ?? undefined, rake: rake ?? undefined, operatorAccountRef: expectedOperatorRef, providerAccountRef: expectedProviderRef, rakeAccountRef: expectedRakeRef, principalId: args.principalId, businessId: args.businessId, currency: args.currency })
    if (accountRefusal !== undefined) return accountRefusal
    if (operator === null || provider === null || rake === null) {
      return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    }
    const prior = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey)).unique()
    if (prior !== null) {
      if (prior.inputDigest !== args.inputDigest || prior.principalId !== args.principalId || prior.kind !== 'charge') return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      const entries = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', prior.transactionRef)).take(3)
      const charge = entries.find((entry) => entry.entryType === 'charge' && entry.direction === 'debit')
      const providerEntry = entries.find((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'credit')
      const rakeEntry = entries.find((entry) => entry.entryType === 'rake' && entry.direction === 'credit')
      if (charge === undefined || providerEntry === undefined || rakeEntry === undefined) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
      return { kind: 'accepted' as const, chargeState: 'paid' as const, currency: prior.currency, amountMinor: charge.amountMinor, priceDigest: expectedPriceDigest, transactionRef: prior.transactionRef, providerNetMinor: providerEntry.amountMinor, rakeMinor: rakeEntry.amountMinor }
    }
    const rakeProduct = args.amountMinor * args.rakeBps
    if (!Number.isSafeInteger(rakeProduct)) return { kind: 'refused' as const, code: 'rake_not_configured' as const, retryable: false }
    const rakeMinor = Math.floor(rakeProduct / 10_000)
    const providerNetMinor = args.amountMinor - rakeMinor
    if (!Number.isSafeInteger(providerNetMinor) || providerNetMinor < 0) return { kind: 'refused' as const, code: 'rake_not_configured' as const, retryable: false }
    const usageRef = `${args.invocationRef}:${args.attemptRef}:${args.operationKey}`
    if (args.amountMinor === 0) {
      const existingUsage = await ctx.db.query('moneyUsageEvents').withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef)).unique()
      if (existingUsage !== null) return { kind: 'accepted' as const, chargeState: 'free_tier' as const, currency: existingUsage.currency, amountMinor: existingUsage.amountMinor, priceDigest: existingUsage.priceDigest }
      const windowStart = new Date(args.observedAt).toISOString().slice(0, 10)
      const counter = await ctx.db.query('moneyFreeTierCounters').withIndex('by_principalId_and_offeringRef_and_windowStart', (q) => q.eq('principalId', args.principalId).eq('offeringRef', args.offeringRef).eq('windowStart', windowStart)).unique()
      if (counter !== null && counter.callsUsed >= 1) return { kind: 'refused' as const, code: 'credit_topup_required' as const, retryable: false, nextAction: 'credit_topup_required' as const }
      if (counter === null) await ctx.db.insert('moneyFreeTierCounters', { counterRef: `${args.principalId}:${args.offeringRef}:day:${windowStart}`, principalId: args.principalId, offeringRef: args.offeringRef, window: 'day', windowStart, callsUsed: 1, version: 1, updatedAt: args.observedAt })
      else await ctx.db.patch('moneyFreeTierCounters', counter._id, { callsUsed: counter.callsUsed + 1, version: counter.version + 1, updatedAt: args.observedAt })
      await insertMoneyUsageEvent(ctx, { usageRef, principalId: args.principalId, credentialId: args.credentialId, currency: args.currency, serviceRef: args.serviceRef, offeringRef: args.offeringRef, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef, operationKey: args.operationKey, priceDigest: expectedPriceDigest, chargeState: 'free_tier', amountMinor: 0, observedAt: args.observedAt })
      return { kind: 'accepted' as const, chargeState: 'free_tier' as const, currency: args.currency, amountMinor: 0, priceDigest: expectedPriceDigest }
    }
    const operatorBalance = operator.balanceMinor - args.amountMinor
    const providerBalance = provider.balanceMinor + providerNetMinor
    const rakeBalance = rake.balanceMinor + rakeMinor
    if (!safeBalance(operatorBalance) || !safeBalance(providerBalance) || !safeBalance(rakeBalance)) return { kind: 'refused' as const, code: 'price_unavailable' as const, retryable: false }
    if (operator.state !== 'active' || operator.balanceMinor < args.amountMinor) {
      const existingUsage = await ctx.db.query('moneyUsageEvents').withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef)).unique()
      if (existingUsage === null) await insertMoneyUsageEvent(ctx, { usageRef, principalId: args.principalId, credentialId: args.credentialId, currency: args.currency, serviceRef: args.serviceRef, offeringRef: args.offeringRef, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef, operationKey: args.operationKey, priceDigest: expectedPriceDigest, chargeState: 'insufficient_credit', amountMinor: args.amountMinor, observedAt: args.observedAt })
      return { kind: 'refused' as const, code: 'insufficient_credit' as const, retryable: false, nextAction: 'credit_topup_required' as const, currency: args.currency, requiredAmountMinor: args.amountMinor, availableAmountMinor: operator.balanceMinor }
    }
    if (operator.version !== args.expectedAccountVersion) return { kind: 'refused' as const, code: 'ledger_cas_conflict' as const, retryable: true }
    const transaction = { transactionRef: args.transactionRef, kind: 'charge' as const, idempotencyKey: args.idempotencyKey, inputDigest: args.inputDigest, principalId: args.principalId, currency: args.currency, state: 'applied' as const, expectedAccountVersion: args.expectedAccountVersion, createdAt: args.observedAt, updatedAt: args.observedAt }
    const common = { transactionRef: args.transactionRef, idempotencyKey: args.idempotencyKey, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:charge`, accountRef: operator.accountRef, entryType: 'charge', direction: 'debit', amountMinor: args.amountMinor, currency: args.currency, principalId: args.principalId, invocationRef: args.invocationRef, attemptRef: args.attemptRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:provider`, accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'credit', amountMinor: providerNetMinor, currency: args.currency, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:rake`, accountRef: rake.accountRef, entryType: 'rake', direction: 'credit', amountMinor: rakeMinor, currency: args.currency, businessId: args.businessId })
    await ctx.db.patch('moneyAccounts', operator._id, { balanceMinor: operatorBalance, version: operator.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', provider._id, { balanceMinor: providerBalance, version: provider.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', rake._id, { balanceMinor: rakeBalance, version: rake.version + 1, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', transaction)
    await insertMoneyUsageEvent(ctx, { usageRef, principalId: args.principalId, credentialId: args.credentialId, currency: args.currency, serviceRef: args.serviceRef, offeringRef: args.offeringRef, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef, operationKey: args.operationKey, priceDigest: expectedPriceDigest, chargeState: 'paid', amountMinor: args.amountMinor, transactionRef: args.transactionRef, observedAt: args.observedAt })
    return { kind: 'accepted' as const, chargeState: 'paid' as const, currency: args.currency, amountMinor: args.amountMinor, priceDigest: expectedPriceDigest, transactionRef: args.transactionRef, providerNetMinor, rakeMinor }
  },
})
export const applyCreditTopup = internalMutation({
  args: {
    commandRef: identifier,
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
    providerSignatureVerified: v.literal(true),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity !== null && !principalAllowed(identity, args.principalId)) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor < 0 || args.evidenceRefs.length === 0) return { kind: 'refused' as const, code: 'credit_topup_amount_invalid' as const, retryable: false }
    const priorEvent = await ctx.db.query('moneyStripeEvents').withIndex('by_stripeEventId', (q) => q.eq('stripeEventId', args.stripeEventId)).unique()
    if (priorEvent !== null && (priorEvent.eventType !== args.eventType || priorEvent.payloadDigest !== args.sourceDigest)) return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
    if (priorEvent?.status === 'applied') {
      const appliedRef = priorEvent.appliedRef
      const priorTransaction = appliedRef === undefined ? null : await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', appliedRef)).unique()
      const priorEntry = appliedRef === undefined ? null : await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', appliedRef)).unique()
      if (priorTransaction === null || priorEntry === null || priorTransaction.kind !== 'topup' || priorTransaction.externalRef !== args.externalRef || priorEntry.amountMinor !== args.amountMinor || priorEntry.currency !== args.currency) return { kind: 'refused' as const, code: 'credit_topup_outcome_unknown' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: priorTransaction.transactionRef, amountMinor: priorEntry.amountMinor, currency: priorEntry.currency }
    }
    const command = await ctx.db.query('moneyTopupCommands').withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef)).unique()
    if (command === null || command.principalId !== args.principalId || command.accountRef !== args.accountRef || command.currency !== args.currency || command.externalRef !== args.externalRef || command.chargeAmountMinor !== args.amountMinor || command.idempotencyKey !== args.idempotencyKey || command.inputDigest !== args.inputDigest) return { kind: 'refused' as const, code: 'credit_topup_pending' as const, retryable: true }
    if (command.state === 'succeeded') {
      const priorTransaction = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', command.idempotencyKey)).unique()
      const priorEntry = priorTransaction === null ? null : await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', priorTransaction.transactionRef)).unique()
      if (priorTransaction === null || priorEntry === null) return { kind: 'refused' as const, code: 'credit_topup_outcome_unknown' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: priorTransaction.transactionRef, amountMinor: priorEntry.amountMinor, currency: priorEntry.currency }
    }
    const account = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', command.accountRef)).unique()
    if (account === null || account.accountKind !== 'operator_credit' || account.principalId !== command.principalId || account.currency !== command.currency) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const priorTransaction = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', command.idempotencyKey)).unique()
    if (priorTransaction !== null) {
      if (priorTransaction.inputDigest !== command.inputDigest || priorTransaction.principalId !== command.principalId || priorTransaction.kind !== 'topup') return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      const priorEntry = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', priorTransaction.transactionRef)).unique()
      if (priorEntry === null || priorEntry.amountMinor !== command.amountMinor || priorEntry.currency !== command.currency) return { kind: 'refused' as const, code: 'credit_topup_outcome_unknown' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: priorTransaction.transactionRef, amountMinor: priorEntry.amountMinor, currency: priorEntry.currency }
    }
    const nextBalance = account.balanceMinor + command.amountMinor
    if (!safeBalance(nextBalance)) return { kind: 'refused' as const, code: 'credit_topup_amount_invalid' as const, retryable: false }
    const transaction = { transactionRef: args.transactionRef, kind: 'topup' as const, idempotencyKey: command.idempotencyKey, inputDigest: command.inputDigest, principalId: command.principalId, currency: command.currency, state: 'applied' as const, expectedAccountVersion: account.version, externalRef: command.externalRef, createdAt: args.observedAt, updatedAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { entryRef: `${args.transactionRef}:topup`, accountRef: account.accountRef, entryType: 'topup', direction: 'credit', amountMinor: command.amountMinor, currency: command.currency, transactionRef: args.transactionRef, idempotencyKey: command.idempotencyKey, principalId: command.principalId, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', account._id, { balanceMinor: nextBalance, version: account.version + 1, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', transaction)
    await ctx.db.patch('moneyTopupCommands', command._id, { state: 'succeeded', updatedAt: args.observedAt })
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', { stripeEventId: args.stripeEventId, eventType: args.eventType, payloadDigest: args.sourceDigest, status: 'applied', appliedRef: args.transactionRef, receivedAt: args.observedAt, appliedAt: args.observedAt })
    else await ctx.db.patch('moneyStripeEvents', priorEvent._id, { status: 'applied', appliedRef: args.transactionRef, appliedAt: args.observedAt })
    return { kind: 'accepted' as const, transactionRef: args.transactionRef, amountMinor: command.amountMinor, currency: command.currency }
  },
})


export const releasePayoutAccrual = internalMutation({
  args: {
    authority: v.object({ principalId: identifier }),
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
    const payoutTransactions = await ctx.db.query('moneyTransactions').withIndex('by_externalRef', (q) => q.eq('externalRef', args.payoutRef)).take(2)
    const prior = payoutTransactions.find((transaction) => transaction.kind === 'payout_accrual')
    if (prior !== undefined) {
      if (prior.inputDigest !== args.inputDigest) return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      const priorEntry = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', prior.transactionRef)).unique()
      if (priorEntry === null) return { kind: 'refused' as const, code: 'payout_reconciliation_required' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: prior.transactionRef, amountMinor: priorEntry.amountMinor, currency: priorEntry.currency }
    }
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.authority.principalId)) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor <= 0 || args.evidenceRefs.length === 0) return { kind: 'refused' as const, code: 'payout_not_ready' as const, retryable: false }
    const expectedProviderRef = accountRefForProvider(args.businessId, args.currency)
    if (args.providerAccountRef !== expectedProviderRef) return { kind: 'refused' as const, code: 'billing_identity_mismatch' as const, retryable: false }
    const account = await ctx.db.query('moneyAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', args.currency)).unique()
    if (account === null || account.accountKind !== 'provider_earnings' || account.accountRef !== expectedProviderRef) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const [payoutAccount, payout] = await Promise.all([
      ctx.db.query('moneyPayoutAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', args.currency)).unique(),
      ctx.db.query('moneyPayouts').withIndex('by_payoutRef', (q) => q.eq('payoutRef', args.payoutRef)).unique(),
    ])
    if (payoutAccount === null || payout === null || payout.businessId !== args.businessId || payout.currency !== args.currency) return { kind: 'refused' as const, code: 'payout_not_ready' as const, retryable: false }
    const current: MoneyPayout = {
      payoutRef: payout.payoutRef,
      businessId: payout.businessId,
      currency: payout.currency,
      grossAccrualMinor: payout.grossAccrualMinor,
      rakeMinor: payout.rakeMinor,
      providerNetMinor: payout.providerNetMinor,
      minimumPayoutMinor: payout.minimumPayoutMinor,
      state: payout.state,
      periodStart: payout.periodStart,
      periodEnd: payout.periodEnd,
      ...(payout.stripeTransferId === undefined ? {} : { stripeTransferId: payout.stripeTransferId }),
      idempotencyKey: payout.idempotencyKey,
      ...(payout.failureCode === undefined ? {} : { failureCode: payout.failureCode }),
      createdAt: payout.createdAt,
      updatedAt: payout.updatedAt,
    }
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: { kind: 'release_transfer' },
      account: { state: payoutAccount.state, detailsSubmitted: payoutAccount.detailsSubmitted, recipientCapabilityActive: payoutAccount.recipientCapabilityActive },
    })
    if (policy.kind === 'refused') return policy
    if (payout.providerNetMinor !== args.amountMinor || account.balanceMinor < args.amountMinor) return { kind: 'refused' as const, code: payout.providerNetMinor !== args.amountMinor ? 'payout_not_ready' as const : 'payout_below_threshold' as const, retryable: false }
    const priorIdempotency = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey)).unique()
    if (priorIdempotency !== null) {
      if (priorIdempotency.inputDigest !== args.inputDigest || priorIdempotency.externalRef !== args.payoutRef || priorIdempotency.kind !== 'payout_accrual') return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      const priorEntry = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', priorIdempotency.transactionRef)).unique()
      if (priorEntry === null) return { kind: 'refused' as const, code: 'payout_reconciliation_required' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: priorIdempotency.transactionRef, amountMinor: priorEntry.amountMinor, currency: priorEntry.currency }
    }
    const nextBalance = account.balanceMinor - args.amountMinor
    if (!safeBalance(nextBalance)) return { kind: 'refused' as const, code: 'payout_not_ready' as const, retryable: false }
    const transaction = { transactionRef: args.transactionRef, kind: 'payout_accrual' as const, idempotencyKey: args.idempotencyKey, inputDigest: args.inputDigest, principalId: `business:${args.businessId}`, currency: args.currency, state: 'applied' as const, expectedAccountVersion: account.version, externalRef: args.payoutRef, createdAt: args.observedAt, updatedAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { entryRef: `${args.transactionRef}:payout`, accountRef: account.accountRef, entryType: 'payout_accrual', direction: 'debit', amountMinor: args.amountMinor, currency: args.currency, transactionRef: args.transactionRef, idempotencyKey: args.idempotencyKey, businessId: args.businessId, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', account._id, { balanceMinor: nextBalance, version: account.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyPayouts', payout._id, { state: policy.value.state, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', transaction)
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
    if (original === null || original.kind !== 'charge' || original.principalId !== args.principalId || (original.state !== 'applied' && original.state !== 'outcome_unknown')) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    if (args.evidenceRefs.length === 0) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const prior = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey)).unique()
    if (prior !== null) {
      if (prior.inputDigest !== args.inputDigest) return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: prior.transactionRef, currency: original.currency }
    }
    const existingReversal = await ctx.db.query('moneyTransactions').withIndex('by_reversalOf', (q) => q.eq('reversalOf', args.originalTransactionRef)).take(1)
    if (existingReversal.length > 0) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const entries = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', args.originalTransactionRef)).take(4)
    const charge = entries.find((entry) => entry.entryType === 'charge' && entry.direction === 'debit')
    const provider = entries.find((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'credit')
    const rake = entries.find((entry) => entry.entryType === 'rake' && entry.direction === 'credit')
    if (charge === undefined || provider === undefined || rake === undefined) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const [operatorAccount, providerAccount, rakeAccount] = await Promise.all([
      ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', charge.accountRef)).unique(),
      ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', provider.accountRef)).unique(),
      ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', rake.accountRef)).unique(),
    ])
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
      if (transaction.state === 'reversed') return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false as const }
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
    if (transaction.state !== 'applied' && transaction.state !== 'pending') return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
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
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!await ownerPrincipalAllowed(identity, args.principalId, async () => await ctx.db.query('customerRequestAgentPrincipals').withIndex('by_principalId', (q) => q.eq('principalId', args.principalId)).unique())) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, items: [] as const }

    const page = await ctx.db.query('moneyUsageEvents').withIndex('by_principalId_and_credentialId_and_currency_and_observedAt', (q) => q.eq('principalId', args.principalId).eq('credentialId', args.credentialId).eq('currency', args.currency)).order('desc').paginate(args.paginationOpts)
    return {
      kind: 'ok' as const,
      page: page.page.map((row) => ({ activityRef: row.usageRef, credentialId: row.credentialId, serviceRef: row.serviceRef, offeringRef: row.offeringRef, businessId: row.businessId, operationKey: row.operationKey, grossAmountMinor: row.amountMinor, currency: row.currency, chargeState: row.chargeState, observedAt: row.observedAt, ...(row.transactionRef === undefined ? {} : { transactionRef: row.transactionRef }) })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
  },
})
export const readKeyUsage = query({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!await ownerPrincipalAllowed(identity, args.principalId, async () => await ctx.db.query('customerRequestAgentPrincipals').withIndex('by_principalId', (q) => q.eq('principalId', args.principalId)).unique())) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, items: [] as const }

    const summary = await ctx.db.query('moneyCredentialUsageSummaries').withIndex('by_principalId_and_credentialId_and_currency', (q) => q.eq('principalId', args.principalId).eq('credentialId', args.credentialId).eq('currency', args.currency)).unique()
    if (summary === null) return { kind: 'ok' as const, credentialId: args.credentialId, callCount: 0, paidCallCount: 0, freeCallCount: 0, grossSpendMinor: 0, currency: args.currency, states: [] as const }
    return { kind: 'ok' as const, credentialId: summary.credentialId, callCount: summary.callCount, paidCallCount: summary.paidCallCount, freeCallCount: summary.freeCallCount, grossSpendMinor: summary.grossSpendMinor, currency: summary.currency, states: summary.states }
  },
})



export const readProviderEarnings = internalQuery({
  args: { businessId: identifier, currency: identifier },
  handler: async (ctx, args) => {
    const account = await ctx.db.query('moneyAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', args.currency)).unique()
    if (account === null || account.accountKind !== 'provider_earnings') return { kind: 'refused' as const, code: 'payout_not_ready' as const }
    const rows = await ctx.db.query('moneyLedgerEntries').withIndex('by_businessId_and_createdAt', (q) => q.eq('businessId', args.businessId)).order('desc').take(100)
    const providerChargeCredits = rows.filter((entry) => entry.currency === args.currency && entry.accountRef === account.accountRef && entry.entryType === 'payout_accrual' && entry.direction === 'credit' && entry.invocationRef !== undefined).reduce((sum, entry) => sum + entry.amountMinor, 0)
    const rakeMinor = rows.filter((entry) => entry.currency === args.currency && entry.entryType === 'rake' && entry.direction === 'credit').reduce((sum, entry) => sum + entry.amountMinor, 0)
    const paidOutMinor = rows.filter((entry) => entry.currency === args.currency && entry.accountRef === account.accountRef && entry.entryType === 'payout_accrual' && entry.direction === 'debit').reduce((sum, entry) => sum + entry.amountMinor, 0)
    const refundReversals = rows.filter((entry) => entry.currency === args.currency && entry.accountRef === account.accountRef && entry.entryType === 'refund' && entry.direction === 'debit').reduce((sum, entry) => sum + entry.amountMinor, 0)
    return { kind: 'ok' as const, businessId: args.businessId, currency: args.currency, grossAccrualMinor: providerChargeCredits, rakeMinor, providerNetMinor: providerChargeCredits - refundReversals, paidOutMinor, heldMinor: account.balanceMinor, evidence: 'source' as const }
  },
})

export const readPayoutStatus = internalQuery({
  args: { businessId: identifier, currency: identifier },
  handler: async (ctx, args) => {
    const account = await ctx.db.query('moneyPayoutAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', args.currency)).unique()
    const current = account === null ? undefined : (await ctx.db.query('moneyPayouts').withIndex('by_businessId_and_currency_and_updatedAt', (q) => q.eq('businessId', args.businessId).eq('currency', args.currency)).order('desc').take(1))[0]
    return { kind: 'ok' as const, businessId: args.businessId, currency: args.currency, accountState: account?.state ?? 'missing', ...(current === undefined ? {} : { payoutState: current.state }), providerNetMinor: current?.providerNetMinor ?? 0, minimumPayoutMinor: current?.minimumPayoutMinor ?? 0, evidence: 'source' as const }
  },
})

