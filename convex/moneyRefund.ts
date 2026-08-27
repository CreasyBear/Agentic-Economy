import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { principalAllowed } from './moneyBillingAuthorization'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { StableHashValue } from '../src/modules/common/stable-hash'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  addExactAmounts,
  amountFromParts,
  appendRefundReversal,
  compareExactAmounts,
  sameEvidenceRefs,
  subtractExactAmounts,
  qualifiedUseMaterialDigest,
  qualifiedUseRef,
  validateChargeAccounts,
  type MoneyLedgerEntry,
  type PayoutAccrualAmounts,
} from '../src/modules/money/public'
import {
  applyPreparedCredentialBudgetTransition,
  prepareCredentialBudgetTransition,
} from './moneyBudgetPersist'
import { accountFromRow } from './moneyCanonicalAccounts'
import {
  chargeJournalRecoveryAmount,
  domainMoneyEntries,
  domainMoneyTransaction,
  domainMoneyUsage,
  loadSealedChargeJournal,
  readPayoutAccrualAmounts,
} from './moneyChargeJournal'
import { identifier } from './moneyLedgerValues'
import { payoutFromRow } from './moneyPayoutTransferShared'
import {
  allocationAmountsFromRow,
  dailyPayoutIdentity,
  qualifiedUseAllocationRef,
  type DailyPayoutIdentity,
} from './lib/qualifiedUsePayout'
import { reverseBrokeredDisputeLoss } from './moneyBrokeredDisputeLoss'

type PayoutAllocationRefundLink = Readonly<{
  payoutRef: string
  allocationRef: string
  allocationCorrectionUnits: string
}>
type PreparedPayoutAccrualReversalForRefund =
  | Readonly<{ kind: 'no_op'; allocation?: PayoutAllocationRefundLink }>
  | Readonly<{
      kind: 'patch'
      row: Doc<'moneyPayouts'>
      allocation: PayoutAllocationRefundLink
      patch: Readonly<{
        grossAccrualUnits: string
        rakeUnits: string
        providerNetUnits: string
        updatedAt: number
      }>
    }>

export type RefundResult =
  | Readonly<{ kind: 'accepted'; transactionRef: string; currency: string }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'ledger_idempotency_conflict'
        | 'charge_reconciliation_required'
        | 'billing_identity_mismatch'
      retryable: false
    }>

export type AppendRefundInput = Readonly<{
  principalId: string
  originalTransactionRef: string
  transactionRef: string
  idempotencyKey: string
  inputDigest: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  observedAt: number
  externalRef?: string
}>

export type ReverseDisputedQualifiedUseArgs = Readonly<{
  qualifiedUseRef: string
  disputeRef: string
  sourceDigest: string
  evidenceRefs: string[]
  observedAt: number
}>

export const reverseDisputedQualifiedUseArgs = {
  qualifiedUseRef: identifier,
  disputeRef: identifier,
  sourceDigest: identifier,
  evidenceRefs: v.array(identifier),
  observedAt: v.number(),
}
export const disputeReversalResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    transactionRef: identifier,
    currency: identifier,
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('billing_identity_mismatch'),
      v.literal('ledger_idempotency_conflict'),
      v.literal('charge_reconciliation_required'),
    ),
    retryable: v.literal(false),
  }),
)
export const appendRefundArgs = {
  principalId: identifier,
  originalTransactionRef: identifier,
  transactionRef: identifier,
  idempotencyKey: identifier,
  inputDigest: identifier,
  sourceDigest: identifier,
  evidenceRefs: v.array(v.string()),
  observedAt: v.number(),
}

