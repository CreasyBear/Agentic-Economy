import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  addExactAmounts,
  amountFromParts,
  compareExactAmounts,
  payoutAccrualFromChargeAmounts,
  qualifiedUseMaterialDigest,
  qualifiedUseRef,
  type ExactAmount,
  type QualifiedUseReceipt,
} from '../../../src/modules/money/public'
import { accountFromRow } from '../../moneyCanonicalAccounts'
import {
  chargeJournalRecoveryAmount,
  loadSealedChargeJournal,
  type MoneyLedgerEntryRow,
} from '../../moneyChargeJournal'
import {
  qualifiedUsePayoutFailure,
  type QualifiedUsePayoutResolution,
} from './contracts'

function requiredJournalRefs(receipt: QualifiedUseReceipt): readonly [string, string] {
  if (receipt.transactionRef === undefined || receipt.usageRef === undefined)
    return qualifiedUsePayoutFailure()
  return [receipt.transactionRef, receipt.usageRef]
}

function validReceiptInput(
  receipt: QualifiedUseReceipt,
  principalId: string,
): boolean {
  return [
    principalId.trim().length > 0, receipt.environment === 'production',
    receipt.qualifiedUseRef === qualifiedUseRef(receipt),
    receipt.materialDigest === qualifiedUseMaterialDigest(receipt),
    receipt.qualifiedUseRef.length > 0, receipt.materialDigest.length > 0,
    receipt.transactionRef !== undefined, receipt.transactionRef?.length !== 0,
    receipt.usageRef !== undefined, receipt.usageRef?.length !== 0,
  ].every(Boolean)
}

function freeTierTransactionMatches(
  receipt: QualifiedUseReceipt,
  principalId: string,
  transaction: Doc<'moneyTransactions'>,
  usage: Doc<'moneyUsageEvents'>,
  allowReversed: boolean,
): boolean {
  const stateAccepted = transaction.state === 'applied' ||
    (allowReversed && transaction.state === 'reversed')
  return [
    transaction.kind === 'charge', stateAccepted,
    transaction.idempotencyKey === transaction.transactionRef,
    transaction.transactionRef === receipt.transactionRef,
    transaction.accountId !== undefined, transaction.accountId === usage.accountId,
    transaction.principalId === principalId,
    transaction.budgetEnvironment === receipt.environment,
  ].every(Boolean)
}

function freeTierUsageMatches(
  receipt: QualifiedUseReceipt,
  principalId: string,
  transaction: Doc<'moneyTransactions'>,
  usage: Doc<'moneyUsageEvents'>,
): boolean {
  return [
    usage.principalId === principalId, usage.usageRef === receipt.usageRef,
    usage.transactionRef === receipt.transactionRef,
    usage.chargeState === 'free_tier', usage.businessId === receipt.businessId,
    usage.invocationRef === receipt.invocationRef,
    usage.attemptRef === receipt.attemptRef,
    usage.operationKey === receipt.operationRef,
    usage.serviceRef.trim().length > 0, usage.offeringRef.trim().length > 0,
    usage.observedAt === transaction.createdAt,
  ].every(Boolean)
}

function isCanonicalFreeTierCharge(
  receipt: QualifiedUseReceipt,
  principalId: string,
  transaction: Doc<'moneyTransactions'>,
  usage: Doc<'moneyUsageEvents'>,
  entries: readonly MoneyLedgerEntryRow[],
  allowReversed: boolean,
): boolean {
  const transactionAmount = transaction.amountUnits === undefined
    ? undefined
    : amountFromParts(
        transaction.currency, transaction.amountUnits, transaction.exponent,
      )
  const usageAmount = amountFromParts(
    usage.currency, usage.amountUnits, usage.exponent,
  )
  return [
    entries.length === 0, transactionAmount?.units === '0',
    usageAmount?.units === '0', receipt.environment === 'production',
    transaction.currency === usage.currency,
    transaction.exponent === usage.exponent,
    freeTierTransactionMatches(
      receipt, principalId, transaction, usage, allowReversed,
    ),
    freeTierUsageMatches(receipt, principalId, transaction, usage),
  ].every(Boolean)
}

