import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import type { Doc } from './_generated/dataModel'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  addExactAmounts,
  accountRefForOperator,
  accountRefForProvider,
  accountRefForRake,
  compareExactAmounts,
  evaluateLiveMoneyGate,
  exactAmountSchema,
  multiplyExactAmountByBps,
  rescaleExactAmount,
  subtractExactAmounts,
  transitionPayout,
  validateChargeAccounts,
  type ExactAmount,
  type MoneyAccount,
  type MoneyPayout,
} from '../src/modules/money/public'

type MoneyUsageEventInput = Omit<Doc<'moneyUsageEvents'>, '_id' | '_creationTime'>
type MoneyLedgerEntryRow = Doc<'moneyLedgerEntries'>

const identifier = v.string()
const exactAmount = v.object({
  currency: identifier,
  units: identifier,
  exponent: v.number(),
})
const moneyArgs = {
  principalId: identifier,
  currency: identifier,
}

function readAmount(value: unknown): ExactAmount | undefined {
  const parsed = exactAmountSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function amountFromParts(currency: string, units: string, exponent: number): ExactAmount | undefined {
  return readAmount({ currency, units, exponent })
}
function amountAtScale(amount: ExactAmount, currency: string, exponent: number): ExactAmount | undefined {
  if (amount.currency !== currency) return undefined
  return rescaleExactAmount(amount, exponent)
}

function zeroAmount(currency: string, exponent: number): ExactAmount | undefined {
  return amountFromParts(currency, '0', exponent)
}

function accountFromRow(row: Doc<'moneyAccounts'>): MoneyAccount | undefined {
  const balance = amountFromParts(row.currency, row.balanceUnits, row.exponent)
  if (balance === undefined) return undefined
  return {
    accountRef: row.accountRef,
    accountKind: row.accountKind,
    ...(row.principalId === undefined ? {} : { principalId: row.principalId }),
    ...(row.businessId === undefined ? {} : { businessId: row.businessId }),
    balance,
    version: row.version,
    state: row.state,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function payoutFromRow(row: Doc<'moneyPayouts'>): MoneyPayout | undefined {
  const grossAccrual = amountFromParts(row.currency, row.grossAccrualUnits, row.exponent)
  const rake = amountFromParts(row.currency, row.rakeUnits, row.exponent)
  const providerNet = amountFromParts(row.currency, row.providerNetUnits, row.exponent)
  const minimumPayout = amountFromParts(row.currency, row.minimumPayoutUnits, row.exponent)
  if (grossAccrual === undefined || rake === undefined || providerNet === undefined || minimumPayout === undefined) return undefined
  return {
    payoutRef: row.payoutRef,
    businessId: row.businessId,
    grossAccrual,
    rake,
    providerNet,
    minimumPayout,
    state: row.state,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    ...(row.stripeTransferId === undefined ? {} : { stripeTransferId: row.stripeTransferId }),
    idempotencyKey: row.idempotencyKey,
    ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}


function entryAmount(row: MoneyLedgerEntryRow): ExactAmount | undefined {
  return amountFromParts(row.currency, row.amountUnits, row.exponent)
}

async function insertMoneyUsageEvent(ctx: MutationCtx, event: MoneyUsageEventInput): Promise<boolean> {
  const existing = await ctx.db.query('moneyUsageEvents').withIndex('by_usageRef', (q) => q.eq('usageRef', event.usageRef)).unique()
  if (existing !== null) return false
  const eventAmount = amountFromParts(event.currency, event.amountUnits, event.exponent)
  if (eventAmount === undefined) return false
  const summary = await ctx.db.query('moneyCredentialUsageSummaries').withIndex('by_principalId_and_credentialId_and_currency', (q) => q.eq('principalId', event.principalId).eq('credentialId', event.credentialId).eq('currency', event.currency)).unique()
  const states = summary === null || summary.states.includes(event.chargeState) ? summary?.states ?? [event.chargeState] : [...summary.states, event.chargeState]
  const paidCall = event.chargeState === 'paid' ? 1 : 0
  const freeCall = event.chargeState === 'free_tier' ? 1 : 0
  const spend = event.chargeState === 'paid' ? eventAmount : zeroAmount(event.currency, event.exponent)
  if (spend === undefined) return false
  const nextGrossSpend = summary === null
    ? spend
    : (() => {
        const current = amountFromParts(summary.currency, summary.grossSpendUnits, summary.exponent)
        return current === undefined ? undefined : addExactAmounts(current, spend)
      })()
  if (nextGrossSpend === undefined) return false
  await ctx.db.insert('moneyUsageEvents', event)
  if (summary === null) {
    await ctx.db.insert('moneyCredentialUsageSummaries', {
      principalId: event.principalId,
      credentialId: event.credentialId,
      currency: nextGrossSpend.currency,
      exponent: nextGrossSpend.exponent,
      callCount: 1,
      paidCallCount: paidCall,
      freeCallCount: freeCall,
      grossSpendUnits: nextGrossSpend.units,
      states,
      updatedAt: event.observedAt,
    })
  } else {
    await ctx.db.patch(summary._id, {
      callCount: summary.callCount + 1,
      paidCallCount: summary.paidCallCount + paidCall,
      freeCallCount: summary.freeCallCount + freeCall,
      exponent: nextGrossSpend.exponent,
      grossSpendUnits: nextGrossSpend.units,
      states,
      updatedAt: event.observedAt,
    })
  }
  return true
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

type ReconcileChargeResult =
  | Readonly<{ kind: 'accepted'; transactionRef: string; outcome: 'released' }>
  | Readonly<{ kind: 'accepted'; transactionRef: string; currency: string }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>

export const authorizeInvocationCharge = internalMutation({
  args: {
    principalId: identifier,
    amount: exactAmount,
    operatorAccountRef: identifier,
    providerAccountRef: identifier,
    rakeAccountRef: identifier,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    expectedAccountVersion: v.number(),
    rakeBps: v.number(),
    priceDigest: identifier,
    priceSourceDigest: identifier,
    authorityMaximumSpend: exactAmount,
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
    const requestedAmount = readAmount(args.amount)
    const requestedMaximumSpend = readAmount(args.authorityMaximumSpend)
    if (requestedAmount === undefined || requestedMaximumSpend === undefined) return { kind: 'refused' as const, code: 'price_unavailable' as const, retryable: false }
    const offering = await ctx.db.query('capabilityOfferings').withIndex('by_offeringId', (q) => q.eq('offeringId', args.offeringRef)).unique()
    if (offering === null || offering.businessId.toString() !== args.businessId || offering.status !== 'active') return { kind: 'refused' as const, code: 'price_unavailable' as const, retryable: false }
    const publishedPrice = offering.presentation.price
    if (publishedPrice.kind !== 'fixed') return { kind: 'refused' as const, code: 'price_unavailable' as const, retryable: false }
    const publishedAmount = readAmount(publishedPrice.amount)
    if (publishedAmount === undefined) return { kind: 'refused' as const, code: 'price_unavailable' as const, retryable: false }
    if (requestedAmount.currency !== publishedAmount.currency || requestedMaximumSpend.currency !== publishedAmount.currency) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const amount = requestedAmount
    const authorityMaximumSpend = requestedMaximumSpend
    const authorityComparison = compareExactAmounts(amount, authorityMaximumSpend)
    if (authorityComparison === undefined) return { kind: 'refused' as const, code: 'price_changed' as const, retryable: false }
    if (amount.units !== '0' && !args.freeTier) {
      const gate = evaluateLiveMoneyGate()
      if (gate.kind === 'refused') return gate
    }
    const expectedPriceDigest = canonicalDigest({ version: 'pricing:v2', unit: 'call', paidAmount: publishedAmount })
    if (compareExactAmounts(amount, publishedAmount) !== 0 || args.priceDigest !== expectedPriceDigest || args.priceSourceDigest !== expectedPriceDigest || args.freeTier || args.rakeBps !== 1_000) return { kind: 'refused' as const, code: 'price_changed' as const, retryable: false }
    if (authorityComparison === 1) return { kind: 'refused' as const, code: 'price_changed' as const, retryable: false }
    const currency = amount.currency
    const expectedOperatorRef = accountRefForOperator(args.principalId, currency)
    const expectedProviderRef = accountRefForProvider(args.businessId, currency)
    const expectedRakeRef = accountRefForRake(currency)
    if (args.operatorAccountRef !== expectedOperatorRef || args.providerAccountRef !== expectedProviderRef || args.rakeAccountRef !== expectedRakeRef) return { kind: 'refused' as const, code: 'billing_identity_mismatch' as const, retryable: false }
    const [operator, provider, rakeAccount] = await Promise.all([
      ctx.db.query('moneyAccounts').withIndex('by_principalId_and_currency', (q) => q.eq('principalId', args.principalId).eq('currency', currency)).unique(),
      ctx.db.query('moneyAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', currency)).unique(),
      ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', expectedRakeRef)).unique(),
    ])
    const operatorDomain = operator === null ? undefined : accountFromRow(operator)
    const providerDomain = provider === null ? undefined : accountFromRow(provider)
    const rakeDomain = rakeAccount === null ? undefined : accountFromRow(rakeAccount)
    const accountRefusal = validateChargeAccounts({ operator: operatorDomain, provider: providerDomain, rake: rakeDomain, operatorAccountRef: expectedOperatorRef, providerAccountRef: expectedProviderRef, rakeAccountRef: expectedRakeRef, principalId: args.principalId, businessId: args.businessId, currency })
    if (accountRefusal !== undefined) return accountRefusal
    if (operator === null || provider === null || rakeAccount === null || operatorDomain === undefined || providerDomain === undefined || rakeDomain === undefined) {
      return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    }
    if (provider.exponent !== operator.exponent || rakeAccount.exponent !== operator.exponent) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const grossAmount = amountAtScale(amount, currency, operator.exponent)
    if (grossAmount === undefined) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const operatorAmount = grossAmount
    const rake = multiplyExactAmountByBps(grossAmount, args.rakeBps, 'floor')
    const providerNet = rake === undefined ? undefined : subtractExactAmounts(grossAmount, rake)
    const providerAmount = providerNet === undefined ? undefined : amountAtScale(providerNet, currency, provider.exponent)
    const rakeAmount = rake === undefined ? undefined : amountAtScale(rake, currency, rakeAccount.exponent)
    if (providerAmount === undefined || rakeAmount === undefined || providerNet === undefined) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const providerBalance = addExactAmounts(providerDomain.balance, providerAmount)
    const rakeBalance = addExactAmounts(rakeDomain.balance, rakeAmount)
    if (providerBalance === undefined || rakeBalance === undefined) return { kind: 'refused' as const, code: 'rake_not_configured' as const, retryable: false }
    const prior = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey)).unique()
    if (prior !== null) {
      if (prior.inputDigest !== args.inputDigest || prior.principalId !== args.principalId || prior.kind !== 'charge') return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      const entries = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', prior.transactionRef)).take(3)
      const charge = entries.find((entry) => entry.entryType === 'charge' && entry.direction === 'debit')
      const providerEntry = entries.find((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'credit')
      const rakeEntry = entries.find((entry) => entry.entryType === 'rake' && entry.direction === 'credit')
      const chargeAmount = charge === undefined ? undefined : entryAmount(charge)
      const providerEntryAmount = providerEntry === undefined ? undefined : entryAmount(providerEntry)
      const rakeEntryAmount = rakeEntry === undefined ? undefined : entryAmount(rakeEntry)
      if (charge === undefined || providerEntry === undefined || rakeEntry === undefined || chargeAmount === undefined || providerEntryAmount === undefined || rakeEntryAmount === undefined || charge.accountRef !== operator.accountRef || providerEntry.accountRef !== provider.accountRef || rakeEntry.accountRef !== rakeAccount.accountRef) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
      const storedCharge = amountAtScale(chargeAmount, currency, operator.exponent)
      const storedProvider = amountAtScale(providerEntryAmount, currency, provider.exponent)
      const storedRake = amountAtScale(rakeEntryAmount, currency, rakeAccount.exponent)
      if (storedCharge === undefined || storedProvider === undefined || storedRake === undefined || compareExactAmounts(storedCharge, operatorAmount) !== 0 || compareExactAmounts(storedProvider, providerAmount) !== 0 || compareExactAmounts(storedRake, rakeAmount) !== 0) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
      return { kind: 'accepted' as const, chargeState: 'paid' as const, amount: grossAmount, priceDigest: expectedPriceDigest, transactionRef: prior.transactionRef, providerNet, rake }
    }
    const usageRef = `${args.invocationRef}:${args.attemptRef}:${args.operationKey}`
    if (grossAmount.units === '0') {
      const existingUsage = await ctx.db.query('moneyUsageEvents').withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef)).unique()
      if (existingUsage !== null) {
        const existingAmount = amountFromParts(existingUsage.currency, existingUsage.amountUnits, existingUsage.exponent)
        if (existingAmount === undefined) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
        return { kind: 'accepted' as const, chargeState: 'free_tier' as const, amount: existingAmount, priceDigest: existingUsage.priceDigest }
      }
      const windowStart = new Date(args.observedAt).toISOString().slice(0, 10)
      const counter = await ctx.db.query('moneyFreeTierCounters').withIndex('by_principalId_and_offeringRef_and_windowStart', (q) => q.eq('principalId', args.principalId).eq('offeringRef', args.offeringRef).eq('windowStart', windowStart)).unique()
      if (counter !== null && counter.callsUsed >= 1) return { kind: 'refused' as const, code: 'credit_topup_required' as const, retryable: false, nextAction: 'credit_topup_required' as const }
      if (counter === null) await ctx.db.insert('moneyFreeTierCounters', { counterRef: `${args.principalId}:${args.offeringRef}:day:${windowStart}`, principalId: args.principalId, offeringRef: args.offeringRef, window: 'day', windowStart, callsUsed: 1, version: 1, updatedAt: args.observedAt })
      else await ctx.db.patch('moneyFreeTierCounters', counter._id, { callsUsed: counter.callsUsed + 1, version: counter.version + 1, updatedAt: args.observedAt })
      await insertMoneyUsageEvent(ctx, { usageRef, principalId: args.principalId, credentialId: args.credentialId, currency, exponent: grossAmount.exponent, serviceRef: args.serviceRef, offeringRef: args.offeringRef, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef, operationKey: args.operationKey, priceDigest: expectedPriceDigest, chargeState: 'free_tier', amountUnits: '0', observedAt: args.observedAt })
      return { kind: 'accepted' as const, chargeState: 'free_tier' as const, amount: grossAmount, priceDigest: expectedPriceDigest }
    }
    const balanceComparison = compareExactAmounts(operatorDomain.balance, operatorAmount)
    if (operatorDomain.state !== 'active' || balanceComparison === undefined || balanceComparison === -1) {
      const existingUsage = await ctx.db.query('moneyUsageEvents').withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef)).unique()
      if (existingUsage === null) await insertMoneyUsageEvent(ctx, { usageRef, principalId: args.principalId, credentialId: args.credentialId, currency, exponent: grossAmount.exponent, serviceRef: args.serviceRef, offeringRef: args.offeringRef, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef, operationKey: args.operationKey, priceDigest: expectedPriceDigest, chargeState: 'insufficient_credit', amountUnits: grossAmount.units, observedAt: args.observedAt })
      return { kind: 'refused' as const, code: 'insufficient_credit' as const, retryable: false, nextAction: 'credit_topup_required' as const, requiredAmount: grossAmount, availableAmount: operatorDomain.balance }
    }
    const operatorBalance = subtractExactAmounts(operatorDomain.balance, operatorAmount)
    if (operatorBalance === undefined) return { kind: 'refused' as const, code: 'rake_not_configured' as const, retryable: false }
    if (operator.version !== args.expectedAccountVersion) return { kind: 'refused' as const, code: 'ledger_cas_conflict' as const, retryable: true }
    const transaction = { transactionRef: args.transactionRef, kind: 'charge' as const, idempotencyKey: args.idempotencyKey, inputDigest: args.inputDigest, principalId: args.principalId, currency, exponent: grossAmount.exponent, state: 'applied' as const, expectedAccountVersion: args.expectedAccountVersion, createdAt: args.observedAt, updatedAt: args.observedAt }
    const common = { transactionRef: args.transactionRef, idempotencyKey: args.idempotencyKey, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:charge`, accountRef: operator.accountRef, entryType: 'charge', direction: 'debit', amountUnits: operatorAmount.units, currency: operatorAmount.currency, exponent: operatorAmount.exponent, principalId: args.principalId, invocationRef: args.invocationRef, attemptRef: args.attemptRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:provider`, accountRef: provider.accountRef, entryType: 'payout_accrual', direction: 'credit', amountUnits: providerAmount.units, currency: providerAmount.currency, exponent: providerAmount.exponent, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:rake`, accountRef: rakeAccount.accountRef, entryType: 'rake', direction: 'credit', amountUnits: rakeAmount.units, currency: rakeAmount.currency, exponent: rakeAmount.exponent, businessId: args.businessId })
    await ctx.db.patch('moneyAccounts', operator._id, { balanceUnits: operatorBalance.units, version: operator.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', provider._id, { balanceUnits: providerBalance.units, version: provider.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', rakeAccount._id, { balanceUnits: rakeBalance.units, version: rakeAccount.version + 1, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', transaction)
    await insertMoneyUsageEvent(ctx, { usageRef, principalId: args.principalId, credentialId: args.credentialId, currency, exponent: grossAmount.exponent, serviceRef: args.serviceRef, offeringRef: args.offeringRef, businessId: args.businessId, invocationRef: args.invocationRef, attemptRef: args.attemptRef, operationKey: args.operationKey, priceDigest: expectedPriceDigest, chargeState: 'paid', amountUnits: grossAmount.units, transactionRef: args.transactionRef, observedAt: args.observedAt })
    return { kind: 'accepted' as const, chargeState: 'paid' as const, amount: grossAmount, priceDigest: expectedPriceDigest, transactionRef: args.transactionRef, providerNet, rake }
  },
})

export const applyCreditTopup = internalMutation({
  args: {
    commandRef: identifier,
    principalId: identifier,
    accountRef: identifier,
    amount: exactAmount,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
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
    const webhookAmount = readAmount(args.amount)
    if (webhookAmount === undefined || args.evidenceRefs.length === 0) return { kind: 'refused' as const, code: 'credit_topup_amount_invalid' as const, retryable: false }
    const command = await ctx.db.query('moneyTopupCommands').withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef)).unique()
    if (command === null || command.principalId !== args.principalId || command.accountRef !== args.accountRef || command.externalRef !== args.externalRef || command.idempotencyKey !== args.idempotencyKey || command.inputDigest !== args.inputDigest) return { kind: 'refused' as const, code: 'credit_topup_pending' as const, retryable: true }
    const commandAmount = amountFromParts(command.currency, command.amountUnits, command.exponent)
    const processingFee = amountFromParts(command.currency, command.processingFeeUnits, command.exponent)
    const chargeAmount = amountFromParts(command.currency, command.chargeAmountUnits, command.exponent)
    const normalizedWebhookAmount = amountAtScale(webhookAmount, command.currency, command.exponent)
    if (commandAmount === undefined || processingFee === undefined || chargeAmount === undefined || normalizedWebhookAmount === undefined || compareExactAmounts(commandAmount, processingFee) === undefined || compareExactAmounts(commandAmount, chargeAmount) === undefined || compareExactAmounts(chargeAmount, normalizedWebhookAmount) !== 0) return { kind: 'refused' as const, code: 'credit_topup_pending' as const, retryable: true }
    const priorEvent = await ctx.db.query('moneyStripeEvents').withIndex('by_stripeEventId', (q) => q.eq('stripeEventId', args.stripeEventId)).unique()
    if (priorEvent !== null && (priorEvent.eventType !== args.eventType || priorEvent.payloadDigest !== args.sourceDigest)) return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
    if (priorEvent?.status === 'applied') {
      const appliedRef = priorEvent.appliedRef
      const priorTransaction = appliedRef === undefined ? null : await ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', appliedRef)).unique()
      const priorEntry = appliedRef === undefined ? null : await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', appliedRef)).unique()
      const priorAmount = priorEntry === null ? undefined : entryAmount(priorEntry)
      if (priorTransaction === null || priorEntry === null || priorAmount === undefined || priorEntry.accountRef !== command.accountRef || priorTransaction.kind !== 'topup' || priorTransaction.externalRef !== args.externalRef || compareExactAmounts(priorAmount, commandAmount) !== 0) return { kind: 'refused' as const, code: 'credit_topup_outcome_unknown' as const, retryable: false }
      return { kind: 'accepted' as const, chargeState: 'paid' as const, transactionRef: priorTransaction.transactionRef, amount: commandAmount, priceDigest: priorTransaction.inputDigest }
    }
    if (command.state === 'succeeded') {
      const priorTransaction = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', command.idempotencyKey)).unique()
      const priorEntry = priorTransaction === null ? null : await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', priorTransaction.transactionRef)).unique()
      const priorAmount = priorEntry === null ? undefined : entryAmount(priorEntry)
      if (priorTransaction === null || priorEntry === null || priorAmount === undefined || priorTransaction.inputDigest !== command.inputDigest || priorTransaction.principalId !== command.principalId || priorTransaction.kind !== 'topup' || priorEntry.accountRef !== command.accountRef || compareExactAmounts(priorAmount, commandAmount) !== 0) return { kind: 'refused' as const, code: 'credit_topup_outcome_unknown' as const, retryable: false }
      return { kind: 'accepted' as const, chargeState: 'paid' as const, transactionRef: priorTransaction.transactionRef, amount: commandAmount, priceDigest: priorTransaction.inputDigest }
    }
    const account = await ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', command.accountRef)).unique()
    const accountDomain = account === null ? undefined : accountFromRow(account)
    const accountAmount = account === null || accountDomain === undefined ? undefined : amountAtScale(commandAmount, account.currency, account.exponent)
    if (account === null || accountDomain === undefined || accountAmount === undefined || account.accountKind !== 'operator_credit' || account.principalId !== command.principalId || account.currency !== command.currency) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const priorTransaction = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', command.idempotencyKey)).unique()
    if (priorTransaction !== null) {
      if (priorTransaction.inputDigest !== command.inputDigest || priorTransaction.principalId !== command.principalId || priorTransaction.kind !== 'topup') return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      const priorEntry = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', priorTransaction.transactionRef)).unique()
      const priorAmount = priorEntry === null ? undefined : entryAmount(priorEntry)
      if (priorEntry === null || priorAmount === undefined || priorEntry.accountRef !== account.accountRef || compareExactAmounts(priorAmount, accountAmount) !== 0) return { kind: 'refused' as const, code: 'credit_topup_outcome_unknown' as const, retryable: false }
      return { kind: 'accepted' as const, chargeState: 'paid' as const, transactionRef: priorTransaction.transactionRef, amount: commandAmount, priceDigest: priorTransaction.inputDigest }
    }
    const nextBalance = addExactAmounts(accountDomain.balance, accountAmount)
    if (nextBalance === undefined) return { kind: 'refused' as const, code: 'credit_topup_amount_invalid' as const, retryable: false }
    const transaction = { transactionRef: args.transactionRef, kind: 'topup' as const, idempotencyKey: command.idempotencyKey, inputDigest: command.inputDigest, principalId: command.principalId, currency: command.currency, exponent: command.exponent, state: 'applied' as const, expectedAccountVersion: account.version, externalRef: command.externalRef, createdAt: args.observedAt, updatedAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { entryRef: `${args.transactionRef}:topup`, accountRef: account.accountRef, entryType: 'topup', direction: 'credit', amountUnits: accountAmount.units, currency: accountAmount.currency, exponent: accountAmount.exponent, transactionRef: args.transactionRef, idempotencyKey: command.idempotencyKey, principalId: command.principalId, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', account._id, { balanceUnits: nextBalance.units, version: account.version + 1, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', transaction)
    await ctx.db.patch('moneyTopupCommands', command._id, { state: 'succeeded', updatedAt: args.observedAt })
    if (priorEvent === null) await ctx.db.insert('moneyStripeEvents', { stripeEventId: args.stripeEventId, eventType: args.eventType, payloadDigest: args.sourceDigest, status: 'applied', appliedRef: args.transactionRef, receivedAt: args.observedAt, appliedAt: args.observedAt })
    else await ctx.db.patch('moneyStripeEvents', priorEvent._id, { status: 'applied', appliedRef: args.transactionRef, appliedAt: args.observedAt })
    return { kind: 'accepted' as const, chargeState: 'paid' as const, transactionRef: args.transactionRef, amount: commandAmount, priceDigest: command.inputDigest }
  },
})

export const releasePayoutAccrual = internalMutation({
  args: {
    authority: v.object({ principalId: identifier }),
    businessId: identifier,
    amount: exactAmount,
    providerAccountRef: identifier,
    payoutRef: identifier,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const requestedAmount = readAmount(args.amount)
    if (requestedAmount === undefined || requestedAmount.units === '0' || args.evidenceRefs.length === 0) return { kind: 'refused' as const, code: 'payout_not_ready' as const, retryable: false }
    const currency = requestedAmount.currency
    const payoutTransactions = await ctx.db.query('moneyTransactions').withIndex('by_externalRef', (q) => q.eq('externalRef', args.payoutRef)).take(2)
    const prior = payoutTransactions.find((transaction) => transaction.kind === 'payout_accrual')
    if (prior !== undefined) {
      if (prior.inputDigest !== args.inputDigest) return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      const priorEntry = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', prior.transactionRef)).unique()
      const priorAmount = priorEntry === null ? undefined : entryAmount(priorEntry)
      const expectedAmount = amountAtScale(requestedAmount, prior.currency, prior.exponent)
      if (priorEntry === null || priorAmount === undefined || expectedAmount === undefined || priorEntry.accountRef !== args.providerAccountRef || compareExactAmounts(priorAmount, expectedAmount) !== 0) return { kind: 'refused' as const, code: 'payout_reconciliation_required' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: prior.transactionRef, amount: expectedAmount }
    }
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.authority.principalId)) return { kind: 'refused' as const, code: 'billing_identity_missing' as const, retryable: false }
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    const expectedProviderRef = accountRefForProvider(args.businessId, currency)
    const account = await ctx.db.query('moneyAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', currency)).unique()
    const accountDomain = account === null ? undefined : accountFromRow(account)
    const amount = account === null || accountDomain === undefined ? undefined : amountAtScale(requestedAmount, currency, account.exponent)
    if (account === null || accountDomain === undefined || amount === undefined || account.accountKind !== 'provider_earnings' || account.accountRef !== expectedProviderRef) return { kind: 'refused' as const, code: 'currency_mismatch' as const, retryable: false }
    const [payoutAccount, payout] = await Promise.all([
      ctx.db.query('moneyPayoutAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', args.businessId).eq('currency', currency)).unique(),
      ctx.db.query('moneyPayouts').withIndex('by_payoutRef', (q) => q.eq('payoutRef', args.payoutRef)).unique(),
    ])
    const current = payout === null ? undefined : payoutFromRow(payout)
    if (payoutAccount === null || payout === null || current === undefined || payout.businessId !== args.businessId || payout.currency !== currency) return { kind: 'refused' as const, code: 'payout_not_ready' as const, retryable: false }
    const currentProviderNet = amountAtScale(current.providerNet, currency, amount.exponent)
    if (currentProviderNet === undefined) return { kind: 'refused' as const, code: 'payout_reconciliation_required' as const, retryable: false }
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: { kind: 'release_transfer' },
      account: { state: payoutAccount.state, detailsSubmitted: payoutAccount.detailsSubmitted, recipientCapabilityActive: payoutAccount.recipientCapabilityActive },
    })
    if (policy.kind === 'refused') return policy
    const providerComparison = compareExactAmounts(currentProviderNet, amount)
    const balanceComparison = compareExactAmounts(accountDomain.balance, amount)
    if (providerComparison !== 0 || balanceComparison === -1 || balanceComparison === undefined) return { kind: 'refused' as const, code: providerComparison !== 0 ? 'payout_not_ready' as const : 'payout_below_threshold' as const, retryable: false }
    const priorIdempotency = await ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', args.idempotencyKey)).unique()
    if (priorIdempotency !== null) {
      if (priorIdempotency.inputDigest !== args.inputDigest || priorIdempotency.externalRef !== args.payoutRef || priorIdempotency.kind !== 'payout_accrual') return { kind: 'refused' as const, code: 'ledger_idempotency_conflict' as const, retryable: false }
      const priorEntry = await ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', priorIdempotency.transactionRef)).unique()
      const priorAmount = priorEntry === null ? undefined : entryAmount(priorEntry)
      if (priorEntry === null || priorAmount === undefined || priorEntry.accountRef !== account.accountRef || compareExactAmounts(priorAmount, amount) !== 0) return { kind: 'refused' as const, code: 'payout_reconciliation_required' as const, retryable: false }
      return { kind: 'accepted' as const, transactionRef: priorIdempotency.transactionRef, amount }
    }
    const nextBalance = subtractExactAmounts(accountDomain.balance, amount)
    if (nextBalance === undefined) return { kind: 'refused' as const, code: 'payout_not_ready' as const, retryable: false }
    const transaction = { transactionRef: args.transactionRef, kind: 'payout_accrual' as const, idempotencyKey: args.idempotencyKey, inputDigest: args.inputDigest, principalId: `business:${args.businessId}`, currency, exponent: amount.exponent, state: 'applied' as const, expectedAccountVersion: account.version, externalRef: args.payoutRef, createdAt: args.observedAt, updatedAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { entryRef: `${args.transactionRef}:payout`, accountRef: account.accountRef, entryType: 'payout_accrual', direction: 'debit', amountUnits: amount.units, currency, exponent: amount.exponent, transactionRef: args.transactionRef, idempotencyKey: args.idempotencyKey, businessId: args.businessId, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', account._id, { balanceUnits: nextBalance.units, version: account.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyPayouts', payout._id, { state: policy.value.state, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', transaction)
    return { kind: 'accepted' as const, transactionRef: args.transactionRef, amount }
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
    const chargeAmount = charge === undefined ? undefined : entryAmount(charge)
    const providerAmount = provider === undefined ? undefined : entryAmount(provider)
    const rakeAmount = rake === undefined ? undefined : entryAmount(rake)
    if (charge === undefined || provider === undefined || rake === undefined || chargeAmount === undefined || providerAmount === undefined || rakeAmount === undefined || chargeAmount.currency !== original.currency || providerAmount.currency !== original.currency || rakeAmount.currency !== original.currency || chargeAmount.exponent !== original.exponent || providerAmount.exponent !== original.exponent || rakeAmount.exponent !== original.exponent) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const [operatorAccount, providerAccount, rakeAccount] = await Promise.all([
      ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', charge.accountRef)).unique(),
      ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', provider.accountRef)).unique(),
      ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', rake.accountRef)).unique(),
    ])
    const operatorDomain = operatorAccount === null ? undefined : accountFromRow(operatorAccount)
    const providerDomain = providerAccount === null ? undefined : accountFromRow(providerAccount)
    const rakeDomain = rakeAccount === null ? undefined : accountFromRow(rakeAccount)
    if (operatorAccount === null || providerAccount === null || rakeAccount === null || operatorDomain === undefined || providerDomain === undefined || rakeDomain === undefined) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const operatorRefund = amountAtScale(chargeAmount, operatorAccount.currency, operatorAccount.exponent)
    const providerRefund = amountAtScale(providerAmount, providerAccount.currency, providerAccount.exponent)
    const rakeRefund = amountAtScale(rakeAmount, rakeAccount.currency, rakeAccount.exponent)
    if (operatorRefund === undefined || providerRefund === undefined || rakeRefund === undefined || compareExactAmounts(providerDomain.balance, providerRefund) === -1 || compareExactAmounts(rakeDomain.balance, rakeRefund) === -1) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const nextOperatorBalance = addExactAmounts(operatorDomain.balance, operatorRefund)
    const nextProviderBalance = subtractExactAmounts(providerDomain.balance, providerRefund)
    const nextRakeBalance = subtractExactAmounts(rakeDomain.balance, rakeRefund)
    if (nextOperatorBalance === undefined || nextProviderBalance === undefined || nextRakeBalance === undefined) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const common = { transactionRef: args.transactionRef, idempotencyKey: args.idempotencyKey, sourceDigest: args.sourceDigest, evidenceRefs: args.evidenceRefs, createdAt: args.observedAt }
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:operator`, accountRef: operatorAccount.accountRef, entryType: 'refund', direction: 'credit', amountUnits: operatorRefund.units, currency: operatorRefund.currency, exponent: operatorRefund.exponent, principalId: args.principalId, reversalOf: args.originalTransactionRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:provider`, accountRef: providerAccount.accountRef, entryType: 'refund', direction: 'debit', amountUnits: providerRefund.units, currency: providerRefund.currency, exponent: providerRefund.exponent, ...(provider.businessId === undefined ? {} : { businessId: provider.businessId }), reversalOf: args.originalTransactionRef })
    await ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${args.transactionRef}:rake`, accountRef: rakeAccount.accountRef, entryType: 'refund', direction: 'debit', amountUnits: rakeRefund.units, currency: rakeRefund.currency, exponent: rakeRefund.exponent, ...(rake.businessId === undefined ? {} : { businessId: rake.businessId }), reversalOf: args.originalTransactionRef })
    await ctx.db.patch('moneyAccounts', operatorAccount._id, { balanceUnits: nextOperatorBalance.units, version: operatorAccount.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', providerAccount._id, { balanceUnits: nextProviderBalance.units, version: providerAccount.version + 1, updatedAt: args.observedAt })
    await ctx.db.patch('moneyAccounts', rakeAccount._id, { balanceUnits: nextRakeBalance.units, version: rakeAccount.version + 1, updatedAt: args.observedAt })
    await ctx.db.insert('moneyTransactions', { transactionRef: args.transactionRef, kind: 'refund', idempotencyKey: args.idempotencyKey, inputDigest: args.inputDigest, principalId: args.principalId, currency: original.currency, exponent: original.exponent, state: 'reversed' as const, expectedAccountVersion: operatorAccount.version, reversalOf: args.originalTransactionRef, createdAt: args.observedAt, updatedAt: args.observedAt })
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
    const accountDomain = account === null ? undefined : accountFromRow(account)
    if (account === null || accountDomain === undefined) return { kind: 'refused' as const, code: 'billing_identity_missing' as const }
    const threshold = zeroAmount(account.currency, account.exponent)
    if (threshold === undefined) return { kind: 'refused' as const, code: 'billing_identity_missing' as const }
    return {
      kind: 'ok' as const,
      principalId: args.principalId,
      balance: accountDomain.balance,
      autoRecharge: { enabled: false, threshold, rechargeAmount: threshold },
      evidence: 'source' as const,
    }
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
    const items = []
    for (const row of page.page) {
      const grossAmount = amountFromParts(row.currency, row.amountUnits, row.exponent)
      if (grossAmount === undefined) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, items: [] as const }
      items.push({ activityRef: row.usageRef, credentialId: row.credentialId, serviceRef: row.serviceRef, offeringRef: row.offeringRef, businessId: row.businessId, operationKey: row.operationKey, grossAmount, chargeState: row.chargeState, observedAt: row.observedAt, ...(row.transactionRef === undefined ? {} : { transactionRef: row.transactionRef }) })
    }
    return { kind: 'ok' as const, page: items, isDone: page.isDone, continueCursor: page.continueCursor }
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
    if (!await ownerPrincipalAllowed(identity, args.principalId, async () => await ctx.db.query('customerRequestAgentPrincipals').withIndex('by_principalId', (q) => q.eq('principalId', args.principalId)).unique())) return { kind: 'refused' as const, code: 'billing_identity_missing', items: [] as const }
    const summary = await ctx.db.query('moneyCredentialUsageSummaries').withIndex('by_principalId_and_credentialId_and_currency', (q) => q.eq('principalId', args.principalId).eq('credentialId', args.credentialId).eq('currency', args.currency)).unique()
    const account = await ctx.db.query('moneyAccounts').withIndex('by_principalId_and_currency', (q) => q.eq('principalId', args.principalId).eq('currency', args.currency)).unique()
    const exponent = summary?.exponent ?? account?.exponent
    if (exponent === undefined) return { kind: 'refused' as const, code: 'billing_identity_missing', items: [] as const }
    const grossSpend = summary === null ? zeroAmount(args.currency, exponent) : amountFromParts(summary.currency, summary.grossSpendUnits, summary.exponent)
    if (grossSpend === undefined) return { kind: 'refused' as const, code: 'charge_reconciliation_required', items: [] as const }
    return {
      kind: 'ok' as const,
      credentialId: args.credentialId,
      callCount: summary?.callCount ?? 0,
      paidCallCount: summary?.paidCallCount ?? 0,
      freeCallCount: summary?.freeCallCount ?? 0,
      grossSpend,
      states: summary?.states ?? [],
    }
  },
})

