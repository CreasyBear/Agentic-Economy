import type { MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '../src/modules/common/stable-hash'
import {
  addExactAmounts,
  applyProviderAccountDebit,
  amountFromParts,
  compareExactAmounts,
  planPaidCharge,
  subtractExactAmounts,
  type ExactAmount,
  type MoneyLedgerEntry,
  type MoneyRefusal,
} from '../src/modules/money/public'
import {
  applyPreparedCredentialBudgetReservation,
  applyPreparedCredentialBudgetTransition,
  prepareCredentialBudgetReservation,
  prepareCredentialBudgetTransition,
} from './moneyBudgetPersist'
import {
  applyPreparedCanonicalMoneyAccount,
  canonicalMoneyAccountPreview,
} from './moneyCanonicalAccounts'
import {
  admitInvocationCharge,
  type AdmittedInvocationCharge,
  type AuthorizeInvocationChargeArgs,
} from './moneyChargeAdmission'
import {
  domainMoneyEntries,
  domainMoneyTransaction,
  domainMoneyUsage,
  validatePaidChargePlan,
} from './moneyChargeJournal'
import {
  applyPreparedMoneyUsageEvent,
  prepareMoneyUsageEvent,
  usageEventInput,
} from './moneyChargeAuthorize'

export type BrokeredInvocationChargeFinalizeArgs =
  AuthorizeInvocationChargeArgs & Readonly<{
    externalRef: string
    reconciliationEvidenceRefs?: string[]
  }>

export type BrokeredInvocationChargeReleaseArgs =
  AuthorizeInvocationChargeArgs & Readonly<{
    reconciliationEvidenceRefs?: string[]
  }>

function brokeredRefusal(
  code: MoneyRefusal['code'],
  retryable = false,
  extra: Readonly<{
    requiredAmount?: ExactAmount
    availableAmount?: ExactAmount
  }> = {},
): MoneyRefusal {
  return {
    kind: 'refused',
    code,
    retryable,
    ...(extra.requiredAmount === undefined
      ? {}
      : { requiredAmount: extra.requiredAmount }),
    ...(extra.availableAmount === undefined
      ? {}
      : { availableAmount: extra.availableAmount }),
    ...(code === 'insufficient_credit'
      ? { nextAction: 'credit_topup_required' as const }
      : {}),
  }
}

function brokeredUsageRef(admitted: Readonly<{
  invocationRef: string
  attemptRef: string
  operationKey: string
}>): string {
  return `${admitted.invocationRef}:${admitted.attemptRef}:${admitted.operationKey}`
}

function brokeredAccepted(
  admitted: Readonly<{
    amount: ExactAmount
    priceDigest: string
    transactionRef: string
    providerAmount?: ExactAmount
    platformFee?: ExactAmount
    invocationRef: string
    attemptRef: string
    operationKey: string
  }>,
  observedAt: number,
) {
  return {
    kind: 'accepted' as const,
    chargeState: 'paid' as const,
    amount: admitted.amount,
    priceDigest: admitted.priceDigest,
    transactionRef: admitted.transactionRef,
    providerNet: admitted.providerAmount,
    rake: admitted.platformFee,
    usageRef: brokeredUsageRef(admitted),
    observedAt,
  }
}

function heldBrokeredAmount(row: Readonly<{
  currency: string
  exponent: number
  heldUnits: string
}>): ExactAmount | undefined {
  return amountFromParts(row.currency, row.heldUnits, row.exponent)
}

function initialBrokeredHeldAmount(
  prepared: AdmittedInvocationCharge['operatorPrepared'],
): ExactAmount | undefined {
  if (prepared.kind !== 'insert') return undefined
  return amountFromParts(prepared.value.currency, '0', prepared.value.exponent)
}

function brokeredLedgerEntryRow(entry: MoneyLedgerEntry) {
  return {
    entryRef: entry.entryRef,
    accountRef: entry.accountRef,
    entryType: entry.entryType,
    direction: entry.direction,
    amountUnits: entry.amount.units,
    currency: entry.amount.currency,
    exponent: entry.amount.exponent,
    transactionRef: entry.transactionRef,
    idempotencyKey: entry.idempotencyKey,
    ...(entry.principalId === undefined ? {} : { principalId: entry.principalId }),
    ...(entry.businessId === undefined ? {} : { businessId: entry.businessId }),
    ...(entry.invocationRef === undefined
      ? {}
      : { invocationRef: entry.invocationRef }),
    ...(entry.attemptRef === undefined ? {} : { attemptRef: entry.attemptRef }),
    sourceDigest: entry.sourceDigest,
    evidenceRefs: [...entry.evidenceRefs],
    createdAt: entry.createdAt,
    ...(entry.reversalOf === undefined ? {} : { reversalOf: entry.reversalOf }),
  }
}

function requireBrokeredPair(admitted: Readonly<{
  providerAmount?: ExactAmount
  platformFee?: ExactAmount
}>): MoneyRefusal | undefined {
  if (admitted.providerAmount === undefined || admitted.platformFee === undefined)
    return brokeredRefusal('rake_not_configured')
  return undefined
}

export async function reserveBrokeredInvocationChargeHandler(
  ctx: MutationCtx,
  args: AuthorizeInvocationChargeArgs,
) {
  const admitted = await admitInvocationCharge(ctx, args)
  if (admitted.kind === 'refused') return admitted
  const pairRefusal = requireBrokeredPair(admitted)
  if (pairRefusal !== undefined) return pairRefusal
  const prior = admitted.prior
  if (prior !== null) {
    if (prior.state === 'reversed')
      return brokeredRefusal('charge_reconciliation_required')
    if (prior.state === 'outcome_unknown')
      return brokeredRefusal('charge_reconciliation_required')
    if (admitted.priorEntryRows.length !== 0 || admitted.existingUsage !== null)
      return brokeredRefusal('charge_reconciliation_required')
    if (prior.state === 'pending'
      && heldBrokeredAmount(canonicalMoneyAccountPreview(admitted.operatorPrepared)) === undefined)
      return brokeredRefusal('charge_reconciliation_required')
    return brokeredAccepted(admitted, args.observedAt)
  }
  if (
    admitted.operator.state !== 'active'
    || admitted.operator.balance.currency !== admitted.currency
  )
    return brokeredRefusal('billing_identity_mismatch')
  const operatorPreview = canonicalMoneyAccountPreview(admitted.operatorPrepared)
  const held = heldBrokeredAmount(operatorPreview)
    ?? initialBrokeredHeldAmount(admitted.operatorPrepared)
  if (held === undefined) return brokeredRefusal('charge_reconciliation_required')
  const nextHeld = addExactAmounts(held, admitted.amount)
  if (nextHeld === undefined) return brokeredRefusal('currency_mismatch')
  const available = subtractExactAmounts(admitted.operator.balance, held)
  if (available === undefined) return brokeredRefusal('currency_mismatch')
  if (compareExactAmounts(available, admitted.amount) === -1)
    return brokeredRefusal('insufficient_credit', false, {
      requiredAmount: admitted.amount,
      availableAmount: available,
    })
  const budgetReservation = await prepareCredentialBudgetReservation(ctx, {
    principalId: admitted.principalId,
    accountId: admitted.accountId,
    credentialId: admitted.credentialId,
    grantRef: admitted.grantRef,
    generation: admitted.generation,
    amount: admitted.amount,
    observedAt: args.observedAt,
  })
  if (budgetReservation.kind === 'refused') return budgetReservation
  const operatorRow = await applyPreparedCanonicalMoneyAccount(
    ctx,
    admitted.operatorPrepared,
  )
  await applyPreparedCanonicalMoneyAccount(ctx, admitted.providerPrepared)
  await applyPreparedCanonicalMoneyAccount(ctx, admitted.rakePrepared)
  await applyPreparedCredentialBudgetReservation(
    ctx,
    budgetReservation,
    args.observedAt,
  )
  const expectedAccountVersion = operatorRow.version
  await ctx.db.patch(operatorRow._id, {
    version: expectedAccountVersion + 1,
    heldUnits: nextHeld.units,
    updatedAt: args.observedAt,
  })
  await ctx.db.insert('moneyTransactions', {
    transactionRef: admitted.transactionRef,
    kind: 'charge',
    idempotencyKey: admitted.transactionRef,
    inputDigest: admitted.inputDigest,
    principalId: admitted.principalId,
    accountId: admitted.accountId,
    currency: admitted.currency,
    credentialId: admitted.credentialId,
    budgetPolicyRef: budgetReservation.budgetPolicyRef,
    budgetGeneration: admitted.generation,
    budgetEnvironment: budgetReservation.environment,
    budgetDayStart: budgetReservation.dayStart,
    budgetMonthStart: budgetReservation.monthStart,
    budgetState: 'reserved',
    amountUnits: admitted.amount.units,
    exponent: admitted.amount.exponent,
    state: 'pending',
    expectedAccountVersion,
    createdAt: args.observedAt,
    updatedAt: args.observedAt,
  })
  return brokeredAccepted(admitted, args.observedAt)
}

function brokeredPlanInput(
  admitted: AdmittedInvocationCharge,
  args: AuthorizeInvocationChargeArgs,
  externalRef: string,
) {
  if (admitted.providerAmount === undefined || admitted.platformFee === undefined)
    return undefined
  return {
    transaction: {
      transactionRef: admitted.transactionRef,
      kind: 'charge' as const,
      idempotencyKey: admitted.transactionRef,
      inputDigest: admitted.inputDigest,
      principalId: admitted.principalId,
      accountId: admitted.accountId,
      currency: admitted.currency,
      expectedAccountVersion: admitted.operator.version,
      now: args.observedAt,
      externalRef,
    },
    operatorAccountRef: admitted.operatorAccountRef,
    providerAccountRef: admitted.providerAccountRef,
    rakeAccountRef: admitted.rakeAccountRef,
    grossAmount: admitted.amount,
    providerAmount: admitted.providerAmount,
    platformFee: admitted.platformFee,
    rakeConfig: { rakeBps: 1_000 },
    priceDigest: admitted.priceDigest,
    principalId: admitted.principalId,
    accountId: admitted.accountId,
    credentialId: admitted.credentialId,
    serviceRef: admitted.serviceRef,
    offeringRef: admitted.offeringRef,
    businessId: admitted.businessId,
    invocationRef: admitted.invocationRef,
    attemptRef: admitted.attemptRef,
    operationKey: admitted.operationKey,
    sourceDigest: admitted.sourceDigest,
    evidenceRefs: admitted.evidenceRefs,
    observedAt: args.observedAt,
    freeTier: false,
    operator: admitted.operator,
    provider: admitted.provider,
    rake: admitted.rake,
  }
}

const allBrokeredFacts = (facts: readonly boolean[]): boolean =>
  facts.every(Boolean)

function optionalBrokeredRefMatches(
  persisted: string | undefined,
  expected: string,
): boolean {
  return persisted === undefined || persisted === expected
}

function replayedPayoutTransactionMatches(input: Readonly<{
  transaction: Doc<'moneyTransactions'> | undefined
  transactionRef: string
  idempotencyKey: string
  sourceDigest: string
  externalRef: string
  amount: ExactAmount
  admitted: AdmittedInvocationCharge
  expectedProviderVersion: number
}>): boolean {
  const {
    transaction,
    transactionRef,
    idempotencyKey,
    sourceDigest,
    externalRef,
    amount,
    admitted,
    expectedProviderVersion,
  } = input
  if (transaction === undefined) return false
  return allBrokeredFacts([
    transaction.transactionRef === transactionRef,
    transaction.kind === 'payout_accrual',
    transaction.idempotencyKey === idempotencyKey,
    transaction.inputDigest === sourceDigest,
    transaction.principalId === `business:${admitted.businessId}`,
    transaction.accountId === undefined,
    transaction.currency === amount.currency,
    transaction.amountUnits === amount.units,
    transaction.exponent === amount.exponent,
    transaction.state === 'applied',
    transaction.expectedAccountVersion === expectedProviderVersion,
    transaction.externalRef === externalRef,
    transaction.reversalOf === undefined,
  ])
}

function replayedProviderAccountMatches(
  provider: ReturnType<typeof canonicalMoneyAccountPreview>,
  admitted: AdmittedInvocationCharge,
  amount: ExactAmount,
): boolean {
  return allBrokeredFacts([
    provider.accountRef === admitted.providerAccountRef,
    provider.accountKind === 'provider_earnings',
    provider.businessId === admitted.businessId,
    provider.currency === amount.currency,
    provider.exponent === amount.exponent,
    provider.state === 'active',
  ])
}

function replayedProviderDebitMatches(input: Readonly<{
  entry: Doc<'moneyLedgerEntries'> | undefined
  transactionRef: string
  idempotencyKey: string
  sourceDigest: string
  evidenceRef: string
  amount: ExactAmount
  admitted: AdmittedInvocationCharge
}>): boolean {
  const {
    entry,
    transactionRef,
    idempotencyKey,
    sourceDigest,
    evidenceRef,
    amount,
    admitted,
  } = input
  if (entry === undefined) return false
  return allBrokeredFacts([
    entry.entryRef === `${transactionRef}:external-settlement`,
    entry.accountRef === admitted.providerAccountRef,
    entry.entryType === 'payout_accrual',
    entry.direction === 'debit',
    entry.amountUnits === amount.units,
    entry.currency === amount.currency,
    entry.exponent === amount.exponent,
    entry.transactionRef === transactionRef,
    entry.idempotencyKey === idempotencyKey,
    entry.businessId === admitted.businessId,
    entry.principalId === undefined,
    entry.invocationRef === undefined,
    entry.attemptRef === undefined,
    entry.sourceDigest === sourceDigest,
    entry.evidenceRefs.length === 1,
    entry.evidenceRefs[0] === evidenceRef,
    entry.reversalOf === undefined,
  ])
}

function replayedBrokeredPayoutIsExact(input: Readonly<{
  payoutByRef: readonly Doc<'moneyTransactions'>[]
  payoutByIdempotency: readonly Doc<'moneyTransactions'>[]
  payoutEntries: readonly Doc<'moneyLedgerEntries'>[]
  transactionRef: string
  idempotencyKey: string
  sourceDigest: string
  evidenceRef: string
  externalRef: string
  amount: ExactAmount
  admitted: AdmittedInvocationCharge
  operator: ReturnType<typeof canonicalMoneyAccountPreview>
  provider: ReturnType<typeof canonicalMoneyAccountPreview>
}>): boolean {
  const transaction = input.payoutByRef[0]
  const heldAfterRelease = heldBrokeredAmount(input.operator)
  return allBrokeredFacts([
    input.payoutByRef.length === 1,
    input.payoutByIdempotency.length === 1,
    transaction !== undefined,
    input.payoutByIdempotency[0]?._id === transaction?._id,
    input.payoutEntries.length === 1,
    replayedPayoutTransactionMatches({
      transaction,
      transactionRef: input.transactionRef,
      idempotencyKey: input.idempotencyKey,
      sourceDigest: input.sourceDigest,
      externalRef: input.externalRef,
      amount: input.amount,
      admitted: input.admitted,
      expectedProviderVersion: input.provider.version - 1,
    }),
    replayedProviderAccountMatches(input.provider, input.admitted, input.amount),
    heldAfterRelease !== undefined,
    heldAfterRelease?.units === '0',
    replayedProviderDebitMatches({
      entry: input.payoutEntries[0],
      transactionRef: input.transactionRef,
      idempotencyKey: input.idempotencyKey,
      sourceDigest: input.sourceDigest,
      evidenceRef: input.evidenceRef,
      amount: input.amount,
      admitted: input.admitted,
    }),
  ])
}

function brokeredProviderPayoutMaterial(
  chargeTransactionRef: string,
  externalRef: string,
) {
  const identity = {
    format: 'money-brokered-external-payout:v1',
    chargeTransactionRef,
    externalRef,
  }
  return {
    transactionRef: canonicalDigest(identity as StableHashValue),
    idempotencyKey: canonicalDigest({
      ...identity,
      format: 'money-brokered-external-payout-idempotency:v1',
    } as StableHashValue),
    sourceDigest: canonicalDigest({
      ...identity,
      format: 'money-brokered-external-payout-source:v1',
    } as StableHashValue),
    evidenceRef: canonicalDigest({
      ...identity,
      format: 'money-brokered-external-payout-evidence:v1',
    } as StableHashValue),
  }
}

async function replayFinalizedBrokeredInvocationCharge(
  ctx: MutationCtx,
  args: BrokeredInvocationChargeFinalizeArgs,
  admitted: AdmittedInvocationCharge,
  prior: Doc<'moneyTransactions'>,
) {
  if (prior.externalRef !== args.externalRef) {
    return brokeredRefusal('charge_reconciliation_required')
  }
  const input = brokeredPlanInput(admitted, args, args.externalRef)
  if (input === undefined) return brokeredRefusal('rake_not_configured')
  const priorUsage = admitted.existingUsage === null
    ? undefined
    : domainMoneyUsage(admitted.existingUsage)
  const replay = planPaidCharge({
    ...input,
    priorTransaction: domainMoneyTransaction(prior),
    ...(priorUsage === undefined ? {} : { priorUsage }),
    priorEntries: domainMoneyEntries(admitted.priorEntryRows) ?? [],
  })
  if (
    replay.result.kind !== 'accepted'
    || replay.result.chargeState !== 'paid'
    || replay.result.providerNet === undefined
  ) return brokeredRefusal('charge_reconciliation_required')
  const payout = brokeredProviderPayoutMaterial(prior.transactionRef, args.externalRef)
  const [payoutByRef, payoutByIdempotency, payoutEntries] = await Promise.all([
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (query) =>
        query.eq('transactionRef', payout.transactionRef),
      )
      .take(2),
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_idempotencyKey', (query) =>
        query.eq('idempotencyKey', payout.idempotencyKey),
      )
      .take(2),
    ctx.db
      .query('moneyLedgerEntries')
      .withIndex('by_transactionRef', (query) =>
        query.eq('transactionRef', payout.transactionRef),
      )
      .take(2),
  ])
  if (!replayedBrokeredPayoutIsExact({
    payoutByRef,
    payoutByIdempotency,
    payoutEntries,
    transactionRef: payout.transactionRef,
    idempotencyKey: payout.idempotencyKey,
    sourceDigest: payout.sourceDigest,
    evidenceRef: payout.evidenceRef,
    externalRef: args.externalRef,
    amount: replay.result.providerNet,
    admitted,
    operator: canonicalMoneyAccountPreview(admitted.operatorPrepared),
    provider: canonicalMoneyAccountPreview(admitted.providerPrepared),
  })) return brokeredRefusal('charge_reconciliation_required')
  return replay.result
}