function paidUsageMatches(
  receipt: QualifiedUseReceipt,
  usage: Doc<'moneyUsageEvents'>,
): boolean {
  return [
    usage.usageRef === receipt.usageRef,
    usage.transactionRef === receipt.transactionRef,
    usage.chargeState === 'paid', usage.invocationRef === receipt.invocationRef,
    usage.attemptRef === receipt.attemptRef,
    usage.businessId === receipt.businessId,
    usage.operationKey === receipt.operationRef,
  ].every(Boolean)
}

type PaidChargeDecision =
  | Readonly<{ kind: 'eligible' }>
  | Readonly<{ kind: 'refunded_before_delivery' }>
  | Readonly<{ kind: 'invalid' }>

function decidePaidCharge(
  transaction: Doc<'moneyTransactions'>,
  receipt: QualifiedUseReceipt,
  usage: Doc<'moneyUsageEvents'>,
): PaidChargeDecision {
  const refunded = [
    transaction.state === 'reversed', transaction.budgetState === 'released',
    transaction.settledAt !== undefined,
  ].every(Boolean)
  const settled = [
    transaction.state === 'applied', transaction.budgetState === 'settled',
    transaction.settledAt !== undefined,
  ].every(Boolean)
  const valid = [
    transaction.amountUnits !== undefined, transaction.amountUnits !== '0',
    paidUsageMatches(receipt, usage),
  ].every(Boolean)
  if (!valid) return { kind: 'invalid' }
  if (refunded) return { kind: 'refunded_before_delivery' }
  if (settled) return { kind: 'eligible' }
  return { kind: 'invalid' }
}

async function readCanonicalPayoutAccounts(
  ctx: Pick<MutationCtx, 'db'>,
  transaction: Doc<'moneyTransactions'>,
  journal: NonNullable<ReturnType<typeof loadSealedChargeJournal>>,
): Promise<Doc<'moneyAccounts'>> {
  const [operator, provider, rake] = await Promise.all([
    ctx.db.query('moneyAccounts').withIndex(
      'by_accountRef',
      (query) => query.eq('accountRef', journal.selected.charge.accountRef),
    ).unique(),
    ctx.db.query('moneyAccounts').withIndex(
      'by_accountRef',
      (query) => query.eq('accountRef', journal.selected.provider.accountRef),
    ).unique(),
    ctx.db.query('moneyAccounts').withIndex(
      'by_accountRef',
      (query) => query.eq('accountRef', journal.selected.rake.accountRef),
    ).unique(),
  ])
  if (operator === null || provider === null || rake === null)
    return qualifiedUsePayoutFailure()
  const valid = [
    accountFromRow(operator) !== undefined, accountFromRow(provider) !== undefined,
    accountFromRow(rake) !== undefined,
    operator.accountRef === accountRefForOwner(journal.accountId, transaction.currency),
    operator.accountKind === 'operator_credit', operator.accountId === journal.accountId,
    operator.businessId === undefined,
    provider.accountRef === accountRefForProvider(journal.businessId, transaction.currency),
    provider.accountKind === 'provider_earnings',
    provider.businessId === journal.businessId, provider.accountId === undefined,
    rake.accountRef === accountRefForRake(transaction.currency),
    rake.accountKind === 'ae_rake', rake.accountId === undefined,
    rake.businessId === undefined,
    [operator, provider, rake].every((account) =>
      account.currency === transaction.currency),
    [operator, provider, rake].every((account) =>
      account.exponent === transaction.exponent),
    new Set([
      journal.selected.charge.accountRef, journal.selected.provider.accountRef,
      journal.selected.rake.accountRef,
    ]).size === 3,
  ].every(Boolean)
  if (!valid) return qualifiedUsePayoutFailure()
  return provider
}

