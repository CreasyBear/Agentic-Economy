import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  addExactAmounts,
  accountRefForExternalLoss,
  amountFromParts,
  compareExactAmounts,
  readExactAmount,
  subtractExactAmounts,
  type ExactAmount,
  type MoneyRefusal,
} from '../src/modules/money/public'
import type { MutationCtx } from './_generated/server'
import {
  applyPreparedCredentialBudgetTransition,
  prepareCredentialBudgetTransition,
} from './moneyBudgetPersist'
import {
  applyPreparedCanonicalMoneyAccount,
  canonicalMoneyAccountPreview,
  prepareCanonicalMoneyAccount,
} from './moneyCanonicalAccounts'
import {
  admitInvocationCharge,
  type AuthorizeInvocationChargeArgs,
} from './moneyChargeAdmission'

export type BrokeredInvalidOutputLossMaterialInput = Readonly<{
  chargeTransactionRef: string
  invocationRef: string
  attemptRef: string
  externalRef: string
  providerAmount: ExactAmount
  invalidOutputEvidenceRef: string
  invalidOutputEvidenceDigest: string
  reconciliationEvidenceRefs: readonly string[]
}>

export type BrokeredInvalidOutputLossArgs = AuthorizeInvocationChargeArgs & Readonly<{
  externalRef: string
  invalidOutputEvidenceRef: string
  invalidOutputEvidenceDigest: string
  reconciliationEvidenceRefs: string[]
}>

type BrokeredInvalidOutputLossMaterial = Readonly<{
  lossTransactionRef: string
  lossEntryRef: string
  lossAccountRef: string
  amount: ExactAmount
  evidenceRefs: readonly string[]
  inputDigest: string
  sourceDigest: string
}>

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function reconciliationRefusal(): MoneyRefusal {
  return {
    kind: 'refused',
    code: 'charge_reconciliation_required',
    retryable: false,
  }
}

export function brokeredInvalidOutputLossMaterial(
  input: BrokeredInvalidOutputLossMaterialInput,
): BrokeredInvalidOutputLossMaterial | undefined {
  if (
    !nonBlank(input.chargeTransactionRef)
    || !nonBlank(input.invocationRef)
    || !nonBlank(input.attemptRef)
    || !nonBlank(input.externalRef)
    || !nonBlank(input.invalidOutputEvidenceRef)
    || !nonBlank(input.invalidOutputEvidenceDigest)
    || !Array.isArray(input.reconciliationEvidenceRefs)
    || input.reconciliationEvidenceRefs.length === 0
    || input.reconciliationEvidenceRefs.some((ref) => !nonBlank(ref))
  )
    return undefined

  const providerAmount = readExactAmount(input.providerAmount)
  if (providerAmount === undefined) return undefined

  const evidenceRefs = [
    ...input.reconciliationEvidenceRefs,
    input.invalidOutputEvidenceRef,
  ]
  if (new Set(evidenceRefs).size !== evidenceRefs.length) return undefined

  const lossTransactionRef =
    `operation-money-loss:${input.invocationRef}:${input.attemptRef}:1`
  const lossEntryRef = `${lossTransactionRef}:external-loss`
  const digestMaterial = {
    format: 'brokered-invalid-output-loss:v1',
    chargeTransactionRef: input.chargeTransactionRef,
    invocationRef: input.invocationRef,
    attemptRef: input.attemptRef,
    externalRef: input.externalRef,
    providerAmount,
    invalidOutputEvidenceRef: input.invalidOutputEvidenceRef,
    invalidOutputEvidenceDigest: input.invalidOutputEvidenceDigest,
    reconciliationEvidenceRefs: [...input.reconciliationEvidenceRefs],
  }
  const digest = canonicalDigest(digestMaterial as StableHashValue)

  return {
    lossTransactionRef,
    lossEntryRef,
    lossAccountRef: accountRefForExternalLoss(providerAmount.currency),
    amount: providerAmount,
    evidenceRefs,
    inputDigest: digest,
    sourceDigest: digest,
  }
}