function sumEntries(
  rows: readonly MoneyLedgerEntryRow[],
  zero: ExactAmount,
  predicate: (entry: MoneyLedgerEntryRow) => boolean,
): ExactAmount | undefined {
  let total = zero
  for (const row of rows) {
    if (!predicate(row)) continue
    const amount = entryAmount(row)
    if (amount === undefined) return undefined
    const next = addExactAmounts(total, amount)
    if (next === undefined) return undefined
    total = next
  }
  return total
}

type MoneyQueryCtx = Pick<QueryCtx, 'db'>
type ProviderEarningsReadResult =
  | Readonly<{
      kind: 'ok'
      businessId: string
      grossAccrual: ExactAmount
      rake: ExactAmount
      providerNet: ExactAmount
      paidOut: ExactAmount
      held: ExactAmount
      truncated: boolean
      evidence: 'source'
    }>
  | Readonly<{ kind: 'refused'; code: 'payout_not_ready' | 'payout_reconciliation_required' }>
type PayoutStatusReadResult =
  | Readonly<{
      kind: 'ok'
      businessId: string
      accountState: 'missing' | 'not_started' | 'onboarding_started' | 'submitted' | 'restricted' | 'ready'
      payoutState?: 'review' | 'held_kyc' | 'held_threshold' | 'transfer_pending' | 'paid' | 'failed' | 'outcome_unknown'
      providerNet: ExactAmount
      minimumPayout: ExactAmount
      evidence: 'source'
    }>
  | Readonly<{ kind: 'refused'; code: 'payout_not_ready' | 'payout_reconciliation_required' }>

