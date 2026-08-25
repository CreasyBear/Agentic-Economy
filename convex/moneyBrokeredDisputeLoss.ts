import {
  accountRefForExternalLoss,
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  addExactAmounts,
  amountAtScale,
  amountFromParts,
  compareExactAmounts,
  subtractExactAmounts,
  validateChargeAccounts,
  type ExactAmount,
} from '@/modules/money/public'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  accountFromRow,
  applyPreparedCanonicalMoneyAccount,
  canonicalMoneyAccountPreview,
  prepareCanonicalMoneyAccount,
  type PreparedCanonicalMoneyAccount,
} from './moneyCanonicalAccounts'
import {
  applyPreparedCredentialBudgetTransition,
  prepareCredentialBudgetTransition,
  type PreparedCredentialBudgetTransition,
} from './moneyBudgetPersist'
import type { ValidatedChargeJournal } from './moneyChargeJournal'
import {
  brokeredDisputeIdentity,
  externalPayoutIdentity,
  validateBrokeredDisputeReplay,
  validateExternalPayoutEvidence,
} from './moneyBrokeredDisputeEvidence'

type Input = Readonly<{ qualifiedUseRef: string, disputeRef: string, sourceDigest: string, evidenceRefs: readonly string[], refundTransactionRef: string, refundInputDigest: string, original: Doc<'moneyTransactions'>, journal: ValidatedChargeJournal, observedAt: number }>

type Result = Readonly<{ kind: 'accepted', transactionRef: string, currency: string }> | Readonly<{ kind: 'refused', code: 'ledger_idempotency_conflict' | 'charge_reconciliation_required' | 'billing_identity_mismatch', retryable: false }>

type RefusalCode = Extract<Result, { kind: 'refused' }>['code']

type Prepared = Readonly<{ kind: 'apply', input: Input, operator: Doc<'moneyAccounts'>, rake: Doc<'moneyAccounts'>, lossAccountPrepared: PreparedCanonicalMoneyAccount, budget: PreparedCredentialBudgetTransition, operatorAmount: ExactAmount, rakeAmount: ExactAmount, providerAmount: ExactAmount, nextOperator: ExactAmount, nextRake: ExactAmount, nextLoss: ExactAmount, lossTransactionRef: string, lossInputDigest: string, invocationRef: string, attemptRef: string }>

const refuse = (code: RefusalCode): Result => ({
  kind: 'refused',
  code,
  retryable: false,
})

const amountFields = (amount: ExactAmount) => ({ amountUnits: amount.units, currency: amount.currency, exponent: amount.exponent })
const accountByRef = (ctx: MutationCtx, ref: string) => ctx.db.query('moneyAccounts').withIndex('by_accountRef', (q) => q.eq('accountRef', ref)).unique()
const transactionsByRef = (ctx: MutationCtx, ref: string) => ctx.db.query('moneyTransactions').withIndex('by_transactionRef', (q) => q.eq('transactionRef', ref)).take(2)
const transactionsByKey = (ctx: MutationCtx, key: string) => ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', key)).take(2)
const transactionByKey = (ctx: MutationCtx, key: string) => ctx.db.query('moneyTransactions').withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', key)).unique()
const entriesByRef = (ctx: MutationCtx, ref: string) => ctx.db.query('moneyLedgerEntries').withIndex('by_transactionRef', (q) => q.eq('transactionRef', ref)).take(2)
const reversalsByRef = (ctx: MutationCtx, ref: string) => ctx.db.query('moneyTransactions').withIndex('by_reversalOf', (q) => q.eq('reversalOf', ref)).take(2)

function validLossAccount(row: Doc<'moneyAccounts'>, amount: ExactAmount): boolean {
  const domain = accountFromRow(row)
  return domain !== undefined && row.accountRef === accountRefForExternalLoss(amount.currency) && row.accountKind === 'ae_external_loss' && row.accountId === undefined && row.businessId === undefined && row.currency === amount.currency && row.exponent === amount.exponent && row.heldUnits === '0' && row.recoveryDueUnits === '0' && row.state === 'active'
}

