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
import type { Doc } from './_generated/dataModel'
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
  type AdmittedInvocationCharge,
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
type InvocationChargeRefusal = Extract<
  Awaited<ReturnType<typeof admitInvocationCharge>>,
  { kind: 'refused' }
>

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

const allLossFacts = (facts: readonly boolean[]): boolean => facts.every(Boolean)

function lossTransactionMatches(
  transaction: Doc<'moneyTransactions'> | undefined,
  material: BrokeredInvalidOutputLossMaterial,
  admitted: AdmittedInvocationCharge,
  externalRef: string,
): boolean {
  if (transaction === undefined) return false
  return allLossFacts([
    transaction.transactionRef === material.lossTransactionRef,
    transaction.kind === 'external_loss',
    transaction.idempotencyKey === material.lossTransactionRef,
    transaction.inputDigest === material.inputDigest,
    transaction.principalId === admitted.principalId,
    transaction.accountId === undefined,
    transaction.currency === material.amount.currency,
    transaction.amountUnits === material.amount.units,
    transaction.exponent === material.amount.exponent,
    transaction.state === 'applied',
    Number.isFinite(transaction.expectedAccountVersion),
    transaction.externalRef === externalRef,
    transaction.credentialId === undefined,
    transaction.budgetPolicyRef === undefined,
    transaction.budgetGeneration === undefined,
    transaction.budgetEnvironment === undefined,
    transaction.budgetDayStart === undefined,
    transaction.budgetMonthStart === undefined,
    transaction.budgetState === undefined,
    transaction.settledAt === undefined,
    transaction.reversalOf === undefined,
  ])
}

function lossAccountMatches(
  account: Doc<'moneyAccounts'> | null,
  material: BrokeredInvalidOutputLossMaterial,
): boolean {
  if (account === null) return false
  return allLossFacts([
    account.accountRef === material.lossAccountRef,
    account.accountKind === 'ae_external_loss',
    account.currency === material.amount.currency,
    account.exponent === material.amount.exponent,
    account.accountId === undefined,
    account.businessId === undefined,
  ])
}

function lossEntryMatches(
  entry: Doc<'moneyLedgerEntries'> | undefined,
  material: BrokeredInvalidOutputLossMaterial,
  admitted: AdmittedInvocationCharge,
): boolean {
  if (entry === undefined) return false
  return allLossFacts([
    entry.entryRef === material.lossEntryRef,
    entry.accountRef === material.lossAccountRef,
    entry.entryType === 'external_loss',
    entry.direction === 'credit',
    entry.amountUnits === material.amount.units,
    entry.currency === material.amount.currency,
    entry.exponent === material.amount.exponent,
    entry.transactionRef === material.lossTransactionRef,
    entry.idempotencyKey === material.lossTransactionRef,
    entry.principalId === admitted.principalId,
    entry.businessId === undefined,
    entry.invocationRef === admitted.invocationRef,
    entry.attemptRef === admitted.attemptRef,
    entry.sourceDigest === material.sourceDigest,
    entry.evidenceRefs.length === material.evidenceRefs.length,
    entry.evidenceRefs.every((ref, index) => ref === material.evidenceRefs[index]),
    entry.payoutRef === undefined,
    entry.allocationRef === undefined,
    entry.allocationCorrectionUnits === undefined,
    entry.reversalOf === undefined,
  ])
}

function lossReplayIsExact(input: Readonly<{
  prior: Doc<'moneyTransactions'>
  admitted: AdmittedInvocationCharge
  material: BrokeredInvalidOutputLossMaterial
  externalRef: string
  lossTransactions: readonly Doc<'moneyTransactions'>[]
  lossEntries: readonly Doc<'moneyLedgerEntries'>[]
  lossAccount: Doc<'moneyAccounts'> | null
}>): boolean {
  const {
    prior,
    admitted,
    material,
    externalRef,
    lossTransactions,
    lossEntries,
    lossAccount,
  } = input
  return allLossFacts([
    prior.externalRef === externalRef,
    admitted.priorEntryRows.length === 0,
    admitted.existingUsage === null,
    lossTransactions.length === 1,
    lossEntries.length === 1,
    lossTransactionMatches(lossTransactions[0], material, admitted, externalRef),
    lossAccountMatches(lossAccount, material),
    lossEntryMatches(lossEntries[0], material, admitted),
  ])
}

