import { v } from 'convex/values'
import { identifier, serverFunctionAuth } from '../../../moneyLedgerValues'
import { connectAccountViewValue } from './contracts'
import type { CustomerRequestServiceAssertion } from '../../../../src/modules/agent-access/service-auth-envelope'
import { env, type QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { verifyCustomerRequestServiceAssertion } from '../../../../src/modules/agent-access/service-auth-envelope'
import { payoutAccountView } from './view-mapping'

export type ReadPayoutAccountByStripeIdArgs = {
  stripeAccountId: string
  serviceAuth?: CustomerRequestServiceAssertion
}

export type ReadOwnerPayoutAccountArgs = {
  businessId: string
  currency: string
}

export const payoutBindingViewValue = v.object({
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  stripeAccountId: identifier,
  lastStripeEventId: v.optional(identifier),
  version: v.optional(v.number()),
})
export const payoutAccountReadResultValue = v.union(connectAccountViewValue, v.null())
export const readPayoutAccountByStripeIdArgs = {
  stripeAccountId: identifier,
  serviceAuth: v.optional(serverFunctionAuth),
}

export const readOwnerPayoutAccountArgs = { businessId: identifier, currency: identifier }
export const readPayoutAccountByStripeIdForWorkerArgs = { stripeAccountId: identifier }
export const payoutBindingListValue = v.array(payoutBindingViewValue)


const PAYOUT_BINDING_LOOKUP_OPERATION =
  'moneyLedger:readPayoutAccountByStripeId'
const PAYOUT_BINDING_LOOKUP_SCOPE = 'money:payout_binding_read'

async function payoutBindingLookupAuthorized(
  serviceAuth: CustomerRequestServiceAssertion | undefined,
  stripeAccountId: string,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (
    serviceAuth === undefined ||
    key === undefined ||
    key.length < 32 ||
    !serviceAuth.scopes.includes(PAYOUT_BINDING_LOOKUP_SCOPE)
  )
    return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: PAYOUT_BINDING_LOOKUP_OPERATION,
    command: { stripeAccountId },
    assertion: serviceAuth,
  })
}

export async function readPayoutAccountByStripeIdHandler(
  ctx: QueryCtx,
  args: ReadPayoutAccountByStripeIdArgs,
) {
  if (
    !(await payoutBindingLookupAuthorized(
      args.serviceAuth,
      args.stripeAccountId,
    ))
  )
    return []
  return (
    await ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_stripeAccountId', (q) =>
        q.eq('stripeAccountId', args.stripeAccountId),
      )
      .take(20)
  ).map(
    ({
      businessId,
      currency,
      exponent,
      stripeAccountId,
      lastStripeEventId,
      version,
    }) => ({
      businessId,
      currency,
      exponent,
      stripeAccountId,
      ...(lastStripeEventId === undefined ? {} : { lastStripeEventId }),
      ...(version === undefined ? {} : { version }),
    }),
  )
}

export async function readPayoutAccountByStripeIdForWorkerHandler(
  ctx: QueryCtx,
  args: { stripeAccountId: string },
) {
  const stripeAccountId = args.stripeAccountId
  return (
    await ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_stripeAccountId', (q) => q.eq('stripeAccountId', stripeAccountId))
      .take(20)
  ).map(({ businessId, currency, exponent, stripeAccountId: boundStripeAccountId, lastStripeEventId, version }) => ({
    businessId,
    currency,
    exponent,
    stripeAccountId: boundStripeAccountId,
    ...(lastStripeEventId === undefined ? {} : { lastStripeEventId }),
    ...(version === undefined ? {} : { version }),
  }))
}

export async function readOwnerPayoutAccountHandler(
  ctx: QueryCtx,
  args: ReadOwnerPayoutAccountArgs,
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const businesses = await ctx.db
    .query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (q) => q.eq('owningAccountRef', actor.canonicalAccountRef))
    .order('desc')
    .take(20)
  if (
    !businesses.some((business) => String(business._id) === args.businessId)
  )
    return null
  const account = await ctx.db
    .query('moneyPayoutAccounts')
    .withIndex('by_businessId_and_currency', (q) =>
      q.eq('businessId', args.businessId).eq('currency', args.currency),
    )
    .unique()
  return account === null ? null : payoutAccountView(account)
}