export async function recordBrokeredInvalidOutputLossHandler(
  ctx: MutationCtx,
  args: BrokeredInvalidOutputLossArgs,
) {
  if (!Number.isFinite(args.observedAt)) return reconciliationRefusal()
  const preliminaryMaterial = brokeredInvalidOutputLossMaterial({
    chargeTransactionRef: args.transactionRef,
    invocationRef: args.invocationRef,
    attemptRef: args.attemptRef,
    externalRef: args.externalRef,
    providerAmount: args.amount,
    invalidOutputEvidenceRef: args.invalidOutputEvidenceRef,
    invalidOutputEvidenceDigest: args.invalidOutputEvidenceDigest,
    reconciliationEvidenceRefs: args.reconciliationEvidenceRefs,
  })
  if (preliminaryMaterial === undefined) return reconciliationRefusal()

  const admitted = await admitInvocationCharge(ctx, args)
  if (admitted.kind === 'refused') return admitted
  if (
    admitted.providerAmount === undefined
    || admitted.platformFee === undefined
  )
    return reconciliationRefusal()
  const material = brokeredInvalidOutputLossMaterial({
    chargeTransactionRef: args.transactionRef,
    invocationRef: args.invocationRef,
    attemptRef: args.attemptRef,
    externalRef: args.externalRef,
    providerAmount: admitted.providerAmount,
    invalidOutputEvidenceRef: args.invalidOutputEvidenceRef,
    invalidOutputEvidenceDigest: args.invalidOutputEvidenceDigest,
    reconciliationEvidenceRefs: args.reconciliationEvidenceRefs,
  })
  if (
    material === undefined
    || compareExactAmounts(admitted.providerAmount, material.amount) !== 0
  )
    return reconciliationRefusal()
  const pairTotal = addExactAmounts(admitted.providerAmount, admitted.platformFee)
  if (pairTotal === undefined || compareExactAmounts(pairTotal, admitted.amount) !== 0)
    return reconciliationRefusal()
  const prior = admitted.prior
  if (prior === null) return reconciliationRefusal()

  const [lossTransactions, lossEntries, lossAccount] = await Promise.all([
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (query) =>
        query.eq('transactionRef', material.lossTransactionRef),
      )
      .take(2),
    ctx.db
      .query('moneyLedgerEntries')
      .withIndex('by_transactionRef', (query) =>
        query.eq('transactionRef', material.lossTransactionRef),
      )
      .take(2),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', material.lossAccountRef),
      )
      .unique(),
  ])

  if (prior.state === 'reversed' && prior.budgetState === 'released') {
    const lossTransaction = lossTransactions[0]
    const lossEntry = lossEntries[0]
    const replayIsExact =
      prior.externalRef === args.externalRef
      && admitted.priorEntryRows.length === 0
      && admitted.existingUsage === null
      && lossTransactions.length === 1
      && lossEntries.length === 1
      && lossTransaction !== undefined
      && lossEntry !== undefined
      && lossAccount !== null
      && lossTransaction.transactionRef === material.lossTransactionRef
      && lossTransaction.kind === 'external_loss'
      && lossTransaction.idempotencyKey === material.lossTransactionRef
      && lossTransaction.inputDigest === material.inputDigest
      && lossTransaction.principalId === admitted.principalId
      && lossTransaction.accountId === undefined
      && lossTransaction.currency === material.amount.currency
      && lossTransaction.amountUnits === material.amount.units
      && lossTransaction.exponent === material.amount.exponent
      && lossTransaction.state === 'applied'
      && Number.isFinite(lossTransaction.expectedAccountVersion)
      && lossTransaction.externalRef === args.externalRef
      && lossTransaction.credentialId === undefined
      && lossTransaction.budgetPolicyRef === undefined
      && lossTransaction.budgetGeneration === undefined
      && lossTransaction.budgetEnvironment === undefined
      && lossTransaction.budgetDayStart === undefined
      && lossTransaction.budgetMonthStart === undefined
      && lossTransaction.budgetState === undefined
      && lossTransaction.settledAt === undefined
      && lossTransaction.reversalOf === undefined
      && lossAccount.accountRef === material.lossAccountRef
      && lossAccount.accountKind === 'ae_external_loss'
      && lossAccount.currency === material.amount.currency
      && lossAccount.exponent === material.amount.exponent
      && lossAccount.accountId === undefined
      && lossAccount.businessId === undefined
      && lossEntry.entryRef === material.lossEntryRef
      && lossEntry.accountRef === material.lossAccountRef
      && lossEntry.entryType === 'external_loss'
      && lossEntry.direction === 'credit'
      && lossEntry.amountUnits === material.amount.units
      && lossEntry.currency === material.amount.currency
      && lossEntry.exponent === material.amount.exponent
      && lossEntry.transactionRef === material.lossTransactionRef
      && lossEntry.idempotencyKey === material.lossTransactionRef
      && lossEntry.principalId === admitted.principalId
      && lossEntry.businessId === undefined
      && lossEntry.invocationRef === admitted.invocationRef
      && lossEntry.attemptRef === admitted.attemptRef
      && lossEntry.sourceDigest === material.sourceDigest
      && lossEntry.evidenceRefs.length === material.evidenceRefs.length
      && lossEntry.evidenceRefs.every(
        (ref, index) => ref === material.evidenceRefs[index],
      )
      && lossEntry.payoutRef === undefined
      && lossEntry.allocationRef === undefined
      && lossEntry.allocationCorrectionUnits === undefined
      && lossEntry.reversalOf === undefined
    if (!replayIsExact) return reconciliationRefusal()
    return {
      kind: 'settled' as const,
      chargeTransactionRef: prior.transactionRef,
      lossTransactionRef: material.lossTransactionRef,
    }
  }

  if (
    prior.state !== 'pending'
    && prior.state !== 'outcome_unknown'
  )
    return reconciliationRefusal()
  if (
    prior.externalRef !== undefined
    || prior.budgetState !== 'reserved' && prior.budgetState !== 'unknown'
    || admitted.priorEntryRows.length !== 0
    || admitted.existingUsage !== null
    || lossTransactions.length !== 0
    || lossEntries.length !== 0
  )
    return reconciliationRefusal()

  const operatorRow = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (query) =>
      query.eq('accountRef', admitted.operatorAccountRef),
    )
    .unique()
  if (
    operatorRow === null
    || operatorRow.accountRef !== admitted.operatorAccountRef
    || operatorRow.accountKind !== 'operator_credit'
    || operatorRow.accountId !== admitted.accountId
    || operatorRow.businessId !== undefined
    || operatorRow.currency !== admitted.amount.currency
    || operatorRow.exponent !== admitted.amount.exponent
  )
    return reconciliationRefusal()
  const held = amountFromParts(
    operatorRow.currency,
    operatorRow.heldUnits,
    operatorRow.exponent,
  )
  if (held === undefined) return reconciliationRefusal()
  const nextHeld = subtractExactAmounts(held, admitted.amount)
  if (nextHeld === undefined) return reconciliationRefusal()

  const preparedLossAccount = await prepareCanonicalMoneyAccount(ctx, {
    accountKind: 'ae_external_loss',
    currency: admitted.currency,
    exponent: admitted.amount.exponent,
    now: args.observedAt,
  })
  if (preparedLossAccount === undefined) return reconciliationRefusal()
  const lossAccountPreview = canonicalMoneyAccountPreview(preparedLossAccount)
  if (
    lossAccountPreview.accountRef !== material.lossAccountRef
    || lossAccountPreview.accountKind !== 'ae_external_loss'
    || lossAccountPreview.currency !== material.amount.currency
    || lossAccountPreview.exponent !== material.amount.exponent
    || lossAccountPreview.accountId !== undefined
    || lossAccountPreview.businessId !== undefined
    || lossAccountPreview.heldUnits !== '0'
    || lossAccountPreview.recoveryDueUnits !== '0'
  )
    return reconciliationRefusal()
  const lossBalance = amountFromParts(
    lossAccountPreview.currency,
    lossAccountPreview.balanceUnits,
    lossAccountPreview.exponent,
  )
  const nextLossBalance = lossBalance === undefined
    ? undefined
    : addExactAmounts(lossBalance, material.amount)
  if (nextLossBalance === undefined) return reconciliationRefusal()

  const budgetTransition = await prepareCredentialBudgetTransition(
    ctx,
    prior,
    'not_released',
    args.observedAt,
  )
  if (budgetTransition === undefined || budgetTransition.kind !== 'apply')
    return reconciliationRefusal()

  const lossAccountRow = await applyPreparedCanonicalMoneyAccount(
    ctx,
    preparedLossAccount,
  )
  await applyPreparedCredentialBudgetTransition(ctx, budgetTransition)
  await ctx.db.patch(operatorRow._id, {
    heldUnits: nextHeld.units,
    version: operatorRow.version + 1,
    updatedAt: args.observedAt,
  })
  await ctx.db.patch(lossAccountRow._id, {
    balanceUnits: nextLossBalance.units,
    version: lossAccountRow.version + 1,
    updatedAt: args.observedAt,
  })
  await ctx.db.patch(prior._id, {
    state: 'reversed',
    budgetState: 'released',
    externalRef: args.externalRef,
    updatedAt: args.observedAt,
  })
  await ctx.db.insert('moneyTransactions', {
    transactionRef: material.lossTransactionRef,
    kind: 'external_loss',
    idempotencyKey: material.lossTransactionRef,
    inputDigest: material.inputDigest,
    principalId: admitted.principalId,
    currency: material.amount.currency,
    amountUnits: material.amount.units,
    exponent: material.amount.exponent,
    state: 'applied',
    expectedAccountVersion: lossAccountRow.version,
    externalRef: args.externalRef,
    createdAt: args.observedAt,
    updatedAt: args.observedAt,
  })
  await ctx.db.insert('moneyLedgerEntries', {
    entryRef: material.lossEntryRef,
    accountRef: material.lossAccountRef,
    entryType: 'external_loss',
    direction: 'credit',
    amountUnits: material.amount.units,
    currency: material.amount.currency,
    exponent: material.amount.exponent,
    transactionRef: material.lossTransactionRef,
    idempotencyKey: material.lossTransactionRef,
    principalId: admitted.principalId,
    invocationRef: admitted.invocationRef,
    attemptRef: admitted.attemptRef,
    sourceDigest: material.sourceDigest,
    evidenceRefs: [...material.evidenceRefs],
    createdAt: args.observedAt,
  })
  return {
    kind: 'settled' as const,
    chargeTransactionRef: prior.transactionRef,
    lossTransactionRef: material.lossTransactionRef,
  }
}