function pendingBrokeredFinalizationIsApplicable(
  prior: Doc<'moneyTransactions'>,
  admitted: AdmittedInvocationCharge,
  reconciliationEvidenceRefs: readonly string[] | undefined,
): boolean {
  const outcomeEvidenceIsPresent = prior.state !== 'outcome_unknown'
    || (reconciliationEvidenceRefs !== undefined
      && reconciliationEvidenceRefs.length > 0)
  return allBrokeredFacts([
    prior.state === 'pending' || prior.state === 'outcome_unknown',
    outcomeEvidenceIsPresent,
    admitted.priorEntryRows.length === 0,
    admitted.existingUsage === null,
    prior.budgetState === 'reserved' || prior.budgetState === 'unknown',
  ])
}

export async function finalizeBrokeredInvocationChargeHandler(
  ctx: MutationCtx,
  args: BrokeredInvocationChargeFinalizeArgs,
) {
  if (args.externalRef.length === 0)
    return brokeredRefusal('charge_reconciliation_required')
  const admitted = await admitInvocationCharge(ctx, args)
  if (admitted.kind === 'refused') return admitted
  const pairRefusal = requireBrokeredPair(admitted)
  if (pairRefusal !== undefined) return pairRefusal
  const prior = admitted.prior
  if (prior === null) return brokeredRefusal('ledger_idempotency_conflict')
  if (!optionalBrokeredRefMatches(prior.externalRef, args.externalRef))
    return brokeredRefusal('ledger_idempotency_conflict')
  if (prior.state === 'applied') {
    return replayFinalizedBrokeredInvocationCharge(ctx, args, admitted, prior)
  }
  if (!pendingBrokeredFinalizationIsApplicable(
    prior,
    admitted,
    args.reconciliationEvidenceRefs,
  ))
    return brokeredRefusal('charge_reconciliation_required')
  const input = brokeredPlanInput(admitted, args, args.externalRef)
  if (input === undefined) return brokeredRefusal('rake_not_configured')
  const plan = planPaidCharge(input)
  if (
    plan.result.kind !== 'accepted'
    || plan.result.chargeState !== 'paid'
    || plan.usage === undefined
    || plan.transaction === undefined
    || plan.accounts === undefined
    || validatePaidChargePlan(plan) === undefined
  )
    return plan.result.kind === 'refused'
      ? plan.result
      : brokeredRefusal('charge_reconciliation_required')
  const usagePlan = await prepareMoneyUsageEvent(ctx, usageEventInput(plan.usage))
  if (usagePlan === undefined || usagePlan.kind !== 'insert')
    return brokeredRefusal('charge_reconciliation_required')
  const budgetTransition = await prepareCredentialBudgetTransition(
    ctx,
    prior,
    'released',
    args.observedAt,
  )
  if (budgetTransition === undefined || budgetTransition.kind !== 'apply')
    return brokeredRefusal('budget_reconciliation_required')
  const [operatorRow, providerRow, rakeRow] = await Promise.all([
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', admitted.operatorAccountRef),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', admitted.providerAccountRef),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', admitted.rakeAccountRef),
      )
      .unique(),
  ])
  if (operatorRow === null || providerRow === null || rakeRow === null)
    return brokeredRefusal('billing_identity_missing')
  const held = heldBrokeredAmount(operatorRow)
  if (held === undefined) return brokeredRefusal('charge_reconciliation_required')
  const nextHeld = subtractExactAmounts(held, admitted.amount)
  if (nextHeld === undefined) return brokeredRefusal('charge_reconciliation_required')
  const providerPayout = brokeredProviderPayoutMaterial(
    plan.transaction.transactionRef,
    args.externalRef,
  )
  const providerPayoutAmount = plan.result.providerNet
  if (providerPayoutAmount === undefined)
    return brokeredRefusal('rake_not_configured')
  const providerBeforeExternalPayout = amountFromParts(
    providerRow.currency,
    providerRow.balanceUnits,
    providerRow.exponent,
  )
  if (providerBeforeExternalPayout === undefined)
    return brokeredRefusal('charge_reconciliation_required')
  const providerAfterExternalPayout = applyProviderAccountDebit(
    plan.accounts.provider,
    providerPayoutAmount,
    args.observedAt,
  )
  if (
    providerAfterExternalPayout === undefined
    || compareExactAmounts(providerAfterExternalPayout.balance, providerBeforeExternalPayout) !== 0
  )
    return brokeredRefusal('charge_reconciliation_required')
  for (const entry of plan.entries)
    await ctx.db.insert('moneyLedgerEntries', brokeredLedgerEntryRow(entry))
  await ctx.db.patch(operatorRow._id, {
    balanceUnits: plan.accounts.operator.balance.units,
    heldUnits: nextHeld.units,
    version: plan.accounts.operator.version,
    updatedAt: plan.accounts.operator.updatedAt,
  })
  await ctx.db.patch(providerRow._id, {
    balanceUnits: providerAfterExternalPayout.balance.units,
    recoveryDueUnits: providerAfterExternalPayout.recoveryDue.units,
    version: providerAfterExternalPayout.version,
    updatedAt: providerAfterExternalPayout.updatedAt,
  })
  await ctx.db.patch(rakeRow._id, {
    balanceUnits: plan.accounts.rake.balance.units,
    version: plan.accounts.rake.version,
    updatedAt: plan.accounts.rake.updatedAt,
  })
  await applyPreparedCredentialBudgetTransition(ctx, budgetTransition)
  await ctx.db.patch(prior._id, {
    state: 'applied',
    budgetState: 'settled',
    settledAt: args.observedAt,
    externalRef: args.externalRef,
    updatedAt: args.observedAt,
  })
  await applyPreparedMoneyUsageEvent(ctx, usagePlan)
  await ctx.db.insert('moneyTransactions', {
    transactionRef: providerPayout.transactionRef,
    kind: 'payout_accrual',
    idempotencyKey: providerPayout.idempotencyKey,
    inputDigest: providerPayout.sourceDigest,
    principalId: `business:${admitted.businessId}`,
    currency: providerPayoutAmount.currency,
    amountUnits: providerPayoutAmount.units,
    exponent: providerPayoutAmount.exponent,
    state: 'applied',
    expectedAccountVersion: plan.accounts.provider.version,
    externalRef: args.externalRef,
    createdAt: args.observedAt,
    updatedAt: args.observedAt,
  })
  await ctx.db.insert('moneyLedgerEntries', {
    entryRef: `${providerPayout.transactionRef}:external-settlement`,
    accountRef: providerRow.accountRef,
    entryType: 'payout_accrual',
    direction: 'debit',
    amountUnits: providerPayoutAmount.units,
    currency: providerPayoutAmount.currency,
    exponent: providerPayoutAmount.exponent,
    transactionRef: providerPayout.transactionRef,
    idempotencyKey: providerPayout.idempotencyKey,
    businessId: admitted.businessId,
    sourceDigest: providerPayout.sourceDigest,
    evidenceRefs: [providerPayout.evidenceRef],
    createdAt: args.observedAt,
  })
  return plan.result
}