async function readProviderEarningsForAccount(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
  account: Doc<'moneyAccounts'> | null,
): Promise<ProviderEarningsReadResult> {
  const accountDomain = account === null ? undefined : accountFromRow(account)
  if (account === null || accountDomain === undefined || account.accountKind !== 'provider_earnings') return { kind: 'refused' as const, code: 'payout_not_ready' as const }
  const rows = await ctx.db.query('moneyLedgerEntries').withIndex('by_businessId_and_createdAt', (q) => q.eq('businessId', businessId)).order('desc').take(100)
  const zero = zeroAmount(account.currency, account.exponent)
  if (zero === undefined) return { kind: 'refused' as const, code: 'payout_not_ready' as const }
  const providerCredits = sumEntries(rows, zero, (entry) => entry.currency === currency && entry.accountRef === account.accountRef && entry.entryType === 'payout_accrual' && entry.direction === 'credit' && entry.invocationRef !== undefined)
  const rakeCredits = sumEntries(rows, zero, (entry) => entry.currency === currency && entry.accountRef === accountRefForRake(currency) && entry.entryType === 'rake' && entry.direction === 'credit')
  const paidOut = sumEntries(rows, zero, (entry) => entry.currency === currency && entry.accountRef === account.accountRef && entry.entryType === 'payout_accrual' && entry.direction === 'debit')
  const providerRefunds = sumEntries(rows, zero, (entry) => entry.currency === currency && entry.accountRef === account.accountRef && entry.entryType === 'refund' && entry.direction === 'debit')
  const rakeRefunds = sumEntries(rows, zero, (entry) => entry.currency === currency && entry.accountRef === accountRefForRake(currency) && entry.entryType === 'refund' && entry.direction === 'debit')
  const providerNet = providerCredits === undefined || providerRefunds === undefined ? undefined : subtractExactAmounts(providerCredits, providerRefunds)
  const rake = rakeCredits === undefined || rakeRefunds === undefined ? undefined : subtractExactAmounts(rakeCredits, rakeRefunds)
  const grossAccrual = providerNet === undefined || rake === undefined ? undefined : addExactAmounts(providerNet, rake)
  if (grossAccrual === undefined || rake === undefined || providerNet === undefined || paidOut === undefined) return { kind: 'refused' as const, code: 'payout_reconciliation_required' as const }
  return { kind: 'ok' as const, businessId, grossAccrual, rake, providerNet, paidOut, held: accountDomain.balance, truncated: rows.length === 100, evidence: 'source' as const }
}