async function readPaidPayoutAmounts(
  ctx: Pick<MutationCtx, 'db'>,
  receipt: QualifiedUseReceipt,
  transaction: Doc<'moneyTransactions'>,
  usage: Doc<'moneyUsageEvents'>,
  entries: readonly MoneyLedgerEntryRow[],
): Promise<QualifiedUsePayoutResolution> {
  const decision = decidePaidCharge(transaction, receipt, usage)
  if (decision.kind === 'invalid') return qualifiedUsePayoutFailure()
  const journal = loadSealedChargeJournal(transaction, usage, entries)
  if (journal === undefined) return qualifiedUsePayoutFailure()
  if (![
    journal.businessId === receipt.businessId,
    journal.usage.invocationRef === receipt.invocationRef,
    journal.usage.attemptRef === receipt.attemptRef,
    journal.selected.charge.sourceDigest.length > 0,
  ].every(Boolean)) return qualifiedUsePayoutFailure()
  const provider = await readCanonicalPayoutAccounts(ctx, transaction, journal)
  const recoveryAmount = chargeJournalRecoveryAmount(journal)
  if (recoveryAmount === undefined) return qualifiedUsePayoutFailure()
  const accrual = payoutAccrualFromChargeAmounts({
    transactionRef: transaction.transactionRef, businessId: journal.businessId,
    chargeAmount: journal.chargeAmount, providerAmount: journal.providerAmount,
    rakeAmount: journal.rakeAmount, recoveryAmount,
    accountCurrency: provider.currency, accountExponent: provider.exponent,
  })
  if (accrual === undefined) return qualifiedUsePayoutFailure()
  const amounts = {
    businessId: accrual.businessId, currency: accrual.currency,
    exponent: accrual.exponent, grossAccrual: accrual.grossAccrual,
    rake: accrual.rake, providerNet: accrual.providerNet,
    sourceDigest: journal.selected.charge.sourceDigest,
  }
  if (decision.kind === 'refunded_before_delivery')
    return { kind: 'excluded', reason: 'refunded_before_delivery', amounts }
  return { kind: 'eligible', amounts }
}

export async function readQualifiedUsePayoutAmounts(
  ctx: Pick<MutationCtx, 'db'>,
  receipt: QualifiedUseReceipt,
  eligibilityPrincipalId: string,
  allowReversedFreeTier = false,
): Promise<QualifiedUsePayoutResolution> {
  if (!validReceiptInput(receipt, eligibilityPrincipalId))
    return qualifiedUsePayoutFailure()
  const [transactionRef, usageRef] = requiredJournalRefs(receipt)
  const [transaction, usage, entries] = await Promise.all([
    ctx.db.query('moneyTransactions').withIndex(
      'by_transactionRef', (query) => query.eq('transactionRef', transactionRef),
    ).unique(),
    ctx.db.query('moneyUsageEvents').withIndex(
      'by_usageRef', (query) => query.eq('usageRef', usageRef),
    ).unique(),
    ctx.db.query('moneyLedgerEntries').withIndex(
      'by_transactionRef', (query) => query.eq('transactionRef', transactionRef),
    ).take(10),
  ])
  if (transaction === null || usage === null) return qualifiedUsePayoutFailure()
  if (![
    transaction.principalId === eligibilityPrincipalId,
    usage.principalId === eligibilityPrincipalId,
    transaction.budgetEnvironment === receipt.environment,
    receipt.environment === 'production',
  ].every(Boolean)) return qualifiedUsePayoutFailure()
  const freeTier = [
    transaction.amountUnits === '0', usage.chargeState === 'free_tier',
  ].some(Boolean)
  if (freeTier) {
    if (!isCanonicalFreeTierCharge(
      receipt, eligibilityPrincipalId, transaction, usage, entries,
      allowReversedFreeTier,
    )) return qualifiedUsePayoutFailure()
    return { kind: 'excluded', reason: 'free_tier' }
  }
  return await readPaidPayoutAmounts(ctx, receipt, transaction, usage, entries)
}

export function allocationAmountsFromRow(
  row: Doc<'moneyPayoutAllocations'>,
): Readonly<{
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
}> | undefined {
  const grossAccrual = amountFromParts(
    row.currency, row.grossAccrualUnits, row.exponent,
  )
  const rake = amountFromParts(row.currency, row.rakeUnits, row.exponent)
  const providerNet = amountFromParts(
    row.currency, row.providerNetUnits, row.exponent,
  )
  const expectedGross = rake === undefined || providerNet === undefined
    ? undefined : addExactAmounts(providerNet, rake)
  if ([grossAccrual, rake, providerNet, expectedGross]
    .some((amount) => amount === undefined)) return undefined
  if (compareExactAmounts(expectedGross as ExactAmount, grossAccrual as ExactAmount) !== 0)
    return undefined
  return {
    grossAccrual: grossAccrual as ExactAmount,
    rake: rake as ExactAmount,
    providerNet: providerNet as ExactAmount,
  }
}
