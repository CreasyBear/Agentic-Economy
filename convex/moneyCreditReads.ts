import type { PaginationOptions } from 'convex/server'

import type { QueryCtx } from './_generated/server'
import { ownerPrincipalAllowed } from './moneyBillingAuthorization'
import { accountFromRow } from './moneyCanonicalAccounts'
import {
  amountFromParts,
  zeroExactAmount,
  type CreditActivityView,
} from '../src/modules/money/public'

export type ReadCreditAccountInput = Readonly<{
  principalId: string
  currency: string
}>

export type ListCreditActivityInput = Readonly<{
  principalId: string
  credentialId: string
  currency: string
  paginationOpts: PaginationOptions
}>

export type ReadKeyUsageInput = Readonly<{
  principalId: string
  credentialId: string
  currency: string
}>

export async function readCreditAccountHandler(
  ctx: QueryCtx,
  args: ReadCreditAccountInput,
) {
  const identity = await ctx.auth.getUserIdentity()
  if (
    !(await ownerPrincipalAllowed(
      identity,
      args.principalId,
      async () =>
        await ctx.db
          .query('agentAccessPrincipals')
          .withIndex('by_principalId', (q) =>
            q.eq('principalId', args.principalId),
          )
          .unique(),
    ))
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
    }
  const principal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (q) =>
      q.eq('principalId', args.principalId),
    )
    .unique()
  if (principal === null)
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
    }
  const account = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountId_and_currency', (q) =>
      q.eq('accountId', principal.ownerId).eq('currency', args.currency),
    )
    .unique()
  const accountDomain = account === null ? undefined : accountFromRow(account)
  if (account === null || accountDomain === undefined)
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
    }
  const threshold = zeroExactAmount(account.currency, account.exponent)
  if (threshold === undefined)
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
    }
  return {
    kind: 'ok' as const,
    principalId: args.principalId,
    accountId: principal.ownerId,
    balance: accountDomain.balance,
    autoRecharge: { enabled: false, threshold, rechargeAmount: threshold },
    evidence: 'source' as const,
  }
}

export async function listCreditActivityHandler(
  ctx: QueryCtx,
  args: ListCreditActivityInput,
) {
  const identity = await ctx.auth.getUserIdentity()
  if (
    !(await ownerPrincipalAllowed(
      identity,
      args.principalId,
      async () =>
        await ctx.db
          .query('agentAccessPrincipals')
          .withIndex('by_principalId', (q) =>
            q.eq('principalId', args.principalId),
          )
          .unique(),
    ))
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing' as const,
      items: [] as const,
    }
  const page = await ctx.db
    .query('moneyUsageEvents')
    .withIndex(
      'by_principalId_and_credentialId_and_currency_and_observedAt',
      (q) =>
        q
          .eq('principalId', args.principalId)
          .eq('credentialId', args.credentialId)
          .eq('currency', args.currency),
    )
    .order('desc')
    .paginate(args.paginationOpts)
  const items: CreditActivityView[] = []
  for (const row of page.page) {
    const grossAmount = amountFromParts(
      row.currency,
      row.amountUnits,
      row.exponent,
    )
    if (grossAmount === undefined)
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        items: [] as const,
      }
    items.push({
      activityRef: row.usageRef,
      credentialId: row.credentialId,
      serviceRef: row.serviceRef,
      offeringRef: row.offeringRef,
      businessId: row.businessId,
      operationKey: row.operationKey,
      invocationRef: row.invocationRef,
      attemptRef: row.attemptRef,
      grossAmount,
      chargeState: row.chargeState,
      priceDigest: row.priceDigest,
      observedAt: row.observedAt,
      ...(row.transactionRef === undefined
        ? {}
        : { transactionRef: row.transactionRef }),
    })
  }
  return {
    kind: 'ok' as const,
    page: items,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  }
}

export async function readKeyUsageHandler(
  ctx: QueryCtx,
  args: ReadKeyUsageInput,
) {
  const identity = await ctx.auth.getUserIdentity()
  if (
    !(await ownerPrincipalAllowed(
      identity,
      args.principalId,
      async () =>
        await ctx.db
          .query('agentAccessPrincipals')
          .withIndex('by_principalId', (q) =>
            q.eq('principalId', args.principalId),
          )
          .unique(),
    ))
  )
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing',
      items: [] as const,
    }
  const [principal, summary] = await Promise.all([
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (q) =>
        q.eq('principalId', args.principalId),
      )
      .unique(),
    ctx.db
      .query('moneyCredentialUsageSummaries')
      .withIndex('by_principalId_and_credentialId_and_currency', (q) =>
        q
          .eq('principalId', args.principalId)
          .eq('credentialId', args.credentialId)
          .eq('currency', args.currency),
      )
      .unique(),
  ])
  const account =
    principal === null
      ? null
      : await ctx.db
          .query('moneyAccounts')
          .withIndex('by_accountId_and_currency', (q) =>
            q.eq('accountId', principal.ownerId).eq('currency', args.currency),
          )
          .unique()
  const exponent = summary?.exponent ?? account?.exponent
  if (exponent === undefined)
    return {
      kind: 'refused' as const,
      code: 'billing_identity_missing',
      items: [] as const,
    }
  const grossSpend =
    summary === null
      ? zeroExactAmount(args.currency, exponent)
      : amountFromParts(
          summary.currency,
          summary.grossSpendUnits,
          summary.exponent,
        )
  if (grossSpend === undefined)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required',
      items: [] as const,
    }
  return {
    kind: 'ok' as const,
    credentialId: args.credentialId,
    callCount: summary?.callCount ?? 0,
    paidCallCount: summary?.paidCallCount ?? 0,
    freeCallCount: summary?.freeCallCount ?? 0,
    grossSpend,
    states: summary?.states ?? [],
  }
}