async function readProviderEarningsForBusiness(ctx: MoneyQueryCtx, businessId: string, currency: string): Promise<ProviderEarningsReadResult> {
  const account = await ctx.db.query('moneyAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', businessId).eq('currency', currency)).unique()
  return await readProviderEarningsForAccount(ctx, businessId, currency, account)
}

async function readPayoutStatusForRows(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
  account: Doc<'moneyPayoutAccounts'> | null,
  providerAccount: Doc<'moneyAccounts'> | null,
): Promise<PayoutStatusReadResult> {
  if (account === null) {
    const provider = providerAccount === null ? undefined : accountFromRow(providerAccount)
    if (provider === undefined || provider.accountKind !== 'provider_earnings') {
      return { kind: 'refused' as const, code: 'payout_not_ready' as const }
    }
    const zero = zeroAmount(provider.balance.currency, provider.balance.exponent)
    return zero === undefined
      ? { kind: 'refused' as const, code: 'payout_not_ready' as const }
      : {
          kind: 'ok' as const,
          businessId,
          accountState: 'missing' as const,
          providerNet: zero,
          minimumPayout: zero,
          evidence: 'source' as const,
        }
  }
  const current = (await ctx.db.query('moneyPayouts').withIndex('by_businessId_and_currency_and_updatedAt', (q) => q.eq('businessId', businessId).eq('currency', currency)).order('desc').take(1))[0]
  const zero = zeroAmount(account.currency, account.exponent)
  if (zero === undefined) return { kind: 'refused' as const, code: 'payout_not_ready' as const }
  if (current === undefined) return { kind: 'ok' as const, businessId, accountState: account.state, providerNet: zero, minimumPayout: zero, evidence: 'source' as const }
  const payout = payoutFromRow(current)
  if (payout === undefined || current.exponent !== account.exponent) return { kind: 'refused' as const, code: 'payout_reconciliation_required' as const }
  return { kind: 'ok' as const, businessId, accountState: account.state, payoutState: current.state, providerNet: payout.providerNet, minimumPayout: payout.minimumPayout, evidence: 'source' as const }
}

