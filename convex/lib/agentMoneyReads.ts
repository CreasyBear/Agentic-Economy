import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import type { MutationCtx } from '../_generated/server'
import {
  agentAccessPrincipalValue,
  verifyMarketAgentPrincipal,
} from '../agentAccessPrincipals'
import { accountFromRow } from '../moneyCanonicalAccounts'
import { exactAmount } from '../moneyLedgerValues'
import { requireSourceWrite, sourceWriteArgs } from '../sourceWriteAdmission'
import { amountFromParts } from '@/modules/money/public'

const agentMoneyRequestFields = {
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

const balanceArgsValue = v.object({
  currency: v.string(),
  ...agentMoneyRequestFields,
})
export const agentBalanceArgs = balanceArgsValue.fields

export const agentBalanceResult = v.union(
  v.object({
    kind: v.literal('available'),
    principalRef: v.string(),
    accountRef: v.string(),
    balance: exactAmount,
    recoveryDue: exactAmount,
    accountState: v.union(v.literal('active'), v.literal('locked')),
    version: v.number(),
    updatedAt: v.number(),
    funding: v.object({
      kind: v.literal('owner_browser_required'),
      path: v.literal('/owner/credit'),
      anchor: v.literal('fund'),
    }),
  }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('error'), code: v.literal('source_unavailable') }),
)

const activityValue = v.object({
  activityRef: v.string(),
  credentialId: v.string(),
  serviceRef: v.string(),
  offeringRef: v.string(),
  businessId: v.string(),
  operationKey: v.string(),
  invocationRef: v.string(),
  attemptRef: v.string(),
  grossAmount: exactAmount,
  chargeState: v.union(
    v.literal('free_tier'),
    v.literal('paid'),
    v.literal('insufficient_credit'),
    v.literal('outcome_unknown'),
    v.literal('refunded'),
  ),
  priceDigest: v.string(),
  observedAt: v.number(),
  transactionRef: v.optional(v.string()),
})

const activityArgsValue = v.object({
  currency: v.string(),
  paginationOpts: paginationOptsValidator,
  ...agentMoneyRequestFields,
})
export const agentActivityArgs = activityArgsValue.fields

export const agentActivityResult = v.union(
  v.object({ kind: v.literal('available'), activity: paginationResultValidator(activityValue) }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('error'), code: v.literal('source_unavailable') }),
)

type AgentMoneyRequest = Readonly<{
  agentPrincipal: Infer<typeof agentAccessPrincipalValue>
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}>

async function admitAgentMoneyRead(
  ctx: MutationCtx,
  args: AgentMoneyRequest,
): Promise<Awaited<ReturnType<typeof verifyMarketAgentPrincipal>> | null> {
  const source = await requireSourceWrite(ctx, args, 'billing')
  if (source.kind === 'rejected') return null
  return await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
}

export async function readAgentBalanceHandler(
  ctx: MutationCtx,
  args: Infer<typeof balanceArgsValue>,
): Promise<Infer<typeof agentBalanceResult>> {
  const admission = await admitAgentMoneyRead(ctx, args)
  if (admission?.kind !== 'allowed') return { kind: 'error', code: 'unauthenticated' }
  const row = await ctx.db.query('moneyAccounts')
    .withIndex('by_accountId_and_currency', (query) => query
      .eq('accountId', admission.ownerId)
      .eq('currency', args.currency))
    .unique()
  if (row === null) return { kind: 'not_found' }
  const account = accountFromRow(row)
  if (account === undefined || account.accountKind !== 'operator_credit') {
    return { kind: 'error', code: 'source_unavailable' }
  }
  return {
    kind: 'available',
    principalRef: admission.principalId,
    accountRef: admission.ownerId,
    balance: account.balance,
    recoveryDue: account.recoveryDue,
    accountState: account.state,
    version: account.version,
    updatedAt: account.updatedAt,
    funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
  }
}

export async function listAgentActivityHandler(
  ctx: MutationCtx,
  args: Infer<typeof activityArgsValue>,
): Promise<Infer<typeof agentActivityResult>> {
  const admission = await admitAgentMoneyRead(ctx, args)
  if (admission?.kind !== 'allowed') return { kind: 'error', code: 'unauthenticated' }
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) {
    return { kind: 'error', code: 'source_unavailable' }
  }
  const page = await ctx.db.query('moneyUsageEvents')
    .withIndex('by_principalId_and_credentialId_and_currency_and_observedAt', (query) => query
      .eq('principalId', admission.principalId)
      .eq('credentialId', args.agentPrincipal.credentialId)
      .eq('currency', args.currency))
    .order('desc')
    .paginate(args.paginationOpts)
  const projected = page.page.map((row) => {
    const grossAmount = amountFromParts(row.currency, row.amountUnits, row.exponent)
    return grossAmount === undefined
      ? undefined
      : {
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
          ...(row.transactionRef === undefined ? {} : { transactionRef: row.transactionRef }),
        }
  })
  if (projected.some((item) => item === undefined)) return { kind: 'error', code: 'source_unavailable' }
  return {
    kind: 'available',
    activity: { ...page, page: projected.filter((item) => item !== undefined) },
  }
}