async function preparePayoutAccrualReversalForRefund(
  ctx: Pick<MutationCtx, 'db'>,
  accrual: PayoutAccrualAmounts,
  settledAt: number,
): Promise<PreparedPayoutAccrualReversalForRefund | undefined> {
  const allocation = await ctx.db
    .query('moneyPayoutAllocations')
    .withIndex('by_transactionRef', (query) =>
      query.eq('transactionRef', accrual.transactionRef),
    )
    .unique()
  if (allocation === null) return { kind: 'no_op' }
  const amounts = allocationAmountsFromRow(allocation)
  let period: DailyPayoutIdentity
  try {
    period = dailyPayoutIdentity(
      allocation.businessId,
      allocation.currency,
      allocation.qualifiedAt,
    )
  } catch {
    return undefined
  }
  if (
    amounts === undefined ||
    allocation.allocationRef.trim().length === 0 ||
    allocation.qualifiedUseRef.trim().length === 0 ||
    allocation.allocationRef !== qualifiedUseAllocationRef({
      qualifiedUseRef: allocation.qualifiedUseRef,
      materialDigest: allocation.materialDigest,
    }) ||
    allocation.transactionRef !== accrual.transactionRef ||
    allocation.businessId !== accrual.businessId ||
    allocation.currency !== accrual.currency ||
    allocation.exponent !== accrual.exponent ||
    allocation.sourceDigest.trim().length === 0 ||
    allocation.materialDigest.trim().length === 0 ||
    allocation.payoutRef !== period.payoutRef ||
    compareExactAmounts(amounts.grossAccrual, accrual.grossAccrual) !== 0 ||
    compareExactAmounts(amounts.rake, accrual.rake) !== 0 ||
    compareExactAmounts(amounts.providerNet, accrual.providerNet) !== 0
  )
    return undefined
  const allocationLink = {
    payoutRef: allocation.payoutRef,
    allocationRef: allocation.allocationRef,
    allocationCorrectionUnits: allocation.providerNetUnits,
  } as const
  const row = await ctx.db
    .query('moneyPayouts')
    .withIndex('by_payoutRef', (query) =>
      query.eq('payoutRef', allocation.payoutRef),
    )
    .unique()
  if (row === null) return undefined
  const current = payoutFromRow(row)
  if (
    current === undefined ||
    row.businessId !== accrual.businessId ||
    row.currency !== accrual.currency ||
    row.exponent !== accrual.exponent ||
    current.payoutRef !== allocation.payoutRef ||
    current.periodStart !== period.periodStart ||
    current.periodEnd !== period.periodEnd
  )
    return undefined
  if (current.state === 'transfer_pending' || current.state === 'outcome_unknown')
    return undefined
  if (current.state === 'paid' || current.state === 'reversed')
    return { kind: 'no_op', allocation: allocationLink }
  if (
    current.state !== 'review' &&
    current.state !== 'held_kyc' &&
    current.state !== 'held_threshold' &&
    current.state !== 'failed'
  )
    return undefined
  const nextGross = subtractExactAmounts(
    current.grossAccrual,
    amounts.grossAccrual,
  )
  const nextRake = subtractExactAmounts(current.rake, amounts.rake)
  const nextProviderNet = subtractExactAmounts(
    current.providerNet,
    amounts.providerNet,
  )
  if (
    nextGross === undefined ||
    nextRake === undefined ||
    nextProviderNet === undefined
  )
    return undefined
  return {
    kind: 'patch',
    row,
    allocation: allocationLink,
    patch: {
      grossAccrualUnits: nextGross.units,
      rakeUnits: nextRake.units,
      providerNetUnits: nextProviderNet.units,
      updatedAt: settledAt,
    },
  }
}

async function applyPayoutAccrualReversalForRefund(
  ctx: Pick<MutationCtx, 'db'>,
  prepared: PreparedPayoutAccrualReversalForRefund,
): Promise<void> {
  if (prepared.kind === 'no_op') return
  await ctx.db.patch(prepared.row._id, prepared.patch)
}