async function readPayoutStatusForProviderAccount(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
  providerAccount: Doc<'moneyAccounts'>,
): Promise<PayoutStatusReadResult> {
  const account = await ctx.db.query('moneyPayoutAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', businessId).eq('currency', currency)).unique()
  return await readPayoutStatusForRows(ctx, businessId, currency, account, providerAccount)
}

async function readPayoutStatusForBusiness(ctx: MoneyQueryCtx, businessId: string, currency: string): Promise<PayoutStatusReadResult> {
  const [account, providerAccount] = await Promise.all([
    ctx.db.query('moneyPayoutAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', businessId).eq('currency', currency)).unique(),
    ctx.db.query('moneyAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', businessId).eq('currency', currency)).unique(),
  ])
  return await readPayoutStatusForRows(ctx, businessId, currency, account, providerAccount)
}

const payoutAccountStateValue = v.union(
  v.literal('missing'),
  v.literal('not_started'),
  v.literal('onboarding_started'),
  v.literal('submitted'),
  v.literal('restricted'),
  v.literal('ready'),
)
const payoutStateValue = v.union(
  v.literal('review'),
  v.literal('held_kyc'),
  v.literal('held_threshold'),
  v.literal('transfer_pending'),
  v.literal('paid'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
const providerEarningsViewValue = v.object({
  kind: v.literal('ok'),
  businessId: identifier,
  grossAccrual: exactAmount,
  rake: exactAmount,
  providerNet: exactAmount,
  paidOut: exactAmount,
  held: exactAmount,
  truncated: v.boolean(),
  evidence: v.literal('source'),
})
const payoutStatusViewValue = v.object({
  kind: v.literal('ok'),
  businessId: identifier,
  accountState: payoutAccountStateValue,
  payoutState: v.optional(payoutStateValue),
  providerNet: exactAmount,
  minimumPayout: exactAmount,
  evidence: v.literal('source'),
})
const ownerProviderEarningsResultValue = v.union(
  v.object({ kind: v.literal('error'), code: v.union(v.literal('unauthenticated'), v.literal('source_unavailable')) }),
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    businessId: identifier,
    accounts: v.array(v.object({ currency: identifier, earnings: providerEarningsViewValue, payout: payoutStatusViewValue })),
    accountsTruncated: v.boolean(),
  }),
)