async function prepare(
  ctx: MutationCtx,
  input: Input,
): Promise<Prepared | Result | undefined> {
  const externalRef = input.original.externalRef
  if (externalRef === undefined) return undefined
  if (externalRef.trim().length === 0)
    return refuse('charge_reconciliation_required')
  const invocationRef = input.journal.selected.charge.invocationRef
  const attemptRef = input.journal.selected.charge.attemptRef
  if (invocationRef === undefined || attemptRef === undefined)
    return refuse('charge_reconciliation_required')
  const payoutIdentity = externalPayoutIdentity({
    chargeTransactionRef: input.original.transactionRef,
    externalRef,
  })
  const lossTransactionRef =
    `qualified-use-dispute-loss:${input.qualifiedUseRef}`
  const [operator, provider, rake, payoutRows, payoutIdempotencyRows, payoutEntries, prior, reversals, lossRows, lossEntries] =
    await Promise.all([
      accountByRef(
        ctx,
        accountRefForOwner(input.journal.accountId, input.original.currency),
      ),
      accountByRef(
        ctx,
        accountRefForProvider(input.journal.businessId, input.original.currency),
      ),
      accountByRef(ctx, accountRefForRake(input.original.currency)),
      transactionsByRef(ctx, payoutIdentity.payoutRef),
      transactionsByKey(ctx, payoutIdentity.payoutKey),
      entriesByRef(ctx, payoutIdentity.payoutRef),
      transactionByKey(ctx, input.refundTransactionRef),
      reversalsByRef(ctx, input.original.transactionRef),
      transactionsByRef(ctx, lossTransactionRef),
      entriesByRef(ctx, lossTransactionRef),
    ])
  if (operator === null || provider === null || rake === null)
    return refuse('billing_identity_mismatch')
  const operatorDomain = accountFromRow(operator)
  const providerDomain = accountFromRow(provider)
  const rakeDomain = accountFromRow(rake)
  if (
    operatorDomain === undefined ||
    providerDomain === undefined ||
    rakeDomain === undefined ||
    provider.state !== 'active' ||
    validateChargeAccounts({
      operator: operatorDomain,
      provider: providerDomain,
      rake: rakeDomain,
      operatorAccountRef: accountRefForOwner(
        input.journal.accountId,
        input.original.currency,
      ),
      providerAccountRef: accountRefForProvider(
        input.journal.businessId,
        input.original.currency,
      ),
      rakeAccountRef: accountRefForRake(input.original.currency),
      accountId: input.journal.accountId,
      businessId: input.journal.businessId,
      currency: input.original.currency,
    }) !== undefined
  )
    return refuse('billing_identity_mismatch')
  const providerAmount = amountAtScale(
    input.journal.providerAmount,
    provider.currency,
    provider.exponent,
  )
  const operatorAmount = amountAtScale(
    input.journal.chargeAmount,
    operator.currency,
    operator.exponent,
  )
  const rakeAmount = amountAtScale(
    input.journal.rakeAmount,
    rake.currency,
    rake.exponent,
  )
  const settledAt = input.original.settledAt
  if (
    providerAmount === undefined ||
    operatorAmount === undefined ||
    rakeAmount === undefined ||
    settledAt === undefined ||
    compareExactAmounts(
      addExactAmounts(input.journal.providerAmount, input.journal.rakeAmount),
      input.journal.chargeAmount,
    ) !== 0 ||
    !validateExternalPayoutEvidence({
      identity: payoutIdentity,
      externalRef,
      businessId: input.journal.businessId,
      providerAccountRef: provider.accountRef,
      providerVersion: provider.version,
      providerAmount,
      settledAt,
      payoutCount: payoutRows.length,
      payoutIdempotencyRows,
      payoutRows,
      payoutEntries,
    })
  )
    return refuse('charge_reconciliation_required')
  const disputeIdentity = brokeredDisputeIdentity({
    qualifiedUseRef: input.qualifiedUseRef,
    disputeRef: input.disputeRef,
    originalTransactionRef: input.original.transactionRef,
    externalRef,
    providerAmount,
    sourceDigest: input.sourceDigest,
    evidenceRefs: input.evidenceRefs,
  })
  const lossPrepared = await prepareCanonicalMoneyAccount(ctx, {
    accountKind: 'ae_external_loss',
    currency: providerAmount.currency,
    exponent: providerAmount.exponent,
    now: input.observedAt,
  })
  const lossPreview =
    lossPrepared === undefined
      ? undefined
      : canonicalMoneyAccountPreview(lossPrepared)
  const lossDomain =
    lossPreview === undefined ? undefined : accountFromRow(lossPreview)
  if (
    lossPrepared === undefined ||
    lossPreview === undefined ||
    lossDomain === undefined ||
    !validLossAccount(lossPreview, providerAmount)
  )
    return refuse('charge_reconciliation_required')
  if (prior !== null) {
    const refundRows = await ctx.db
      .query('moneyLedgerEntries')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', input.refundTransactionRef),
      )
      .take(3)
    const exact = validateBrokeredDisputeReplay({
      originalTransactionRef: input.original.transactionRef,
      originalPrincipalId: input.original.principalId,
      originalCurrency: input.original.currency,
      originalExponent: input.original.exponent,
      originalState: input.original.state,
      originalBudgetState: input.original.budgetState,
      businessId: input.journal.businessId,
      disputeRef: input.disputeRef,
      sourceDigest: input.sourceDigest,
      evidenceRefs: input.evidenceRefs,
      refundTransactionRef: input.refundTransactionRef,
      refundInputDigest: input.refundInputDigest,
      lossTransactionRef: disputeIdentity.lossTransactionRef,
      lossInputDigest: disputeIdentity.lossInputDigest,
      operatorAccountRef: operator.accountRef,
      rakeAccountRef: rake.accountRef,
      lossAccountRef: lossPreview.accountRef,
      operatorAmount,
      rakeAmount,
      providerAmount,
      invocationRef,
      attemptRef,
      observedAt: input.observedAt,
      originalUpdatedAt: input.original.updatedAt,
      operatorVersion: operator.version,
      lossAccountVersion: lossPreview.version,
      prior,
      reversalRows: reversals,
      refundRows,
      lossRows,
      lossEntries,
    })
    return exact
      ? {
          kind: 'accepted',
          transactionRef: prior.transactionRef,
          currency: input.original.currency,
        }
      : refuse(
          prior.inputDigest === input.refundInputDigest
            ? 'charge_reconciliation_required'
            : 'ledger_idempotency_conflict',
        )
  }
  if (
    (input.original.state !== 'applied' &&
      input.original.state !== 'outcome_unknown') ||
    reversals.length !== 0 ||
    lossRows.length !== 0 ||
    lossEntries.length !== 0
  )
    return refuse('charge_reconciliation_required')
  const budget = await prepareCredentialBudgetTransition(
    ctx,
    input.original,
    'not_released',
    input.observedAt,
  )
  const lossBalance = amountFromParts(
    lossPreview.currency,
    lossPreview.balanceUnits,
    lossPreview.exponent,
  )
  const nextOperator = addExactAmounts(operatorDomain.balance, operatorAmount)
  const nextRake = subtractExactAmounts(rakeDomain.balance, rakeAmount)
  const nextLoss =
    lossBalance === undefined
      ? undefined
      : addExactAmounts(lossBalance, providerAmount)
  if (
    budget === undefined ||
    nextOperator === undefined ||
    nextRake === undefined ||
    nextLoss === undefined
  )
    return refuse('charge_reconciliation_required')
  return {
    kind: 'apply',
    input,
    operator,
    rake,
    lossAccountPrepared: lossPrepared,
    budget,
    operatorAmount,
    rakeAmount,
    providerAmount,
    nextOperator,
    nextRake,
    nextLoss,
    lossTransactionRef: disputeIdentity.lossTransactionRef,
    lossInputDigest: disputeIdentity.lossInputDigest,
    invocationRef,
    attemptRef,
  }
}