function refundLedgerEntryInsert(
  entry: MoneyLedgerEntry,
  payoutAllocation: PayoutAllocationRefundLink | undefined,
  providerAccountRef: string,
) {
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
    ...(entry.accountRef === providerAccountRef &&
    entry.entryType === 'refund' &&
    entry.direction === 'debit' &&
    payoutAllocation !== undefined
      ? payoutAllocation
      : {}),
  }
}

function refundRefusal(
  code:
    | 'ledger_idempotency_conflict'
    | 'charge_reconciliation_required'
    | 'billing_identity_mismatch',
): Extract<RefundResult, { kind: 'refused' }> {
  return { kind: 'refused', code, retryable: false }
}

export async function appendRefundBody(
  ctx: MutationCtx,
  args: AppendRefundInput,
  suppliedOriginal?: Doc<'moneyTransactions'>,
): Promise<RefundResult> {
  const original =
    suppliedOriginal ??
    (await ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', args.originalTransactionRef),
      )
      .unique())
  if (
    original === null ||
    original.kind !== 'charge' ||
    original.principalId !== args.principalId ||
    args.evidenceRefs.length === 0
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const credentialId = original.credentialId
  const [prior, originalEntries, usageRows] = await Promise.all([
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_idempotencyKey', (q) =>
        q.eq('idempotencyKey', args.idempotencyKey),
      )
      .unique(),
    ctx.db
      .query('moneyLedgerEntries')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', original.transactionRef),
      )
      .take(5),
    credentialId === undefined
      ? Promise.resolve([] as Doc<'moneyUsageEvents'>[])
      : ctx.db
          .query('moneyUsageEvents')
          .withIndex(
            'by_principalId_and_credentialId_and_currency_and_observedAt',
            (q) =>
              q
                .eq('principalId', original.principalId)
                .eq('credentialId', credentialId)
                .eq('currency', original.currency)
                .eq('observedAt', original.createdAt),
          )
          .take(2),
  ])
  const usage = usageRows.length === 1 ? usageRows[0] : undefined
  const journal = loadSealedChargeJournal(original, usage, originalEntries)
  const recoveryAmount =
    journal === undefined
      ? undefined
      : chargeJournalRecoveryAmount(journal)
  if (journal === undefined || recoveryAmount === undefined)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const charge = journal.selected.charge
  const provider = journal.selected.provider
  const rake = journal.selected.rake
  const [operatorAccount, providerAccount, rakeAccount] = await Promise.all([
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (q) =>
        q.eq('accountRef', charge.accountRef),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (q) =>
        q.eq('accountRef', provider.accountRef),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (q) =>
        q.eq('accountRef', rake.accountRef),
      )
      .unique(),
  ])
  const operatorDomain =
    operatorAccount === null ? undefined : accountFromRow(operatorAccount)
  const providerDomain =
    providerAccount === null ? undefined : accountFromRow(providerAccount)
  const rakeDomain =
    rakeAccount === null ? undefined : accountFromRow(rakeAccount)
  if (
    operatorAccount === null ||
    providerAccount === null ||
    rakeAccount === null ||
    operatorDomain === undefined ||
    providerDomain === undefined ||
    rakeDomain === undefined
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const accountRefusal =
    operatorAccount.accountRef !== accountRefForOwner(journal.accountId, original.currency) ||
    operatorAccount.accountKind !== 'operator_credit' ||
    operatorAccount.accountId !== journal.accountId ||
    operatorAccount.businessId !== undefined ||
    operatorAccount.currency !== original.currency ||
    operatorAccount.exponent !== original.exponent ||
    providerAccount.accountRef !== accountRefForProvider(journal.businessId, original.currency) ||
    providerAccount.accountKind !== 'provider_earnings' ||
    providerAccount.businessId !== journal.businessId ||
    providerAccount.accountId !== undefined ||
    providerAccount.currency !== original.currency ||
    providerAccount.exponent !== original.exponent ||
    rakeAccount.accountRef !== accountRefForRake(original.currency) ||
    rakeAccount.accountKind !== 'ae_rake' ||
    rakeAccount.accountId !== undefined ||
    rakeAccount.businessId !== undefined ||
    rakeAccount.currency !== original.currency ||
    rakeAccount.exponent !== original.exponent ||
    new Set([charge.accountRef, provider.accountRef, rake.accountRef]).size !== 3 ||
    validateChargeAccounts({
      operator: operatorDomain,
      provider: providerDomain,
      rake: rakeDomain,
      operatorAccountRef: accountRefForOwner(journal.accountId, original.currency),
      providerAccountRef: accountRefForProvider(journal.businessId, original.currency),
      rakeAccountRef: accountRefForRake(original.currency),
      accountId: journal.accountId,
      businessId: journal.businessId,
      currency: original.currency,
    }) !== undefined
  if (accountRefusal)
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  if (prior !== null) {
    if (
      prior.inputDigest !== args.inputDigest ||
      prior.kind !== 'refund' ||
      prior.reversalOf !== original.transactionRef ||
      prior.principalId !== original.principalId ||
      prior.transactionRef !== args.transactionRef ||
      prior.externalRef !== args.externalRef ||
      prior.state !== 'reversed' ||
      prior.currency !== original.currency ||
      prior.exponent !== original.exponent
    )
      return {
        kind: 'refused' as const,
        code: 'ledger_idempotency_conflict' as const,
        retryable: false,
      }
    const [replayEntries, currentReversals, allocation] = await Promise.all([
      ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', prior.transactionRef),
        )
        .take(4),
      ctx.db
        .query('moneyTransactions')
        .withIndex('by_reversalOf', (q) =>
          q.eq('reversalOf', original.transactionRef),
        )
        .take(2),
      ctx.db
        .query('moneyPayoutAllocations')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', original.transactionRef),
        )
        .unique(),
    ])
    const replayAllocationLink =
      allocation === null
        ? undefined
        : allocation.allocationRef.trim().length > 0 &&
            allocation.qualifiedUseRef.trim().length > 0 &&
            allocation.payoutRef.trim().length > 0 &&
            allocation.allocationRef ===
              qualifiedUseAllocationRef({
                qualifiedUseRef: allocation.qualifiedUseRef,
                materialDigest: allocation.materialDigest,
              })
          ? {
              payoutRef: allocation.payoutRef,
              allocationRef: allocation.allocationRef,
              allocationCorrectionUnits: allocation.providerNetUnits,
            }
          : null
    const operatorRefund = replayEntries.find(
      (entry) => entry.entryRef === `${prior.transactionRef}:operator`,
    )
    const providerRefund = replayEntries.find(
      (entry) => entry.entryRef === `${prior.transactionRef}:provider`,
    )
    const rakeRefund = replayEntries.find(
      (entry) => entry.entryRef === `${prior.transactionRef}:rake`,
    )
    if (
      original.state !== 'reversed' ||
      currentReversals.length !== 1 ||
      currentReversals[0]?._id !== prior._id ||
      currentReversals[0]?.transactionRef !== prior.transactionRef ||
      replayEntries.length !== 3 ||
      operatorRefund === undefined ||
      providerRefund === undefined ||
      rakeRefund === undefined ||
      replayEntries.some(
        (entry) =>
          entry !== operatorRefund &&
          entry !== providerRefund &&
          entry !== rakeRefund,
      ) ||
      operatorRefund.accountRef !== charge.accountRef ||
      operatorRefund.entryType !== 'refund' ||
      operatorRefund.direction !== 'credit' ||
      operatorRefund.entryRef !== `${prior.transactionRef}:operator` ||
      operatorRefund.amountUnits !== journal.chargeAmount.units ||
      operatorRefund.currency !== journal.chargeAmount.currency ||
      operatorRefund.exponent !== journal.chargeAmount.exponent ||
      operatorRefund.principalId !== original.principalId ||
      operatorRefund.businessId !== undefined ||
      operatorRefund.invocationRef !== undefined ||
      operatorRefund.attemptRef !== undefined ||
      operatorRefund.payoutRef !== undefined ||
      operatorRefund.allocationRef !== undefined ||
      operatorRefund.allocationCorrectionUnits !== undefined ||
      providerRefund.accountRef !== provider.accountRef ||
      providerRefund.entryType !== 'refund' ||
      providerRefund.direction !== 'debit' ||
      providerRefund.entryRef !== `${prior.transactionRef}:provider` ||
      providerRefund.amountUnits !== journal.providerAmount.units ||
      providerRefund.currency !== journal.providerAmount.currency ||
      providerRefund.exponent !== journal.providerAmount.exponent ||
      providerRefund.principalId !== undefined ||
      providerRefund.businessId !== journal.businessId ||
      providerRefund.invocationRef !== undefined ||
      providerRefund.attemptRef !== undefined ||
      replayAllocationLink === null ||
      providerRefund.payoutRef !== replayAllocationLink?.payoutRef ||
      providerRefund.allocationRef !== replayAllocationLink?.allocationRef ||
      providerRefund.allocationCorrectionUnits !==
        replayAllocationLink?.allocationCorrectionUnits ||
      rakeRefund.accountRef !== rake.accountRef ||
      rakeRefund.entryType !== 'refund' ||
      rakeRefund.direction !== 'debit' ||
      rakeRefund.entryRef !== `${prior.transactionRef}:rake` ||
      rakeRefund.amountUnits !== journal.rakeAmount.units ||
      rakeRefund.currency !== journal.rakeAmount.currency ||
      rakeRefund.exponent !== journal.rakeAmount.exponent ||
      rakeRefund.principalId !== undefined ||
      rakeRefund.businessId !== journal.businessId ||
      rakeRefund.invocationRef !== undefined ||
      rakeRefund.attemptRef !== undefined ||
      rakeRefund.payoutRef !== undefined ||
      rakeRefund.allocationRef !== undefined ||
      rakeRefund.allocationCorrectionUnits !== undefined ||
      [operatorRefund, providerRefund, rakeRefund].some(
        (entry) =>
          entry.transactionRef !== prior.transactionRef ||
          entry.idempotencyKey !== prior.idempotencyKey ||
          entry.sourceDigest !== args.sourceDigest ||
          !sameEvidenceRefs(entry.evidenceRefs, args.evidenceRefs) ||
          entry.reversalOf !== original.transactionRef ||
          entry.createdAt !== prior.createdAt,
      )
    )
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        retryable: false as const,
      }
    return {
      kind: 'accepted' as const,
      transactionRef: prior.transactionRef,
      currency: original.currency,
    }
  }
  const [pendingPayouts, unknownPayouts] = await Promise.all([
    ctx.db
      .query('moneyPayouts')
      .withIndex('by_businessId_and_currency_and_state', (q) =>
        q
          .eq('businessId', journal.businessId)
          .eq('currency', original.currency)
          .eq('state', 'transfer_pending'),
      )
      .take(2),
    ctx.db
      .query('moneyPayouts')
      .withIndex('by_businessId_and_currency_and_state', (q) =>
        q
          .eq('businessId', journal.businessId)
          .eq('currency', original.currency)
          .eq('state', 'outcome_unknown'),
      )
      .take(2),
  ])
  if (
    [...pendingPayouts, ...unknownPayouts].some(
      (payout) => payout.providerAccountRef === provider.accountRef,
    )
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  if (original.state !== 'applied' && original.state !== 'outcome_unknown')
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const existingReversal = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_reversalOf', (q) =>
      q.eq('reversalOf', args.originalTransactionRef),
    )
    .take(1)
  if (existingReversal.length > 0)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const payoutAccrual =
    original.settledAt === undefined
      ? undefined
      : await readPayoutAccrualAmounts(ctx, original)
  const preparedPayoutReversal =
    payoutAccrual === undefined || original.settledAt === undefined
      ? undefined
      : await preparePayoutAccrualReversalForRefund(
          ctx,
          payoutAccrual,
          original.settledAt,
        )
  if (original.settledAt !== undefined && preparedPayoutReversal === undefined)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const domainOriginal = domainMoneyTransaction(original)
  const domainEntries = domainMoneyEntries(originalEntries)
  const domainUsage = usage === undefined ? undefined : domainMoneyUsage(usage)
  if (domainEntries === undefined || domainUsage === undefined)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const reversal = appendRefundReversal({
    state: {
      accounts: new Map([
        [operatorDomain.accountRef, operatorDomain],
        [providerDomain.accountRef, providerDomain],
        [rakeDomain.accountRef, rakeDomain],
      ]),
      entries: domainEntries,
      transactions: [domainOriginal],
      usageEvents: [domainUsage],
      usageSummaries: new Map(),
    },
    transaction: {
      transactionRef: args.transactionRef,
      kind: 'refund',
      idempotencyKey: args.idempotencyKey,
      inputDigest: args.inputDigest,
      principalId: args.principalId,
      currency: original.currency,
      expectedAccountVersion: operatorDomain.version,
      now: args.observedAt,
      ...(args.externalRef === undefined ? {} : { externalRef: args.externalRef }),
    },
    originalTransactionRef: original.transactionRef,
    principalId: args.principalId,
    sourceDigest: args.sourceDigest,
    evidenceRefs: args.evidenceRefs,
    observedAt: args.observedAt,
  })
  if (reversal.result.kind === 'refused') {
    const code = reversal.result.code
    if (
      code === 'ledger_idempotency_conflict'
      || code === 'charge_reconciliation_required'
      || code === 'billing_identity_mismatch'
    )
      return refundRefusal(code)
    return refundRefusal('charge_reconciliation_required')
  }
  const nextOperator = reversal.state.accounts.get(operatorAccount.accountRef)
  const nextProvider = reversal.state.accounts.get(providerAccount.accountRef)
  const nextRake = reversal.state.accounts.get(rakeAccount.accountRef)
  const refundTransaction = reversal.state.transactions.find(
    (transaction) => transaction.transactionRef === args.transactionRef,
  )
  const refundEntries = reversal.state.entries.filter(
    (entry) => entry.transactionRef === args.transactionRef,
  )
  if (
    nextOperator === undefined
    || nextProvider === undefined
    || nextRake === undefined
    || refundTransaction === undefined
    || refundEntries.length !== 3
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const preparedBudget = await prepareCredentialBudgetTransition(
    ctx,
    original,
    'not_released',
    args.observedAt,
  )
  if (preparedBudget === undefined)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  await applyPreparedCredentialBudgetTransition(ctx, preparedBudget)
  if (preparedPayoutReversal !== undefined)
    await applyPayoutAccrualReversalForRefund(ctx, preparedPayoutReversal)
  const payoutAllocation = preparedPayoutReversal?.allocation
  for (const entry of refundEntries) {
    await ctx.db.insert(
      'moneyLedgerEntries',
      refundLedgerEntryInsert(entry, payoutAllocation, providerAccount.accountRef),
    )
  }
  await ctx.db.patch('moneyAccounts', operatorAccount._id, {
    balanceUnits: nextOperator.balance.units,
    version: nextOperator.version,
    updatedAt: nextOperator.updatedAt,
  })
  await ctx.db.patch('moneyAccounts', providerAccount._id, {
    balanceUnits: nextProvider.balance.units,
    recoveryDueUnits: nextProvider.recoveryDue.units,
    version: nextProvider.version,
    updatedAt: nextProvider.updatedAt,
  })
  await ctx.db.patch('moneyAccounts', rakeAccount._id, {
    balanceUnits: nextRake.balance.units,
    version: nextRake.version,
    updatedAt: nextRake.updatedAt,
  })
  await ctx.db.insert('moneyTransactions', {
    transactionRef: refundTransaction.transactionRef,
    kind: 'refund' as const,
    idempotencyKey: refundTransaction.idempotencyKey,
    inputDigest: args.inputDigest,
    principalId: args.principalId,
    currency: original.currency,
    exponent: original.exponent,
    state: 'reversed' as const,
    expectedAccountVersion: operatorAccount.version,
    reversalOf: args.originalTransactionRef,
    ...(args.externalRef === undefined ? {} : { externalRef: args.externalRef }),
    createdAt: args.observedAt,
    updatedAt: args.observedAt,
  })
  await ctx.db.patch('moneyTransactions', original._id, {
    state: 'reversed',
    updatedAt: args.observedAt,
  })
  return {
    kind: 'accepted' as const,
    transactionRef: args.transactionRef,
    currency: original.currency,
  }
}