export const readOwnerProviderEarnings = query({
  args: {},
  returns: ownerProviderEarningsResultValue,
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
    const owner = await ctx.db.query('owners').withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', actor.clerkUserId)).unique()
    if (owner === null) return { kind: 'not_found' as const }
    const business = await ctx.db.query('businesses').withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id)).order('desc').first()
    if (business === null) return { kind: 'not_found' as const }
    const businessId = String(business._id)
    const accountRows = await ctx.db.query('moneyAccounts').withIndex('by_businessId_and_currency', (q) => q.eq('businessId', businessId)).take(11)
    const providerAccountRows = accountRows.filter((account) => account.accountKind === 'provider_earnings')
    const providerAccounts = providerAccountRows.slice(0, 10)
    const accountResults = await Promise.all(providerAccounts.map(async (providerAccount) => {
      const [earnings, payout] = await Promise.all([
        readProviderEarningsForAccount(ctx, businessId, providerAccount.currency, providerAccount),
        readPayoutStatusForProviderAccount(ctx, businessId, providerAccount.currency, providerAccount),
      ])
      return earnings.kind === 'ok' && payout.kind === 'ok'
        ? { currency: providerAccount.currency, earnings, payout }
        : undefined
    }))
    if (accountResults.some((account) => account === undefined)) {
      return { kind: 'error' as const, code: 'source_unavailable' as const }
    }
    return {
      kind: 'available' as const,
      businessId,
      accounts: accountResults.filter((account) => account !== undefined),
      accountsTruncated: providerAccountRows.length > 10,
    }
  },
})

export const readProviderEarnings = internalQuery({
  args: { businessId: identifier, currency: identifier },
  handler: async (ctx, args) => await readProviderEarningsForBusiness(ctx, args.businessId, args.currency),
})

export const readPayoutStatus = internalQuery({
  args: { businessId: identifier, currency: identifier },
  handler: async (ctx, args) => await readPayoutStatusForBusiness(ctx, args.businessId, args.currency),
})
