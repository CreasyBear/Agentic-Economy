import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  accountRefForExternalLoss,
  amountFromParts,
  type MoneyAccount,
} from '../src/modules/money/public'

export function accountFromRow(row: Doc<'moneyAccounts'>): MoneyAccount | undefined {
  const balance = amountFromParts(row.currency, row.balanceUnits, row.exponent)
  const recoveryDue = amountFromParts(row.currency, row.recoveryDueUnits, row.exponent)
  if (balance === undefined || recoveryDue === undefined) return undefined
  if (row.accountKind !== 'provider_earnings' && recoveryDue.units !== '0')
    return undefined
  return {
    accountRef: row.accountRef,
    accountKind: row.accountKind,
    ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
    ...(row.businessId === undefined ? {} : { businessId: row.businessId }),
    balance,
    recoveryDue,
    version: row.version,
    state: row.state,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export type CanonicalMoneyAccountInput =
  | Readonly<{
      accountKind: 'operator_credit'
      accountId: string
      currency: string
      exponent: number
      now: number
    }>
  | Readonly<{
      accountKind: 'provider_earnings'
      businessId: string
      currency: string
      exponent: number
      now: number
    }>
  | Readonly<{
      accountKind: 'ae_rake'
      currency: string
      exponent: number
      now: number
    }>
  | Readonly<{
      accountKind: 'ae_external_loss'
      currency: string
      exponent: number
      now: number
    }>

function canonicalMoneyAccountRef(input: CanonicalMoneyAccountInput): string {
  switch (input.accountKind) {
    case 'operator_credit':
      return accountRefForOwner(input.accountId, input.currency)
    case 'provider_earnings':
      return accountRefForProvider(input.businessId, input.currency)
    case 'ae_rake':
      return accountRefForRake(input.currency)
    case 'ae_external_loss':
      return accountRefForExternalLoss(input.currency)
    default: {
      const _exhaustive: never = input
      return _exhaustive
    }
  }
}

export function canonicalMoneyAccountMatches(
  row: Doc<'moneyAccounts'>,
  input: CanonicalMoneyAccountInput,
  accountRef: string,
): boolean {
  if (
    row.accountRef !== accountRef ||
    row.accountKind !== input.accountKind ||
    row.currency !== input.currency ||
    row.exponent !== input.exponent
  )
    return false
  switch (input.accountKind) {
    case 'operator_credit':
      return row.accountId === input.accountId && row.businessId === undefined
    case 'provider_earnings':
      return row.businessId === input.businessId && row.accountId === undefined
    case 'ae_rake':
      return row.accountId === undefined && row.businessId === undefined
    case 'ae_external_loss':
      return row.accountId === undefined && row.businessId === undefined
    default: {
      const _exhaustive: never = input
      return _exhaustive
    }
  }
}

type CanonicalMoneyAccountValue = Omit<
  Doc<'moneyAccounts'>,
  '_id' | '_creationTime'
>
export type PreparedCanonicalMoneyAccount =
  | Readonly<{ kind: 'existing'; row: Doc<'moneyAccounts'> }>
  | Readonly<{ kind: 'insert'; value: CanonicalMoneyAccountValue }>

function canonicalMoneyAccountValue(
  input: CanonicalMoneyAccountInput,
): CanonicalMoneyAccountValue {
  const accountRef = canonicalMoneyAccountRef(input)
  switch (input.accountKind) {
    case 'operator_credit':
      return {
        accountRef,
        accountKind: input.accountKind,
        accountId: input.accountId,
        currency: input.currency,
        exponent: input.exponent,
        balanceUnits: '0',
        heldUnits: '0',
        recoveryDueUnits: '0',
        version: 0,
        state: 'active',
        createdAt: input.now,
        updatedAt: input.now,
      }
    case 'provider_earnings':
      return {
        accountRef,
        accountKind: input.accountKind,
        businessId: input.businessId,
        currency: input.currency,
        exponent: input.exponent,
        balanceUnits: '0',
        heldUnits: '0',
        recoveryDueUnits: '0',
        version: 0,
        state: 'active',
        createdAt: input.now,
        updatedAt: input.now,
      }
    case 'ae_rake':
      return {
        accountRef,
        accountKind: input.accountKind,
        currency: input.currency,
        exponent: input.exponent,
        balanceUnits: '0',
        heldUnits: '0',
        recoveryDueUnits: '0',
        version: 0,
        state: 'active',
        createdAt: input.now,
        updatedAt: input.now,
      }
    case 'ae_external_loss':
      return {
        accountRef,
        accountKind: input.accountKind,
        currency: input.currency,
        exponent: input.exponent,
        balanceUnits: '0',
        heldUnits: '0',
        recoveryDueUnits: '0',
        version: 0,
        state: 'active',
        createdAt: input.now,
        updatedAt: input.now,
      }
    default: {
      const _exhaustive: never = input
      return _exhaustive
    }
  }
}

export function canonicalMoneyAccountPreview(
  prepared: PreparedCanonicalMoneyAccount,
): Doc<'moneyAccounts'> {
  return prepared.kind === 'existing'
    ? prepared.row
    : {
        _id: '' as Doc<'moneyAccounts'>['_id'],
        _creationTime: 0,
        ...prepared.value,
      }
}

export async function prepareCanonicalMoneyAccount(
  ctx: Pick<MutationCtx, 'db'>,
  input: CanonicalMoneyAccountInput,
): Promise<PreparedCanonicalMoneyAccount | undefined> {
  const accountRef = canonicalMoneyAccountRef(input)
  const existing = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (q) => q.eq('accountRef', accountRef))
    .unique()
  if (existing !== null)
    return canonicalMoneyAccountMatches(existing, input, accountRef)
      ? { kind: 'existing', row: existing }
      : undefined
  return { kind: 'insert', value: canonicalMoneyAccountValue(input) }
}

export async function applyPreparedCanonicalMoneyAccount(
  ctx: Pick<MutationCtx, 'db'>,
  prepared: PreparedCanonicalMoneyAccount,
): Promise<Doc<'moneyAccounts'>> {
  if (prepared.kind === 'existing') return prepared.row
  const accountId = await ctx.db.insert('moneyAccounts', prepared.value)
  const created = await ctx.db.get(accountId)
  if (created === null) throw new Error('canonical_money_account_insert_missing')
  return created
}
