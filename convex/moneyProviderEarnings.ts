import { v, type Infer } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  agentAccessPrincipalValue,
  type AgentAccessPrincipalValue,
  verifySupplyAgentPrincipal,
} from './agentAccessPrincipals'
import { resolveBusinessActor } from './authz'
import { accountFromRow } from './moneyCanonicalAccounts'
import {
  domainMoneyEntries,
  domainMoneyTransaction,
  type MoneyLedgerEntryRow,
} from './moneyChargeJournal'
import {
  billingSourceArgs,
  exactAmount,
  identifier,
} from './moneyLedgerValues'
import { payoutFromRow } from './moneyPayoutTransferShared'
import { dailyPayoutIdentityFromRow } from './moneyQualifiedUsePayout'
import {
  requireSourceWrite,
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from './sourceWriteAdmission'
import {
  accountRefForProvider,
  projectProviderEarnings,
  zeroExactAmount,
  type ExactAmount,
} from '../src/modules/money/public'

type MoneyQueryCtx = Pick<QueryCtx, 'db'>

type ProviderEarningsReadResult =
  | Readonly<{
      kind: 'ok'
      businessId: string
      grossAccrual: ExactAmount
      rake: ExactAmount
      providerNet: ExactAmount
      paidOut: ExactAmount
      held: ExactAmount
      recoveryDue: ExactAmount
      truncated: boolean
      evidence: 'source'
    }>
  | Readonly<{
      kind: 'refused'
      code: 'payout_not_ready' | 'payout_reconciliation_required'
    }>

type PayoutStatusReadResult =
  | Readonly<{
      kind: 'ok'
      businessId: string
      accountState:
        | 'missing'
        | 'not_started'
        | 'onboarding_started'
        | 'submitted'
        | 'restricted'
        | 'ready'
      payoutState?:
        | 'review'
        | 'held_kyc'
        | 'held_threshold'
        | 'transfer_pending'
        | 'paid'
        | 'reversed'
        | 'failed'
        | 'outcome_unknown'
      destinationAccountId?: string
      requestDigest?: string
      evidenceDigest?: string
      reversalEvidenceDigest?: string
      providerHeldBefore?: ExactAmount
      providerHeldAfter?: ExactAmount
      providerPaidBefore?: ExactAmount
      providerPaidAfter?: ExactAmount
      stripeAccountId?: string
      payoutRef?: string
      payoutCommandId?: string
      idempotencyKey?: string
      stripeTransferId?: string
      transferStatus?:
        'pending' | 'succeeded' | 'failed' | 'reversed' | 'outcome_unknown'
      providerRecoveryDeadlineAt?: number
      recoveryState?: 'provider_id' | 'idempotency_key' | 'admin_intervention'
      accountVersion?: number
      lastStripeEventId?: string
      lastStripePayloadDigest?: string
      providerObjectDigest?: string
      providerNet: ExactAmount
      minimumPayout: ExactAmount
      evidence: 'source'
    }>
  | Readonly<{
      kind: 'refused'
      code: 'payout_not_ready' | 'payout_reconciliation_required'
    }>

export type ReadOwnerProviderEarningsArgs = {
  currency?: string
}

export type ReadAgentProviderEarningsArgs = {
  agentPrincipal: AgentAccessPrincipalValue
  currency?: string
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
}

export type ReadProviderEarningsArgs = {
  businessId: string
  currency: string
}

export type ReadPayoutStatusArgs = {
  businessId: string
  currency: string
}

export const payoutAccountStateValue = v.union(
  v.literal('missing'),
  v.literal('not_started'),
  v.literal('onboarding_started'),
  v.literal('submitted'),
  v.literal('restricted'),
  v.literal('ready'),
)
export const payoutStateValue = v.union(
  v.literal('review'),
  v.literal('held_kyc'),
  v.literal('held_threshold'),
  v.literal('transfer_pending'),
  v.literal('paid'),
  v.literal('reversed'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
export const providerEarningsViewValue = v.object({
  kind: v.literal('ok'),
  businessId: identifier,
  grossAccrual: exactAmount,
  rake: exactAmount,
  providerNet: exactAmount,
  paidOut: exactAmount,
  held: exactAmount,
  recoveryDue: exactAmount,
  truncated: v.boolean(),
  evidence: v.literal('source'),
})
export const payoutStatusViewValue = v.object({
  kind: v.literal('ok'),
  businessId: identifier,
  accountState: payoutAccountStateValue,
  payoutState: v.optional(payoutStateValue),
  payoutRef: v.optional(identifier),
  payoutCommandId: v.optional(identifier),
  idempotencyKey: v.optional(identifier),
  stripeTransferId: v.optional(identifier),
  transferStatus: v.optional(
    v.union(
      v.literal('pending'),
      v.literal('succeeded'),
      v.literal('failed'),
      v.literal('reversed'),
      v.literal('outcome_unknown'),
    ),
  ),
  providerRecoveryDeadlineAt: v.optional(v.number()),
  recoveryState: v.optional(
    v.union(
      v.literal('provider_id'),
      v.literal('idempotency_key'),
      v.literal('admin_intervention'),
    ),
  ),
  stripeAccountId: v.optional(identifier),
  accountVersion: v.optional(v.number()),
  lastStripeEventId: v.optional(identifier),
  lastStripePayloadDigest: v.optional(identifier),
  providerObjectDigest: v.optional(identifier),
  providerNet: exactAmount,
  destinationAccountId: v.optional(identifier),
  requestDigest: v.optional(identifier),
  evidenceDigest: v.optional(identifier),
  reversalEvidenceDigest: v.optional(identifier),
  providerHeldBefore: v.optional(exactAmount),
  providerHeldAfter: v.optional(exactAmount),
  providerPaidBefore: v.optional(exactAmount),
  providerPaidAfter: v.optional(exactAmount),
  minimumPayout: exactAmount,
  evidence: v.literal('source'),
})
export const ownerProviderEarningsResultValue = v.union(
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('unauthenticated'),
      v.literal('source_unavailable'),
    ),
  }),
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    businessId: identifier,
    accounts: v.array(
      v.object({
        currency: identifier,
        earnings: providerEarningsViewValue,
        payout: payoutStatusViewValue,
      }),
    ),
    accountsTruncated: v.boolean(),
  }),
)
export const agentProviderEarningsReadArgs = {
  agentPrincipal: agentAccessPrincipalValue,
  currency: v.optional(identifier),
  ...billingSourceArgs,
} as const
export const readOwnerProviderEarningsArgs = {
  currency: v.optional(identifier),
}
export const readProviderEarningsArgs = {
  businessId: identifier,
  currency: identifier,
}

