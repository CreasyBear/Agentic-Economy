import { v, type Infer } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { internalMutation } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  AUD_EXPONENT,
  applyJournalTransaction,
  prepareBalancedJournalTransaction,
  projectionChecksum,
  type MoneyBalanceProjection,
  type MoneyJournalAccount,
  type MoneyJournalAccountKind,
} from '../src/modules/money/public'

const positiveUnits = v.string()
const fundingSettlementArgsValue = v.object({
  accountRef: v.string(),
  transactionRef: v.string(),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  principalUnits: positiveUnits,
  serviceFeeUnits: positiveUnits,
  taxUnits: positiveUnits,
  totalUnits: positiveUnits,
  externalRef: v.string(),
  evidenceRefs: v.array(v.string()),
  occurredAt: v.number(),
})
type FundingSettlementArgs = Infer<typeof fundingSettlementArgsValue>

const fundingSettlementResultValue = v.union(
  v.object({ kind: v.literal('posted'), transactionRef: v.string() }),
  v.object({ kind: v.literal('replayed'), transactionRef: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.string(),
    retryable: v.boolean(),
    caseRef: v.optional(v.string()),
  }),
)
type FundingSettlementResult = Infer<typeof fundingSettlementResultValue>

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u
const POSITIVE_UNITS_PATTERN = /^[1-9]\d{0,29}$/u
const NONNEGATIVE_UNITS_PATTERN = /^(?:0|[1-9]\d{0,29})$/u
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u

type FundingAccountDefinition = Omit<MoneyJournalAccount, 'asset' | 'exponent' | 'accountKind'> & Readonly<{
  asset: 'AUD'
  exponent: typeof AUD_EXPONENT
  accountKind: Extract<MoneyJournalAccountKind,
    | 'cash_clearing_asset'
    | 'customer_prepayment_liability'
    | 'service_fee_revenue'
    | 'tax_payable_liability'>
}>

function fundingAccounts(accountRef: string): readonly FundingAccountDefinition[] {
  return Object.freeze([
    Object.freeze({
      ledgerAccountRef: 'ledger:aud:cash-clearing',
      accountRef: 'platform',
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      accountKind: 'cash_clearing_asset',
      normalBalance: 'debit',
    }),
    Object.freeze({
      ledgerAccountRef: `ledger:aud:customer-prepayment:${accountRef}`,
      accountRef,
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      accountKind: 'customer_prepayment_liability',
      normalBalance: 'credit',
    }),
    Object.freeze({
      ledgerAccountRef: 'ledger:aud:service-fee',
      accountRef: 'platform',
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      accountKind: 'service_fee_revenue',
      normalBalance: 'credit',
    }),
    Object.freeze({
      ledgerAccountRef: 'ledger:aud:tax-payable',
      accountRef: 'platform',
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      accountKind: 'tax_payable_liability',
      normalBalance: 'credit',
    }),
  ])
}

function validFundingArgs(args: FundingSettlementArgs): boolean {
  if (!REF_PATTERN.test(args.accountRef)
    || !REF_PATTERN.test(args.transactionRef)
    || !REF_PATTERN.test(args.idempotencyKey)
    || !SHA256_PATTERN.test(args.inputDigest)
    || !POSITIVE_UNITS_PATTERN.test(args.principalUnits)
    || !NONNEGATIVE_UNITS_PATTERN.test(args.serviceFeeUnits)
    || !NONNEGATIVE_UNITS_PATTERN.test(args.taxUnits)
    || !POSITIVE_UNITS_PATTERN.test(args.totalUnits)
    || !REF_PATTERN.test(args.externalRef)
    || !Number.isSafeInteger(args.occurredAt)
    || args.occurredAt < 0
    || args.evidenceRefs.length === 0
    || args.evidenceRefs.length > 32
    || args.evidenceRefs.some((ref) => !REF_PATTERN.test(ref))) return false
  return BigInt(args.principalUnits)
    + BigInt(args.serviceFeeUnits)
    + BigInt(args.taxUnits) === BigInt(args.totalUnits)
}

function fundingPostingInputs(args: FundingSettlementArgs) {
  const definitions = fundingAccounts(args.accountRef)
  const credits = [
    { suffix: 'principal', account: definitions[1]!, units: BigInt(args.principalUnits) },
    { suffix: 'service-fee', account: definitions[2]!, units: BigInt(args.serviceFeeUnits) },
    { suffix: 'tax', account: definitions[3]!, units: BigInt(args.taxUnits) },
  ].filter(({ units }) => units > 0n)
  return [
    {
      postingRef: `${args.transactionRef}:cash`,
      ledgerAccountRef: definitions[0]!.ledgerAccountRef,
      side: 'debit' as const,
      amountUnits: BigInt(args.totalUnits),
    },
    ...credits.map(({ suffix, account, units }) => ({
      postingRef: `${args.transactionRef}:${suffix}`,
      ledgerAccountRef: account.ledgerAccountRef,
      side: 'credit' as const,
      amountUnits: units,
    })),
  ]
}