function pendingLossMaterialIsApplicable(input: Readonly<{
  prior: Doc<'moneyTransactions'>
  admitted: AdmittedInvocationCharge
  lossTransactions: readonly Doc<'moneyTransactions'>[]
  lossEntries: readonly Doc<'moneyLedgerEntries'>[]
}>): boolean {
  const { prior, admitted, lossTransactions, lossEntries } = input
  return allLossFacts([
    prior.state === 'pending' || prior.state === 'outcome_unknown',
    prior.externalRef === undefined,
    prior.budgetState === 'reserved' || prior.budgetState === 'unknown',
    admitted.priorEntryRows.length === 0,
    admitted.existingUsage === null,
    lossTransactions.length === 0,
    lossEntries.length === 0,
  ])
}

function operatorLossSourceMatches(
  operator: Doc<'moneyAccounts'> | null,
  admitted: AdmittedInvocationCharge,
): operator is Doc<'moneyAccounts'> {
  if (operator === null) return false
  return allLossFacts([
    operator.accountRef === admitted.operatorAccountRef,
    operator.accountKind === 'operator_credit',
    operator.accountId === admitted.accountId,
    operator.businessId === undefined,
    operator.currency === admitted.amount.currency,
    operator.exponent === admitted.amount.exponent,
  ])
}

function lossAccountPreviewMatches(
  preview: ReturnType<typeof canonicalMoneyAccountPreview>,
  material: BrokeredInvalidOutputLossMaterial,
): boolean {
  return allLossFacts([
    preview.accountRef === material.lossAccountRef,
    preview.accountKind === 'ae_external_loss',
    preview.currency === material.amount.currency,
    preview.exponent === material.amount.exponent,
    preview.accountId === undefined,
    preview.businessId === undefined,
    preview.heldUnits === '0',
    preview.recoveryDueUnits === '0',
  ])
}

async function admitBrokeredInvalidOutputLoss(
  ctx: MutationCtx,
  args: BrokeredInvalidOutputLossArgs,
): Promise<
  | MoneyRefusal
  | InvocationChargeRefusal
  | Readonly<{
      kind: 'admitted'
      admitted: AdmittedInvocationCharge
      material: BrokeredInvalidOutputLossMaterial
      prior: Doc<'moneyTransactions'>
    }>
> {
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
  if (admitted.providerAmount === undefined || admitted.platformFee === undefined) {
    return reconciliationRefusal()
  }
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
  ) return reconciliationRefusal()
  const pairTotal = addExactAmounts(admitted.providerAmount, admitted.platformFee)
  if (pairTotal === undefined || compareExactAmounts(pairTotal, admitted.amount) !== 0) {
    return reconciliationRefusal()
  }
  if (admitted.prior === null) return reconciliationRefusal()
  return { kind: 'admitted', admitted, material, prior: admitted.prior }
}

export async function recordBrokeredInvalidOutputLossHandler(
  ctx: MutationCtx,
  args: BrokeredInvalidOutputLossArgs,
) {
  const admission = await admitBrokeredInvalidOutputLoss(ctx, args)
  if (admission.kind === 'refused') return admission
  const { admitted, material, prior } = admission

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
    if (!lossReplayIsExact({
      prior,
      admitted,
      material,
      externalRef: args.externalRef,
      lossTransactions,
      lossEntries,
      lossAccount,
    })) return reconciliationRefusal()
    return {
      kind: 'settled' as const,
      chargeTransactionRef: prior.transactionRef,
      lossTransactionRef: material.lossTransactionRef,
    }
  }

  if (!pendingLossMaterialIsApplicable({
    prior,
    admitted,
    lossTransactions,
    lossEntries,
  })) return reconciliationRefusal()

  const operatorRow = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (query) =>
      query.eq('accountRef', admitted.operatorAccountRef),
    )
    .unique()
  if (!operatorLossSourceMatches(operatorRow, admitted)) return reconciliationRefusal()
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
  if (!lossAccountPreviewMatches(lossAccountPreview, material)) {
    return reconciliationRefusal()
  }
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