async function readTransactionRefs(
  ctx: MoneyQueryCtx,
  rows: readonly MoneyLedgerEntryRow[],
): Promise<ReadonlyMap<string, Doc<'moneyTransactions'>>> {
  const refs = new Set<string>()
  for (const row of rows) {
    refs.add(row.transactionRef)
    if (row.reversalOf !== undefined) refs.add(row.reversalOf)
  }
  const transactions = await Promise.all(
    [...refs].map(
      async (transactionRef) =>
        await ctx.db
          .query('moneyTransactions')
          .withIndex('by_transactionRef', (query) =>
            query.eq('transactionRef', transactionRef),
          )
          .unique(),
    ),
  )
  return new Map(
    transactions
      .filter((row): row is Doc<'moneyTransactions'> => row !== null)
      .map((row) => [row.transactionRef, row]),
  )
}

async function readProviderEarningsForAccount(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
  account: Doc<'moneyAccounts'> | null,
): Promise<ProviderEarningsReadResult> {
  const accountDomain = account === null ? undefined : accountFromRow(account)
  if (
    account === null ||
    accountDomain === undefined ||
    account.accountKind !== 'provider_earnings'
  )
    return { kind: 'refused' as const, code: 'payout_not_ready' as const }
  const rows = await ctx.db
    .query('moneyLedgerEntries')
    .withIndex('by_businessId_and_createdAt', (q) =>
      q.eq('businessId', businessId),
    )
    .order('desc')
    .take(101)
  if (rows.length > 100)
    return {
      kind: 'refused' as const,
      code: 'payout_reconciliation_required' as const,
    }
  const [transactionRefs, businessTransactions] = await Promise.all([
    readTransactionRefs(ctx, rows),
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_principalId_and_createdAt', (query) =>
        query.eq('principalId', `business:${businessId}`),
      )
      .take(101),
  ])
  if (businessTransactions.length > 100)
    return {
      kind: 'refused' as const,
      code: 'payout_reconciliation_required' as const,
    }
  const transactionRows = new Map(transactionRefs)
  for (const transaction of businessTransactions)
    transactionRows.set(transaction.transactionRef, transaction)
  const payoutOriginalTransactions = [...transactionRows.values()].filter(
    (transaction) =>
      transaction.kind === 'payout_accrual' &&
      transaction.principalId === `business:${businessId}` &&
      transaction.currency === currency &&
      transaction.exponent === account.exponent &&
      transaction.reversalOf === undefined &&
      (transaction.state === 'applied' || transaction.state === 'reversed'),
  )
  const linkedReversalRows = await Promise.all(
    payoutOriginalTransactions.map(
      async (transaction) =>
        await ctx.db
          .query('moneyTransactions')
          .withIndex('by_reversalOf', (query) =>
            query.eq('reversalOf', transaction.transactionRef),
          )
          .take(2),
    ),
  )
  for (const reversals of linkedReversalRows) {
    for (const reversal of reversals)
      transactionRows.set(reversal.transactionRef, reversal)
  }
  const entries = domainMoneyEntries(rows)
  if (entries === undefined)
    return {
      kind: 'refused' as const,
      code: 'payout_reconciliation_required' as const,
    }
  const projected = projectProviderEarnings({
    businessId,
    currency,
    accounts: [accountDomain],
    entries,
    transactions: [...transactionRows.values()].map(domainMoneyTransaction),
    evidence: 'source',
  })
  if (projected.kind === 'ok') {
    if (projected.evidence !== 'source')
      return {
        kind: 'refused' as const,
        code: 'payout_reconciliation_required' as const,
      }
    return {
      kind: 'ok',
      businessId: projected.businessId,
      grossAccrual: projected.grossAccrual,
      rake: projected.rake,
      providerNet: projected.providerNet,
      paidOut: projected.paidOut,
      held: projected.held,
      recoveryDue: projected.recoveryDue,
      truncated: projected.truncated,
      evidence: 'source',
    }
  }
  switch (projected.code) {
    case 'payout_not_ready':
      return { kind: 'refused' as const, code: 'payout_not_ready' as const }
    case 'payout_reconciliation_required':
    case 'currency_mismatch':
      return {
        kind: 'refused' as const,
        code: 'payout_reconciliation_required' as const,
      }
    default: {
      const _exhaustive: never = projected.code
      throw new Error(_exhaustive)
    }
  }
}

