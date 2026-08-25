import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  amountFromParts,
  paidChargeContractInput,
  payoutAccrualFromChargeAmounts,
  selectChargeEntries,
  validateChargeContract,
  zeroExactAmount,
  type ChargeContractOriginal,
  type ChargeContractUsage,
  type ChargePlan,
  type ExactAmount,
  type MoneyLedgerEntry,
  type MoneyTransaction,
  type MoneyUsageEvent,
  type PayoutAccrualAmounts,
  type ValidatedChargeContract,
} from '../src/modules/money/public'

export type MoneyLedgerEntryRow = Doc<'moneyLedgerEntries'>

export type ChargeLedgerEntry = MoneyLedgerEntryRow & {
  amount: ExactAmount
}

export type ValidatedChargeJournal = ValidatedChargeContract<ChargeLedgerEntry>

export function entryAmount(row: MoneyLedgerEntryRow): ExactAmount | undefined {
  return amountFromParts(row.currency, row.amountUnits, row.exponent)
}

function toChargeLedgerEntry(
  row: MoneyLedgerEntryRow,
): ChargeLedgerEntry | undefined {
  const amount = entryAmount(row)
  if (amount === undefined) return undefined
  return { ...row, amount }
}

function chargeContractOriginal(
  row: Doc<'moneyTransactions'>,
): ChargeContractOriginal | undefined {
  if (row.amountUnits === undefined) return undefined
  const amount = amountFromParts(row.currency, row.amountUnits, row.exponent)
  if (amount === undefined) return undefined
  return {
    transactionRef: row.transactionRef,
    kind: row.kind,
    idempotencyKey: row.idempotencyKey,
    principalId: row.principalId,
    ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
    ...(row.credentialId === undefined ? {} : { credentialId: row.credentialId }),
    currency: row.currency,
    exponent: row.exponent,
    amount,
    createdAt: row.createdAt,
  }
}

function chargeContractUsage(
  row: Doc<'moneyUsageEvents'>,
): ChargeContractUsage | undefined {
  const amount = amountFromParts(row.currency, row.amountUnits, row.exponent)
  if (amount === undefined) return undefined
  return {
    principalId: row.principalId,
    credentialId: row.credentialId,
    ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
    businessId: row.businessId,
    ...(row.transactionRef === undefined
      ? {}
      : { transactionRef: row.transactionRef }),
    chargeState: row.chargeState,
    amount,
    observedAt: row.observedAt,
    invocationRef: row.invocationRef,
    attemptRef: row.attemptRef,
  }
}

export function mappedChargeEntries(
  entries: readonly MoneyLedgerEntryRow[],
): ChargeLedgerEntry[] | undefined {
  const mapped: ChargeLedgerEntry[] = []
  for (const row of entries) {
    const entry = toChargeLedgerEntry(row)
    if (entry === undefined) return undefined
    mapped.push(entry)
  }
  return mapped
}

export function validateChargeJournal(
  original: Doc<'moneyTransactions'>,
  usage: Doc<'moneyUsageEvents'> | undefined,
  entries: readonly MoneyLedgerEntryRow[],
): ValidatedChargeJournal | undefined {
  const accountId = original.accountId
  const businessId = usage?.businessId
  const mappedOriginal = chargeContractOriginal(original)
  const mappedUsage =
    usage === undefined ? undefined : chargeContractUsage(usage)
  const mappedEntries = mappedChargeEntries(entries)
  if (
    accountId === undefined ||
    businessId === undefined ||
    mappedOriginal === undefined ||
    mappedUsage === undefined ||
    mappedEntries === undefined
  )
    return undefined
  return validateChargeContract({
    original: mappedOriginal,
    usage: mappedUsage,
    selected: selectChargeEntries(mappedEntries),
    operator: { accountRef: accountRefForOwner(accountId, original.currency) },
    provider: {
      accountRef: accountRefForProvider(businessId, original.currency),
    },
    rake: { accountRef: accountRefForRake(original.currency) },
  })
}

export function chargeJournalRecoveryAmount(
  journal: ValidatedChargeJournal,
): ExactAmount | undefined {
  const recovery = journal.selected.recovery?.amount
  if (recovery !== undefined) return recovery
  return zeroExactAmount(
    journal.providerAmount.currency,
    journal.providerAmount.exponent,
  )
}