async function ensureFundingAccounts(
  ctx: MutationCtx,
  definitions: readonly FundingAccountDefinition[],
  now: number,
): Promise<readonly Doc<'moneyLedgerAccounts'>[]> {
  const rows: Doc<'moneyLedgerAccounts'>[] = []
  for (const definition of definitions) {
    const existing = await ctx.db.query('moneyLedgerAccounts')
      .withIndex('by_ledgerAccountRef', (query) => query
        .eq('ledgerAccountRef', definition.ledgerAccountRef))
      .unique()
    if (existing !== null) {
      if (existing.accountRef !== definition.accountRef
        || existing.asset !== definition.asset
        || existing.exponent !== definition.exponent
        || existing.accountKind !== definition.accountKind
        || existing.normalBalance !== definition.normalBalance) {
        throw new Error('journal_account_definition_conflict')
      }
      rows.push(existing)
      continue
    }
    const id = await ctx.db.insert('moneyLedgerAccounts', {
      ...definition,
      state: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    const created = await ctx.db.get(id)
    if (created === null) throw new Error('journal_account_insert_missing')
    rows.push(created)
  }
  return rows
}

function projectionFromRow(row: Doc<'moneyBalanceProjections'>): MoneyBalanceProjection {
  return Object.freeze({
    ledgerAccountRef: row.ledgerAccountRef,
    accountRef: row.accountRef,
    asset: row.asset,
    exponent: row.exponent,
    balanceUnits: BigInt(row.balanceUnits),
    version: row.version,
    ...(row.lastTransactionRef === undefined ? {} : { lastTransactionRef: row.lastTransactionRef }),
  })
}

function projectionChecksumForRow(row: Doc<'moneyBalanceProjections'>): string {
  return projectionChecksum([projectionFromRow(row)])
}

async function openProjectionReconciliation(
  ctx: MutationCtx,
  input: Readonly<{
    accountRef: string
    transactionRef: string
    evidenceRefs: readonly string[]
    now: number
  }>,
): Promise<string> {
  const caseRef = `reconciliation:${canonicalDigest({
    format: 'ae.money-reconciliation-case:v1',
    accountRef: input.accountRef,
    transactionRef: input.transactionRef,
    kind: 'projection_mismatch',
  }).slice('sha256:'.length)}`
  const existing = await ctx.db.query('moneyReconciliationCases')
    .withIndex('by_caseRef', (query) => query.eq('caseRef', caseRef))
    .unique()
  if (existing === null) {
    await ctx.db.insert('moneyReconciliationCases', {
      caseRef,
      accountRef: input.accountRef,
      kind: 'projection_mismatch',
      status: 'open',
      ownerPrincipalRef: 'system:money-reconciliation',
      transactionRef: input.transactionRef,
      reasonCode: 'projection_checksum_mismatch',
      evidenceRefs: [...input.evidenceRefs],
      createdAt: input.now,
      updatedAt: input.now,
    })
  }
  const customerAccount = await ctx.db.query('moneyLedgerAccounts')
    .withIndex('by_accountRef_and_asset_and_accountKind', (query) => query
      .eq('accountRef', input.accountRef)
      .eq('asset', 'AUD')
      .eq('accountKind', 'customer_prepayment_liability'))
    .unique()
  if (customerAccount !== null && customerAccount.state !== 'locked') {
    await ctx.db.patch(customerAccount._id, {
      state: 'locked',
      version: customerAccount.version + 1,
      updatedAt: input.now,
    })
  }
  const projection = await ctx.db.query('moneyBalanceProjections')
    .withIndex('by_accountRef_and_asset', (query) => query
      .eq('accountRef', input.accountRef)
      .eq('asset', 'AUD'))
    .unique()
  if (projection !== null && projection.state !== 'locked') {
    await ctx.db.patch(projection._id, { state: 'locked', updatedAt: input.now })
  }
  return caseRef
}

export async function postFundingSettlementHandler(
  ctx: MutationCtx,
  args: FundingSettlementArgs,
): Promise<FundingSettlementResult> {
  if (!validFundingArgs(args)) {
    return { kind: 'refused', code: 'journal_invalid', retryable: false }
  }
  const prior = await ctx.db.query('moneyLedgerTransactions')
    .withIndex('by_idempotencyKey', (query) => query.eq('idempotencyKey', args.idempotencyKey))
    .unique()
  if (prior !== null) {
    return prior.transactionRef === args.transactionRef
      && prior.accountRef === args.accountRef
      && prior.inputDigest === args.inputDigest
      && prior.externalRef === args.externalRef
      && prior.debitUnits === args.totalUnits
      && prior.creditUnits === args.totalUnits
      ? { kind: 'replayed', transactionRef: prior.transactionRef }
      : { kind: 'refused', code: 'journal_idempotency_conflict', retryable: false }
  }
  const transactionConflict = await ctx.db.query('moneyLedgerTransactions')
    .withIndex('by_transactionRef', (query) => query.eq('transactionRef', args.transactionRef))
    .unique()
  if (transactionConflict !== null) {
    return { kind: 'refused', code: 'journal_idempotency_conflict', retryable: false }
  }

  const definitions = fundingAccounts(args.accountRef)
  const accountRows = await ensureFundingAccounts(ctx, definitions, args.occurredAt)
  const customerAccount = accountRows.find((row) => row.accountRef === args.accountRef)
  if (customerAccount?.state === 'locked') {
    return { kind: 'refused', code: 'journal_reconciliation_required', retryable: false }
  }
  const projectionRows = (await Promise.all(definitions.map(async (definition) =>
    await ctx.db.query('moneyBalanceProjections')
      .withIndex('by_ledgerAccountRef', (query) => query
        .eq('ledgerAccountRef', definition.ledgerAccountRef))
      .unique(),
  ))).filter((row): row is Doc<'moneyBalanceProjections'> => row !== null)
  const mismatch = projectionRows.find((row) => row.checksum !== projectionChecksumForRow(row))
  if (mismatch !== undefined) {
    const caseRef = await openProjectionReconciliation(ctx, {
      accountRef: args.accountRef,
      transactionRef: args.transactionRef,
      evidenceRefs: args.evidenceRefs,
      now: args.occurredAt,
    })
    return {
      kind: 'refused',
      code: 'journal_reconciliation_required',
      retryable: false,
      caseRef,
    }
  }

  const prepared = prepareBalancedJournalTransaction({
    transactionRef: args.transactionRef,
    idempotencyKey: args.idempotencyKey,
    accountRef: args.accountRef,
    kind: 'funding_settlement',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    postings: fundingPostingInputs(args),
    evidenceRefs: args.evidenceRefs,
    occurredAt: args.occurredAt,
  }, definitions)
  if (prepared.kind === 'refused') {
    return { kind: 'refused', code: prepared.code, retryable: false }
  }
  const current = projectionRows.map(projectionFromRow)
  const next = applyJournalTransaction(current, definitions, prepared.transaction)

  await ctx.db.insert('moneyLedgerTransactions', {
    transactionRef: prepared.transaction.transactionRef,
    accountRef: prepared.transaction.accountRef,
    kind: prepared.transaction.kind,
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    idempotencyKey: prepared.transaction.idempotencyKey,
    inputDigest: args.inputDigest,
    journalDigest: prepared.transaction.journalDigest,
    debitUnits: prepared.transaction.debitUnits.toString(),
    creditUnits: prepared.transaction.creditUnits.toString(),
    state: 'posted',
    evidenceRefs: [...prepared.transaction.evidenceRefs],
    externalRef: args.externalRef,
    occurredAt: prepared.transaction.occurredAt,
    recordedAt: args.occurredAt,
  })
  for (const posting of prepared.transaction.postings) {
    await ctx.db.insert('moneyLedgerPostings', {
      postingRef: posting.postingRef,
      transactionRef: prepared.transaction.transactionRef,
      position: posting.position,
      ledgerAccountRef: posting.ledgerAccountRef,
      side: posting.side,
      amountUnits: posting.amountUnits.toString(),
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      createdAt: args.occurredAt,
    })
  }
  for (const projection of next) {
    const checksum = projectionChecksum([projection])
    const existing = projectionRows.find((row) => row.ledgerAccountRef === projection.ledgerAccountRef)
    const value = {
      accountRef: projection.accountRef,
      asset: 'AUD' as const,
      exponent: AUD_EXPONENT,
      balanceUnits: projection.balanceUnits.toString(),
      version: projection.version,
      checksum,
      state: 'active' as const,
      lastTransactionRef: prepared.transaction.transactionRef,
      updatedAt: args.occurredAt,
    }
    if (existing === undefined) {
      await ctx.db.insert('moneyBalanceProjections', {
        ledgerAccountRef: projection.ledgerAccountRef,
        ...value,
      })
    } else {
      await ctx.db.patch(existing._id, value)
    }
  }
  return { kind: 'posted', transactionRef: prepared.transaction.transactionRef }
}

export const postFundingSettlement = internalMutation({
  args: fundingSettlementArgsValue.fields,
  returns: fundingSettlementResultValue,
  handler: postFundingSettlementHandler,
})
