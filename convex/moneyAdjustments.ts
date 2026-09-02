import { v, type Infer } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { internalMutation } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../src/modules/common/stable-hash'
import {
  AUD_EXPONENT,
  applyJournalTransaction,
  prepareBalancedJournalTransaction,
  projectionChecksum,
  type MoneyBalanceProjection,
  type MoneyJournalAccount,
} from '../src/modules/money/public'

const adjustmentArgsValue = v.object({
  adjustmentRef: v.string(),
  accountRef: v.string(),
  direction: v.union(v.literal('credit'), v.literal('debit')),
  amountUnits: v.string(),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
  policyRefs: v.array(v.string()),
  policyDigest: v.string(),
  reversalOf: v.optional(v.string()),
  occurredAt: v.number(),
})
type AdjustmentArgs = Infer<typeof adjustmentArgsValue>

const adjustmentResult = v.union(
  v.object({ kind: v.literal('posted'), transactionRef: v.string(), documentRef: v.string() }),
  v.object({ kind: v.literal('replayed'), transactionRef: v.string(), documentRef: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.string(), caseRef: v.optional(v.string()) }),
)

const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u
const POSITIVE_UNITS = /^[1-9]\d{0,29}$/u
const SHA256 = /^sha256:[a-f0-9]{64}$/u

function projection(row: Doc<'moneyBalanceProjections'>): MoneyBalanceProjection {
  return {
    ledgerAccountRef: row.ledgerAccountRef,
    accountRef: row.accountRef,
    asset: row.asset,
    exponent: row.exponent,
    balanceUnits: BigInt(row.balanceUnits),
    version: row.version,
    ...(row.lastTransactionRef === undefined ? {} : { lastTransactionRef: row.lastTransactionRef }),
  }
}

function valid(args: AdjustmentArgs): boolean {
  return REF.test(args.adjustmentRef)
    && REF.test(args.accountRef)
    && POSITIVE_UNITS.test(args.amountUnits)
    && REF.test(args.reasonCode)
    && SHA256.test(args.policyDigest)
    && Number.isSafeInteger(args.occurredAt)
    && args.occurredAt >= 0
    && args.evidenceRefs.length > 0
    && args.evidenceRefs.length <= 32
    && args.evidenceRefs.every((ref) => REF.test(ref))
    && args.policyRefs.length > 0
    && args.policyRefs.length <= 8
    && args.policyRefs.every((ref) => REF.test(ref))
    && (args.reversalOf === undefined || REF.test(args.reversalOf))
}

async function openProjectionCase(
  ctx: MutationCtx,
  args: AdjustmentArgs,
  customerAccount: Doc<'moneyLedgerAccounts'>,
  customerBalance: Doc<'moneyBalanceProjections'>,
): Promise<string> {
  const caseRef = `reconciliation:${canonicalDigest({
    format: 'ae.money-reconciliation-case:v1',
    accountRef: args.accountRef,
    adjustmentRef: args.adjustmentRef,
    kind: 'projection_mismatch',
  }).slice('sha256:'.length)}`
  const existing = await ctx.db.query('moneyReconciliationCases')
    .withIndex('by_caseRef', (query) => query.eq('caseRef', caseRef))
    .unique()
  if (existing === null) {
    await ctx.db.insert('moneyReconciliationCases', {
      caseRef,
      accountRef: args.accountRef,
      kind: 'projection_mismatch',
      status: 'open',
      ownerPrincipalRef: 'system:money-reconciliation',
      reasonCode: 'projection_checksum_mismatch',
      evidenceRefs: [...args.evidenceRefs],
      createdAt: args.occurredAt,
      updatedAt: args.occurredAt,
    })
  }
  if (customerAccount.state !== 'locked') {
    await ctx.db.patch(customerAccount._id, {
      state: 'locked',
      version: customerAccount.version + 1,
      updatedAt: args.occurredAt,
    })
  }
  if (customerBalance.state !== 'locked') {
    await ctx.db.patch(customerBalance._id, { state: 'locked', updatedAt: args.occurredAt })
  }
  return caseRef
}

