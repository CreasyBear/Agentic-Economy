import type { PaginationOptions, PaginationResult } from 'convex/server'
import { v, type ObjectType } from 'convex/values'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import type { AdminPurchaseRow } from '@/lib/operator/admin-console/activity'
import { callFundingValue, classifyCallFunding } from '@/modules/observability/public'
import type { Doc } from '../../../_generated/dataModel'
import { env, type QueryCtx } from '../../../_generated/server'

export const activityFilterArgs = {
  from: v.number(), toExclusive: v.number(), account: v.optional(v.string()),
  status: v.union(v.literal('all'), v.literal('completed'), v.literal('pending'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('refunded')),
  funding: v.union(v.literal('all'), v.literal('customer'), v.literal('promotional'), v.literal('unclassified')),
}
export const adminPurchaseRowValue = v.object({
  callRef: v.string(), accountRef: v.string(), accountName: v.union(v.string(), v.null()),
  toolRef: v.string(), toolName: v.union(v.string(), v.null()), providerRef: v.union(v.string(), v.null()),
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
  paymentState: v.union(v.string(), v.null()),
  amount: v.union(v.null(), v.object({ currency: v.string(), exponent: v.number(), units: v.string() })),
  funding: callFundingValue,
  createdAt: v.number(), updatedAt: v.number(),
  recovery: v.union(v.null(), v.object({ disposition: v.string(), nextAttemptAt: v.number(), reason: v.string() })),
  refusalCode: v.union(v.string(), v.null()),
})

type Filters = ObjectType<typeof activityFilterArgs>

/** Requires admin admission by the registration and a bounded valid time window.
 * Ensures one native source page, explicit environment and redacted purchase context.
 * Invariant: never exposes input/output payloads or dispatches recovery.
 * On violation: reject invalid windows/configuration; filtered empty pages retain their cursor. */
export async function listAdminPurchaseActivity(ctx: QueryCtx, args: Filters & { paginationOpts: PaginationOptions }): Promise<PaginationResult<AdminPurchaseRow>> {
  if (!Number.isSafeInteger(args.from) || !Number.isSafeInteger(args.toExclusive) || args.from < 0
    || args.toExclusive <= args.from || args.toExclusive - args.from > 90 * 86_400_000
    || (args.account !== undefined && (args.account.length === 0 || args.account.length > 200))) throw new Error('admin_activity_filter_invalid')
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) throw new Error('admin_activity_environment_unavailable')
  const account = args.account
  const paginationOpts = { ...args.paginationOpts, numItems: Math.min(50, args.paginationOpts.numItems) }
  const result = account === undefined
    ? await ctx.db.query('capabilityCalls')
        .withIndex('by_environment_and_createdAt', q => q.eq('environment', environment).gte('createdAt', args.from).lt('createdAt', args.toExclusive))
        .order('desc').paginate(paginationOpts)
    : await ctx.db.query('capabilityCalls')
        .withIndex('by_ownerId_and_environment_and_createdAt', q => q.eq('ownerId', account).eq('environment', environment).gte('createdAt', args.from).lt('createdAt', args.toExclusive))
        .order('desc').paginate(paginationOpts)
  const matching = result.page.filter(call => {
    if (args.status === 'refunded' ? call.usage?.chargeState !== 'refunded'
      : args.status !== 'all' && call.state !== args.status) return false
    const funding = classifyCallFunding(call)
    return args.funding === 'all'
      || (args.funding === 'unclassified' && funding.kind === 'unclassified')
      || ((funding.kind === 'settled' || (args.status === 'refunded' && funding.kind === 'refunded')) && (args.funding === 'customer' ? BigInt(funding.purchasedUnits) > 0n
        : args.funding === 'promotional' && BigInt(funding.promotionalUnits) > 0n))
  })
  return { ...result, page: await Promise.all(matching.map(call => purchaseRow(ctx, call))) }
}

export async function purchaseRow(ctx: QueryCtx, call: Doc<'capabilityCalls'>): Promise<AdminPurchaseRow> {
  const [account, projection] = await Promise.all([
    ctx.db.query('accounts').withIndex('by_accountRef', q => q.eq('accountRef', call.ownerId)).unique(),
    ctx.db.query('capabilityCallProjections').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique(),
  ])
  return {
    callRef: call.callRef, accountRef: call.ownerId, accountName: account?.displayName ?? null,
    toolRef: call.toolRef, toolName: projection?.toolLabel ?? null, providerRef: projection?.providerRef ?? null,
    environment: call.environment, state: call.state, paymentState: call.usage?.chargeState ?? null,
    amount: call.usage?.amount ?? null, funding: classifyCallFunding(call),
    createdAt: call.createdAt, updatedAt: call.updatedAt,
    recovery: call.reconciliation === undefined ? null : {
      disposition: call.reconciliation.disposition, nextAttemptAt: call.reconciliation.nextAttemptAt,
      reason: call.reconciliation.reason,
    },
    refusalCode: call.result?.kind === 'refused' ? call.result.code : null,
  }
}