export async function reverseDisputedQualifiedUseHandler(
  ctx: MutationCtx,
  args: ReverseDisputedQualifiedUseArgs,
): Promise<RefundResult> {
  if (
    args.disputeRef.trim().length === 0 ||
    args.sourceDigest.trim().length === 0 ||
    args.evidenceRefs.length === 0 ||
    args.evidenceRefs.some((ref) => ref.trim().length === 0)
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false as const,
    }
  const receipt = await ctx.db
    .query('qualifiedUseReceipts')
    .withIndex('by_qualifiedUseRef', (q) => q.eq('qualifiedUseRef', args.qualifiedUseRef))
    .unique()
  if (receipt === null || receipt.environment !== 'production' || receipt.usageRef === undefined || receipt.transactionRef === undefined)
    return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false as const }
  const usageRef = receipt.usageRef
  const transactionRef = receipt.transactionRef
  const receiptIdentity = {
    invocationRef: receipt.invocationRef,
    attemptRef: receipt.attemptRef,
    effectGeneration: receipt.effectGeneration,
  }
  const receiptMaterial = {
    ...receiptIdentity,
    businessId: receipt.businessId,
    operationRef: receipt.operationRef,
    publicationRef: receipt.publicationRef,
    publicationRevision: receipt.publicationRevision,
    contractDigest: receipt.contractDigest,
    bindingDigest: receipt.bindingDigest,
    principalClass: receipt.principalClass,
    requestDigest: receipt.requestDigest,
    responseDigest: receipt.responseDigest,
    evidenceRefs: receipt.evidenceRefs,
  }
  if (qualifiedUseRef(receiptIdentity) !== receipt.qualifiedUseRef || qualifiedUseMaterialDigest(receiptMaterial) !== receipt.materialDigest)
    return { kind: 'refused' as const, code: 'billing_identity_mismatch' as const, retryable: false as const }
  const [usage, original] = await Promise.all([
    ctx.db.query('moneyUsageEvents').withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef)).unique(),
    ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', transactionRef)).unique(),
  ])
  if (
    usage === null ||
    original === null ||
    usage.usageRef !== receipt.usageRef ||
    usage.transactionRef !== receipt.transactionRef ||
    original.credentialId === undefined ||
    original.credentialId !== usage.credentialId ||
    usage.invocationRef !== receipt.invocationRef ||
    usage.attemptRef !== receipt.attemptRef ||
    usage.operationKey !== receipt.operationRef ||
    usage.chargeState !== 'paid' ||
    original.kind !== 'charge' ||
    (original.state !== 'applied' && original.state !== 'reversed') ||
    (original.budgetState !== 'settled' &&
      !(original.state === 'reversed' && original.budgetState === 'released')) ||
    original.settledAt === undefined ||
    original.accountId === undefined ||
    usage.accountId === undefined ||
    original.accountId !== usage.accountId ||
    usage.observedAt !== original.createdAt ||
    original.principalId !== usage.principalId ||
    usage.businessId !== receipt.businessId ||
    original.currency !== usage.currency ||
    original.exponent !== usage.exponent ||
    original.amountUnits !== usage.amountUnits
  )
    return { kind: 'refused' as const, code: 'billing_identity_mismatch' as const, retryable: false as const }
  const entries = await ctx.db
    .query('moneyLedgerEntries')
    .withIndex('by_transactionRef', (q) =>
      q.eq('transactionRef', original.transactionRef),
    )
    .take(5)
  const journal = loadSealedChargeJournal(original, usage, entries)
  const recoveryAmount =
    journal === undefined
      ? undefined
      : chargeJournalRecoveryAmount(journal)
  const charge = journal?.selected.charge
  const provider = journal?.selected.provider
  const rake = journal?.selected.rake
  const chargeAmount = journal?.chargeAmount
  const originalAmount =
    original.amountUnits === undefined
      ? undefined
      : amountFromParts(original.currency, original.amountUnits, original.exponent)
  const providerAmount = journal?.providerAmount
  const rakeAmount = journal?.rakeAmount
  const split =
    providerAmount === undefined || rakeAmount === undefined
      ? undefined
      : addExactAmounts(providerAmount, rakeAmount)
  if (
    journal === undefined ||
    charge === undefined ||
    provider === undefined ||
    rake === undefined ||
    chargeAmount === undefined ||
    originalAmount === undefined ||
    split === undefined ||
    recoveryAmount === undefined ||
    compareExactAmounts(chargeAmount, split) !== 0 ||
    compareExactAmounts(chargeAmount, originalAmount) !== 0 ||
    charge.principalId !== usage.principalId ||
    charge.invocationRef !== receipt.invocationRef ||
    charge.attemptRef !== receipt.attemptRef ||
    provider.businessId !== receipt.businessId ||
    provider.invocationRef !== receipt.invocationRef ||
    provider.attemptRef !== receipt.attemptRef ||
    rake.businessId !== receipt.businessId
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false as const,
    }
  const sortedEvidenceRefs = [...args.evidenceRefs].sort()
  const refundTransactionRef = `qualified-use-dispute-refund:${receipt.qualifiedUseRef}`
  const refundInputDigest = canonicalDigest({
    format: 'qualified-use-dispute-reversal:v1',
    qualifiedUseRef: receipt.qualifiedUseRef,
    materialDigest: receipt.materialDigest,
    disputeRef: args.disputeRef,
    originalTransactionRef: original.transactionRef,
    sourceDigest: args.sourceDigest,
    evidenceRefs: sortedEvidenceRefs,
  } as StableHashValue)
  const brokeredResult = await reverseBrokeredDisputeLoss(ctx, {
    qualifiedUseRef: receipt.qualifiedUseRef,
    disputeRef: args.disputeRef,
    sourceDigest: args.sourceDigest,
    evidenceRefs: sortedEvidenceRefs,
    refundTransactionRef,
    refundInputDigest,
    original,
    journal,
    observedAt: args.observedAt,
  })
  if (brokeredResult !== undefined) return brokeredResult
  return await appendRefundBody(ctx, {
    principalId: original.principalId,
    originalTransactionRef: original.transactionRef,
    transactionRef: refundTransactionRef,
    idempotencyKey: refundTransactionRef,
    inputDigest: refundInputDigest,
    sourceDigest: args.sourceDigest,
    evidenceRefs: sortedEvidenceRefs,
    observedAt: args.observedAt,
    externalRef: args.disputeRef,
  }, original)
}

export async function appendRefundHandler(
  ctx: MutationCtx,
  args: AppendRefundInput,
): Promise<
  | RefundResult
  | Readonly<{
      kind: 'refused'
      code: 'billing_identity_missing'
      retryable: false
    }>
> {
  const identity = await ctx.auth.getUserIdentity()
  if (!principalAllowed(identity, args.principalId))
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
      retryable: false,
    }
  return await appendRefundBody(ctx, args)
}