export async function readPayoutAccrualAmounts(
  ctx: Pick<MutationCtx, 'db'>,
  transaction: Doc<'moneyTransactions'>,
): Promise<PayoutAccrualAmounts | undefined> {
  const entries = await ctx.db
    .query('moneyLedgerEntries')
    .withIndex('by_transactionRef', (query) =>
      query.eq('transactionRef', transaction.transactionRef),
    )
    .take(10)
  const mappedEntries = mappedChargeEntries(entries)
  const selected =
    mappedEntries === undefined
      ? undefined
      : selectChargeEntries(mappedEntries)
  const invocationRef = selected?.charge.invocationRef
  if (selected === undefined || invocationRef === undefined) return undefined
  const usageRows = await ctx.db
    .query('moneyUsageEvents')
    .withIndex('by_invocationRef', (query) =>
      query.eq('invocationRef', invocationRef),
    )
    .take(2)
  const journal = validateChargeJournal(
    transaction,
    usageRows.length === 1 ? usageRows[0] : undefined,
    entries,
  )
  if (journal === undefined) return undefined
  const recoveryAmount = chargeJournalRecoveryAmount(journal)
  if (
    recoveryAmount === undefined ||
    journal.chargeAmount.currency !== journal.providerAmount.currency ||
    journal.rakeAmount.currency !== journal.providerAmount.currency
  )
    return undefined
  const providerAccount = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (query) =>
      query.eq('accountRef', journal.selected.provider.accountRef),
    )
    .unique()
  if (
    providerAccount === null ||
    providerAccount.accountKind !== 'provider_earnings' ||
    providerAccount.businessId !== journal.businessId ||
    providerAccount.currency !== journal.providerAmount.currency
  )
    return undefined
  return payoutAccrualFromChargeAmounts({
    transactionRef: transaction.transactionRef,
    businessId: journal.businessId,
    chargeAmount: journal.chargeAmount,
    providerAmount: journal.providerAmount,
    rakeAmount: journal.rakeAmount,
    recoveryAmount,
    accountCurrency: providerAccount.currency,
    accountExponent: providerAccount.exponent,
  })
}