export async function releaseBrokeredInvocationChargeHandler(
  ctx: MutationCtx,
  args: BrokeredInvocationChargeReleaseArgs,
) {
  const admitted = await admitInvocationCharge(ctx, args)
  if (admitted.kind === 'refused') return admitted
  const pairRefusal = requireBrokeredPair(admitted)
  if (pairRefusal !== undefined) return pairRefusal
  const prior = admitted.prior
  if (prior === null) return brokeredRefusal('ledger_idempotency_conflict')
  if (prior.state === 'reversed' && prior.budgetState === 'released')
    return { kind: 'released' as const, transactionRef: prior.transactionRef }
  if (prior.state === 'applied')
    return brokeredRefusal('charge_reconciliation_required')
  if (prior.state !== 'pending' && prior.state !== 'outcome_unknown')
    return brokeredRefusal('charge_reconciliation_required')
  if (
    prior.state === 'outcome_unknown'
    && (args.reconciliationEvidenceRefs === undefined
      || args.reconciliationEvidenceRefs.length === 0)
  )
    return brokeredRefusal('charge_reconciliation_required')
  if (admitted.priorEntryRows.length !== 0 || admitted.existingUsage !== null)
    return brokeredRefusal('charge_reconciliation_required')
  const operatorRow = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (query) =>
      query.eq('accountRef', admitted.operatorAccountRef),
    )
    .unique()
  if (operatorRow === null) return brokeredRefusal('billing_identity_missing')
  const held = heldBrokeredAmount(operatorRow)
  if (held === undefined) return brokeredRefusal('charge_reconciliation_required')
  const nextHeld = subtractExactAmounts(held, admitted.amount)
  if (nextHeld === undefined) return brokeredRefusal('charge_reconciliation_required')
  const budgetTransition = await prepareCredentialBudgetTransition(
    ctx,
    prior,
    'not_released',
    args.observedAt,
  )
  if (budgetTransition === undefined)
    return brokeredRefusal('budget_reconciliation_required')
  await applyPreparedCredentialBudgetTransition(ctx, budgetTransition)
  await ctx.db.patch(operatorRow._id, {
    heldUnits: nextHeld.units,
    version: operatorRow.version + 1,
    updatedAt: args.observedAt,
  })
  await ctx.db.patch(prior._id, {
    state: 'reversed',
    budgetState: 'released',
    updatedAt: args.observedAt,
  })
  return { kind: 'released' as const, transactionRef: prior.transactionRef }
}

export async function markBrokeredInvocationChargeOutcomeUnknownHandler(
  ctx: MutationCtx,
  args: AuthorizeInvocationChargeArgs,
) {
  const admitted = await admitInvocationCharge(ctx, args)
  if (admitted.kind === 'refused') return admitted
  const pairRefusal = requireBrokeredPair(admitted)
  if (pairRefusal !== undefined) return pairRefusal
  const prior = admitted.prior
  if (prior === null) return brokeredRefusal('ledger_idempotency_conflict')
  if (prior.state === 'outcome_unknown')
    return {
      kind: 'outcome_unknown' as const,
      transactionRef: prior.transactionRef,
    }
  if (prior.state !== 'pending')
    return brokeredRefusal('charge_reconciliation_required')
  if (admitted.priorEntryRows.length !== 0 || admitted.existingUsage !== null)
    return brokeredRefusal('charge_reconciliation_required')
  await ctx.db.patch(prior._id, {
    state: 'outcome_unknown',
    budgetState: 'unknown',
    updatedAt: args.observedAt,
  })
  return {
    kind: 'outcome_unknown' as const,
    transactionRef: prior.transactionRef,
  }
}