async function readProviderEarningsForBusiness(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
): Promise<ProviderEarningsReadResult> {
  const account = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_businessId_and_currency', (q) =>
      q.eq('businessId', businessId).eq('currency', currency),
    )
    .unique()
  return await readProviderEarningsForAccount(
    ctx,
    businessId,
    currency,
    account,
  )
}

async function readPayoutStatusForRows(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
  account: Doc<'moneyPayoutAccounts'> | null,
  providerAccount: Doc<'moneyAccounts'> | null,
): Promise<PayoutStatusReadResult> {
  const provider =
    providerAccount === null ? undefined : accountFromRow(providerAccount)
  if (
    provider === undefined ||
    provider.accountKind !== 'provider_earnings' ||
    providerAccount === null ||
    providerAccount.accountRef !== accountRefForProvider(businessId, currency) ||
    providerAccount.businessId !== businessId ||
    providerAccount.currency !== currency
  )
    return { kind: 'refused' as const, code: 'payout_not_ready' as const }
  const [pendingRows, unknownRows] = await Promise.all([
    ctx.db
      .query('moneyPayouts')
      .withIndex('by_businessId_and_currency_and_state', (q) =>
        q
          .eq('businessId', businessId)
          .eq('currency', currency)
          .eq('state', 'transfer_pending'),
      )
      .take(2),
    ctx.db
      .query('moneyPayouts')
      .withIndex('by_businessId_and_currency_and_state', (q) =>
        q
          .eq('businessId', businessId)
          .eq('currency', currency)
          .eq('state', 'outcome_unknown'),
      )
      .take(2),
  ])
  const activeRows = [...pendingRows, ...unknownRows]
  if (activeRows.length > 1)
    return {
      kind: 'refused' as const,
      code: 'payout_reconciliation_required' as const,
    }
  const current =
    activeRows[0] ??
    (
      await ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_cadence_and_updatedAt', (q) =>
          q.eq('businessId', businessId).eq('currency', currency).eq('cadence', 'daily'),
        )
        .order('desc')
        .take(1)
    )[0]
  const zero = zeroExactAmount(provider.balance.currency, provider.balance.exponent)
  if (zero === undefined)
    return { kind: 'refused' as const, code: 'payout_not_ready' as const }
  const accountProjection =
    account === null
      ? {}
      : {
          accountState: account.state,
          stripeAccountId: account.stripeAccountId,
          ...(account.version === undefined
            ? {}
            : { accountVersion: account.version }),
          ...(account.lastStripeEventId === undefined
            ? {}
            : { lastStripeEventId: account.lastStripeEventId }),
          ...(account.lastStripePayloadDigest === undefined
            ? {}
            : { lastStripePayloadDigest: account.lastStripePayloadDigest }),
          ...(account.providerObjectDigest === undefined
            ? {}
            : { providerObjectDigest: account.providerObjectDigest }),
        }
  if (current === undefined)
    return {
      kind: 'ok' as const,
      businessId,
      accountState: account === null ? ('missing' as const) : account.state,
      ...accountProjection,
      providerNet: zero,
      minimumPayout: zero,
      evidence: 'source' as const,
    }
  const payout = payoutFromRow(current)
  if (
    payout === undefined ||
    current.businessId !== businessId ||
    current.currency !== currency ||
    current.exponent !== providerAccount.exponent ||
    current.providerAccountRef !== providerAccount.accountRef ||
    dailyPayoutIdentityFromRow(current) === undefined
  )
    return {
      kind: 'refused' as const,
      code: 'payout_reconciliation_required' as const,
    }
  return {
    kind: 'ok' as const,
    businessId,
    accountState: account === null ? ('missing' as const) : account.state,
    ...accountProjection,
    payoutState: current.state,
    payoutRef: current.payoutRef,
    ...(current.payoutCommandId === undefined
      ? {}
      : { payoutCommandId: current.payoutCommandId }),
    ...(current.idempotencyKey.length === 0
      ? {}
      : { idempotencyKey: current.idempotencyKey }),
    ...(current.stripeTransferId === undefined
      ? {}
      : { stripeTransferId: current.stripeTransferId }),
    ...(current.transferStatus === undefined
      ? {}
      : { transferStatus: current.transferStatus }),
    ...(current.providerRecoveryDeadlineAt === undefined
      ? {}
      : { providerRecoveryDeadlineAt: current.providerRecoveryDeadlineAt }),
    ...(current.state !== 'transfer_pending' &&
    current.state !== 'outcome_unknown'
      ? {}
      : current.stripeTransferId !== undefined
        ? { recoveryState: 'provider_id' as const }
        : current.providerRecoveryDeadlineAt !== undefined &&
            Date.now() < current.providerRecoveryDeadlineAt
          ? { recoveryState: 'idempotency_key' as const }
          : { recoveryState: 'admin_intervention' as const }),
    ...(current.destinationAccountId === undefined
      ? {}
      : { destinationAccountId: current.destinationAccountId }),
    ...(current.transferRequestDigest === undefined
      ? {}
      : { requestDigest: current.transferRequestDigest }),
    ...((current.transferReversalEvidenceDigest ??
      current.transferEvidenceDigest) === undefined
      ? {}
      : {
          evidenceDigest:
            current.transferReversalEvidenceDigest ??
            current.transferEvidenceDigest,
        }),
    ...(current.transferReversalEvidenceDigest === undefined
      ? {}
      : { reversalEvidenceDigest: current.transferReversalEvidenceDigest }),
    ...(payout.providerHeldBefore === undefined
      ? {}
      : { providerHeldBefore: payout.providerHeldBefore }),
    ...(payout.providerHeldAfter === undefined
      ? {}
      : { providerHeldAfter: payout.providerHeldAfter }),
    ...(payout.providerPaidBefore === undefined
      ? {}
      : { providerPaidBefore: payout.providerPaidBefore }),
    ...(payout.providerPaidAfter === undefined
      ? {}
      : { providerPaidAfter: payout.providerPaidAfter }),
    providerNet: payout.providerNet,
    minimumPayout: payout.minimumPayout,
    evidence: 'source' as const,
  }
}