export function domainMoneyTransaction(
  row: Doc<'moneyTransactions'>,
): MoneyTransaction {
  const amount =
    row.amountUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.amountUnits, row.exponent)
  return {
    transactionRef: row.transactionRef,
    kind: row.kind,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    principalId: row.principalId,
    ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
    currency: row.currency,
    exponent: row.exponent,
    state: row.state,
    expectedAccountVersion: row.expectedAccountVersion,
    ...(amount === undefined ? {} : { amount }),
    ...(row.budgetState === undefined ? {} : { budgetState: row.budgetState }),
    ...(row.settledAt === undefined ? {} : { settledAt: row.settledAt }),
    ...(row.externalRef === undefined ? {} : { externalRef: row.externalRef }),
    ...(row.reversalOf === undefined ? {} : { reversalOf: row.reversalOf }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function domainMoneyUsage(
  row: Doc<'moneyUsageEvents'>,
): MoneyUsageEvent | undefined {
  const amount = amountFromParts(row.currency, row.amountUnits, row.exponent)
  if (amount === undefined) return undefined
  return {
    usageRef: row.usageRef,
    principalId: row.principalId,
    ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
    credentialId: row.credentialId,
    serviceRef: row.serviceRef,
    offeringRef: row.offeringRef,
    businessId: row.businessId,
    invocationRef: row.invocationRef,
    attemptRef: row.attemptRef,
    operationKey: row.operationKey,
    priceDigest: row.priceDigest,
    chargeState: row.chargeState,
    amount,
    ...(row.transactionRef === undefined
      ? {}
      : { transactionRef: row.transactionRef }),
    observedAt: row.observedAt,
  }
}

export function domainMoneyEntries(
  rows: readonly MoneyLedgerEntryRow[],
): MoneyLedgerEntry[] | undefined {
  const mapped = mappedChargeEntries(rows)
  if (mapped === undefined) return undefined
  return mapped.map((row) => ({
    entryRef: row.entryRef,
    accountRef: row.accountRef,
    entryType: row.entryType,
    direction: row.direction,
    amount: row.amount,
    transactionRef: row.transactionRef,
    idempotencyKey: row.idempotencyKey,
    ...(row.principalId === undefined ? {} : { principalId: row.principalId }),
    ...(row.businessId === undefined ? {} : { businessId: row.businessId }),
    ...(row.invocationRef === undefined
      ? {}
      : { invocationRef: row.invocationRef }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    sourceDigest: row.sourceDigest,
    evidenceRefs: row.evidenceRefs,
    createdAt: row.createdAt,
    ...(row.reversalOf === undefined ? {} : { reversalOf: row.reversalOf }),
  }))
}

function ledgerEntryInsert(entry: MoneyLedgerEntry) {
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

export type ChargePlanBudgetFields = Readonly<{
  credentialId: string
  budgetPolicyRef: string
  budgetGeneration: number
  budgetEnvironment: 'sandbox' | 'production'
  budgetDayStart: string
  budgetMonthStart: string
  budgetState: 'reserved'
}>

export function validatePaidChargePlan(
  plan: ChargePlan,
): ValidatedChargeContract<MoneyLedgerEntry> | undefined {
  if (
    plan.result.kind !== 'accepted' ||
    plan.result.chargeState !== 'paid' ||
    plan.transaction === undefined ||
    plan.usage === undefined ||
    plan.accounts === undefined
  )
    return undefined
  return validateChargeContract(
    paidChargeContractInput({
      transaction: plan.transaction,
      usage: plan.usage,
      entries: plan.entries,
      operatorAccountRef: plan.accounts.operator.accountRef,
      providerAccountRef: plan.accounts.provider.accountRef,
      rakeAccountRef: plan.accounts.rake.accountRef,
    }),
  )
}

export async function persistPaidChargePlan(
  ctx: Pick<MutationCtx, 'db'>,
  plan: ChargePlan,
  rows: Readonly<{
    operator: Doc<'moneyAccounts'>
    provider: Doc<'moneyAccounts'>
    rake: Doc<'moneyAccounts'>
  }>,
  budget: ChargePlanBudgetFields,
): Promise<boolean> {
  const contract = validatePaidChargePlan(plan)
  const transaction = plan.transaction
  const usage = plan.usage
  const accounts = plan.accounts
  if (
    contract === undefined ||
    transaction === undefined ||
    usage === undefined ||
    accounts === undefined ||
    rows.operator.accountRef !== accounts.operator.accountRef ||
    rows.provider.accountRef !== accounts.provider.accountRef ||
    rows.rake.accountRef !== accounts.rake.accountRef
  )
    return false
  for (const entry of plan.entries) {
    await ctx.db.insert('moneyLedgerEntries', ledgerEntryInsert(entry))
  }
  await ctx.db.patch('moneyAccounts', rows.operator._id, {
    balanceUnits: accounts.operator.balance.units,
    version: accounts.operator.version,
    updatedAt: accounts.operator.updatedAt,
  })
  await ctx.db.patch('moneyAccounts', rows.provider._id, {
    balanceUnits: accounts.provider.balance.units,
    recoveryDueUnits: accounts.provider.recoveryDue.units,
    version: accounts.provider.version,
    updatedAt: accounts.provider.updatedAt,
  })
  await ctx.db.patch('moneyAccounts', rows.rake._id, {
    balanceUnits: accounts.rake.balance.units,
    version: accounts.rake.version,
    updatedAt: accounts.rake.updatedAt,
  })
  await ctx.db.insert('moneyTransactions', {
    transactionRef: transaction.transactionRef,
    kind: transaction.kind,
    idempotencyKey: transaction.idempotencyKey,
    inputDigest: transaction.inputDigest,
    principalId: transaction.principalId,
    ...(transaction.accountId === undefined
      ? {}
      : { accountId: transaction.accountId }),
    currency: transaction.currency,
    amountUnits: usage.amount.units,
    exponent: transaction.exponent,
    state: transaction.state,
    expectedAccountVersion: transaction.expectedAccountVersion,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    ...budget,
  })
  return true
}