async function recordAdjustmentHandler(ctx: MutationCtx, args: AdjustmentArgs) {
  if (!valid(args)) return { kind: 'refused' as const, code: 'adjustment_invalid' }
  const transactionRef = `journal:funding-adjustment:${args.adjustmentRef}`
  const documentRef = `money-document:adjustment:${args.adjustmentRef}`
  const prior = await ctx.db.query('moneyLedgerTransactions')
    .withIndex('by_transactionRef', (query) => query.eq('transactionRef', transactionRef))
    .unique()
  if (prior !== null) {
    return prior.accountRef === args.accountRef
      && prior.inputDigest === args.policyDigest
      && prior.debitUnits === args.amountUnits
      && prior.reversalOf === args.reversalOf
      ? { kind: 'replayed' as const, transactionRef, documentRef }
      : { kind: 'refused' as const, code: 'adjustment_ref_conflict' }
  }

  const customerRef = `ledger:aud:customer-prepayment:${args.accountRef}`
  const controlRef = `ledger:aud:adjustment-control:${args.accountRef}:${args.direction}`
  const [customerAccount, customerBalance, controlAccount, controlBalance] = await Promise.all([
    ctx.db.query('moneyLedgerAccounts').withIndex('by_ledgerAccountRef', (query) => query.eq('ledgerAccountRef', customerRef)).unique(),
    ctx.db.query('moneyBalanceProjections').withIndex('by_ledgerAccountRef', (query) => query.eq('ledgerAccountRef', customerRef)).unique(),
    ctx.db.query('moneyLedgerAccounts').withIndex('by_ledgerAccountRef', (query) => query.eq('ledgerAccountRef', controlRef)).unique(),
    ctx.db.query('moneyBalanceProjections').withIndex('by_ledgerAccountRef', (query) => query.eq('ledgerAccountRef', controlRef)).unique(),
  ])
  if (customerAccount === null || customerBalance === null || customerAccount.state !== 'active' || customerBalance.state !== 'active') {
    return { kind: 'refused' as const, code: 'account_balance_unavailable' }
  }
  if (customerBalance.checksum !== projectionChecksum([projection(customerBalance)])) {
    const caseRef = await openProjectionCase(ctx, args, customerAccount, customerBalance)
    return { kind: 'refused' as const, code: 'journal_reconciliation_required', caseRef }
  }
  const amount = BigInt(args.amountUnits)
  if (args.direction === 'debit' && BigInt(customerBalance.balanceUnits) < amount) {
    return { kind: 'refused' as const, code: 'adjustment_insufficient_balance' }
  }
  const customerDefinition = {
    ledgerAccountRef: customerRef,
    accountRef: args.accountRef,
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'customer_prepayment_liability',
    normalBalance: 'credit',
  } as const satisfies MoneyJournalAccount
  const controlSide = args.direction === 'credit' ? 'debit' : 'credit'
  const controlDefinition = {
    ledgerAccountRef: controlRef,
    accountRef: 'platform',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'adjustment_control',
    normalBalance: controlSide,
  } as const satisfies MoneyJournalAccount
  if (controlAccount !== null
    && (controlAccount.accountKind !== controlDefinition.accountKind
      || controlAccount.normalBalance !== controlDefinition.normalBalance)) {
    return { kind: 'refused' as const, code: 'adjustment_account_conflict' }
  }
  const prepared = prepareBalancedJournalTransaction({
    transactionRef,
    idempotencyKey: `funding-adjustment:${args.adjustmentRef}`,
    accountRef: args.accountRef,
    kind: 'funding_adjustment',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    postings: args.direction === 'credit'
      ? [
          { postingRef: `${transactionRef}:control`, ledgerAccountRef: controlRef, side: 'debit', amountUnits: amount },
          { postingRef: `${transactionRef}:customer`, ledgerAccountRef: customerRef, side: 'credit', amountUnits: amount },
        ]
      : [
          { postingRef: `${transactionRef}:customer`, ledgerAccountRef: customerRef, side: 'debit', amountUnits: amount },
          { postingRef: `${transactionRef}:control`, ledgerAccountRef: controlRef, side: 'credit', amountUnits: amount },
        ],
    evidenceRefs: args.evidenceRefs,
    occurredAt: args.occurredAt,
  }, [customerDefinition, controlDefinition])
  if (prepared.kind === 'refused') return { kind: 'refused' as const, code: prepared.code }
  const next = applyJournalTransaction(
    [projection(customerBalance), ...(controlBalance === null ? [] : [projection(controlBalance)])],
    [customerDefinition, controlDefinition],
    prepared.transaction,
  )
  if (controlAccount === null) {
    await ctx.db.insert('moneyLedgerAccounts', {
      ...controlDefinition,
      state: 'active',
      version: 1,
      createdAt: args.occurredAt,
      updatedAt: args.occurredAt,
    })
  }
  await ctx.db.insert('moneyLedgerTransactions', {
    transactionRef,
    accountRef: args.accountRef,
    kind: 'funding_adjustment',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    idempotencyKey: prepared.transaction.idempotencyKey,
    inputDigest: args.policyDigest,
    journalDigest: prepared.transaction.journalDigest,
    debitUnits: args.amountUnits,
    creditUnits: args.amountUnits,
    state: 'posted',
    evidenceRefs: [...args.evidenceRefs],
    ...(args.reversalOf === undefined ? {} : { reversalOf: args.reversalOf }),
    occurredAt: args.occurredAt,
    recordedAt: args.occurredAt,
  })
  for (const posting of prepared.transaction.postings) {
    await ctx.db.insert('moneyLedgerPostings', {
      postingRef: posting.postingRef,
      transactionRef,
      position: posting.position,
      ledgerAccountRef: posting.ledgerAccountRef,
      side: posting.side,
      amountUnits: posting.amountUnits.toString(),
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      createdAt: args.occurredAt,
    })
  }
  for (const value of next) {
    const row = value.ledgerAccountRef === customerRef ? customerBalance : controlBalance
    const fields = {
      accountRef: value.accountRef,
      asset: 'AUD' as const,
      exponent: AUD_EXPONENT,
      balanceUnits: value.balanceUnits.toString(),
      version: value.version,
      checksum: projectionChecksum([value]),
      state: 'active' as const,
      lastTransactionRef: transactionRef,
      updatedAt: args.occurredAt,
    }
    if (row === null) await ctx.db.insert('moneyBalanceProjections', { ledgerAccountRef: value.ledgerAccountRef, ...fields })
    else await ctx.db.patch(row._id, fields)
  }

  const renderInput = {
    format: 'ae.money-document-render-input:v1',
    documentRef,
    accountRef: args.accountRef,
    kind: 'adjustment',
    direction: args.direction,
    currency: 'AUD',
    exponent: AUD_EXPONENT,
    amountUnits: args.amountUnits,
    reasonCode: args.reasonCode,
    transactionRef,
    ...(args.reversalOf === undefined ? {} : { reversalOf: args.reversalOf }),
    policyRefs: args.policyRefs,
    policyDigest: args.policyDigest,
  } as const satisfies StableHashValue
  await ctx.db.insert('moneyDocuments', {
    documentRef,
    accountRef: args.accountRef,
    kind: 'adjustment',
    sourceTransactionRefs: [transactionRef],
    amountUnits: args.amountUnits,
    residualUnits: '0',
    policyRefs: [...args.policyRefs],
    policyDigest: args.policyDigest,
    templateVersion: 'ae.money-document:text:v1',
    renderInputJson: stableStringify(renderInput),
    renderInputDigest: canonicalDigest(renderInput),
    createdAt: args.occurredAt,
  })
  return { kind: 'posted' as const, transactionRef, documentRef }
}

export const record = internalMutation({
  args: adjustmentArgsValue.fields,
  returns: adjustmentResult,
  handler: recordAdjustmentHandler,
})