async function apply(ctx: MutationCtx, prepared: Prepared): Promise<Result> {
  const lossAccount = await applyPreparedCanonicalMoneyAccount(ctx, prepared.lossAccountPrepared)
  await applyPreparedCredentialBudgetTransition(ctx, prepared.budget)
  const { input } = prepared
  const original = input.original
  await Promise.all([
    ctx.db.patch(prepared.operator._id, { balanceUnits: prepared.nextOperator.units, version: prepared.operator.version + 1, updatedAt: input.observedAt }),
    ctx.db.patch(prepared.rake._id, { balanceUnits: prepared.nextRake.units, version: prepared.rake.version + 1, updatedAt: input.observedAt }),
  ])
  await ctx.db.patch(lossAccount._id, { balanceUnits: prepared.nextLoss.units, version: lossAccount.version + 1, updatedAt: input.observedAt })
  const common = { transactionRef: input.refundTransactionRef, idempotencyKey: input.refundTransactionRef, sourceDigest: input.sourceDigest, evidenceRefs: [...input.evidenceRefs], createdAt: input.observedAt, reversalOf: original.transactionRef }
  const refundRef = input.refundTransactionRef
  await Promise.all([
    ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${refundRef}:operator`, accountRef: prepared.operator.accountRef, entryType: 'refund', direction: 'credit', ...amountFields(prepared.operatorAmount), principalId: original.principalId }),
    ctx.db.insert('moneyLedgerEntries', { ...common, entryRef: `${refundRef}:rake`, accountRef: prepared.rake.accountRef, entryType: 'refund', direction: 'debit', ...amountFields(prepared.rakeAmount), businessId: input.journal.businessId }),
    ctx.db.insert('moneyTransactions', { transactionRef: prepared.lossTransactionRef, kind: 'external_loss', idempotencyKey: prepared.lossTransactionRef, inputDigest: prepared.lossInputDigest, principalId: original.principalId, ...amountFields(prepared.providerAmount), state: 'applied', expectedAccountVersion: lossAccount.version, externalRef: input.disputeRef, createdAt: input.observedAt, updatedAt: input.observedAt }),
    ctx.db.insert('moneyLedgerEntries', { entryRef: `${prepared.lossTransactionRef}:external-loss`, accountRef: lossAccount.accountRef, entryType: 'external_loss', direction: 'credit', ...amountFields(prepared.providerAmount), transactionRef: prepared.lossTransactionRef, idempotencyKey: prepared.lossTransactionRef, principalId: original.principalId, invocationRef: prepared.invocationRef, attemptRef: prepared.attemptRef, sourceDigest: input.sourceDigest, evidenceRefs: [...input.evidenceRefs], createdAt: input.observedAt }),
    ctx.db.insert('moneyTransactions', { transactionRef: refundRef, kind: 'refund', idempotencyKey: refundRef, inputDigest: input.refundInputDigest, principalId: original.principalId, currency: original.currency, exponent: original.exponent, state: 'reversed', expectedAccountVersion: prepared.operator.version, reversalOf: original.transactionRef, externalRef: input.disputeRef, createdAt: input.observedAt, updatedAt: input.observedAt }),
  ])
  await ctx.db.patch(original._id, { state: 'reversed', updatedAt: input.observedAt })
  return { kind: 'accepted', transactionRef: refundRef, currency: original.currency }
}

export async function reverseBrokeredDisputeLoss(ctx: MutationCtx, input: Input): Promise<Result | undefined> {
  const admission = await prepare(ctx, input)
  if (admission === undefined || admission.kind === 'refused' || admission.kind === 'accepted') return admission
  return apply(ctx, admission)
}