async function readPayoutStatusForProviderAccount(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
  providerAccount: Doc<'moneyAccounts'>,
): Promise<PayoutStatusReadResult> {
  const account = await ctx.db
    .query('moneyPayoutAccounts')
    .withIndex('by_businessId_and_currency', (q) =>
      q.eq('businessId', businessId).eq('currency', currency),
    )
    .unique()
  return await readPayoutStatusForRows(
    ctx,
    businessId,
    currency,
    account,
    providerAccount,
  )
}

async function readPayoutStatusForBusiness(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
): Promise<PayoutStatusReadResult> {
  const [account, providerAccount] = await Promise.all([
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', businessId).eq('currency', currency),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', businessId).eq('currency', currency),
      )
      .unique(),
  ])
  return await readPayoutStatusForRows(
    ctx,
    businessId,
    currency,
    account,
    providerAccount,
  )
}

async function readOwnerProviderEarningsProjection(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  business: Doc<'businesses'>,
  currency: string | undefined,
) {
  const businessId = String(business._id)
  const accountRows = currency === undefined
    ? await ctx.db
        .query('moneyAccounts')
        .withIndex('by_businessId_and_currency', (q) => q.eq('businessId', businessId))
        .take(11)
    : await ctx.db
        .query('moneyAccounts')
        .withIndex('by_businessId_and_currency', (q) =>
          q.eq('businessId', businessId).eq('currency', currency),
        )
        .take(1)
  const providerAccountRows = accountRows.filter(
    (account) => account.accountKind === 'provider_earnings',
  )
  const providerAccounts = providerAccountRows.slice(0, 10)
  const accountResults = await Promise.all(
    providerAccounts.map(async (providerAccount) => {
      const [earnings, payout] = await Promise.all([
        readProviderEarningsForAccount(
          ctx,
          businessId,
          providerAccount.currency,
          providerAccount,
        ),
        readPayoutStatusForProviderAccount(
          ctx,
          businessId,
          providerAccount.currency,
          providerAccount,
        ),
      ])
      return earnings.kind === 'ok' && payout.kind === 'ok'
        ? { currency: providerAccount.currency, earnings, payout }
        : undefined
    }),
  )
  if (accountResults.some((account) => account === undefined))
    return { kind: 'error' as const, code: 'source_unavailable' as const }
  return {
    kind: 'available' as const,
    businessId,
    accounts: accountResults.filter((account) => account !== undefined),
    accountsTruncated: currency === undefined && providerAccountRows.length > 10,
  }
}

export async function readOwnerProviderEarningsHandler(
  ctx: QueryCtx,
  args: ReadOwnerProviderEarningsArgs,
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner')
    return { kind: 'error' as const, code: 'unauthenticated' as const }
  const owner = await ctx.db
    .query('owners')
    .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', actor.clerkUserId))
    .unique()
  if (owner === null) return { kind: 'not_found' as const }
  const business = await ctx.db
    .query('businesses')
    .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
    .order('desc')
    .first()
  if (business === null) return { kind: 'not_found' as const }
  return await readOwnerProviderEarningsProjection(ctx, business, args.currency)
}

export async function readAgentProviderEarningsHandler(
  ctx: MutationCtx,
  args: ReadAgentProviderEarningsArgs,
) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected')
    return { kind: 'error' as const, code: 'unauthenticated' as const }
  const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal)
  if (admission.kind !== 'allowed')
    return { kind: 'error' as const, code: 'unauthenticated' as const }
  const owner = await ctx.db
    .query('owners')
    .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', admission.ownerId))
    .unique()
  if (owner === null) return { kind: 'not_found' as const }
  const business = await ctx.db
    .query('businesses')
    .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
    .order('desc')
    .first()
  if (business === null) return { kind: 'not_found' as const }
  return await readOwnerProviderEarningsProjection(ctx, business, args.currency)
}

export async function readProviderEarningsHandler(
  ctx: QueryCtx,
  args: ReadProviderEarningsArgs,
) {
  return await readProviderEarningsForBusiness(ctx, args.businessId, args.currency)
}

export async function readPayoutStatusHandler(
  ctx: QueryCtx,
  args: ReadPayoutStatusArgs,
) {
  return await readPayoutStatusForBusiness(ctx, args.businessId, args.currency)
}
