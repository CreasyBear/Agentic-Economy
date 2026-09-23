import { v } from 'convex/values'
import { resolveBusinessActor } from './authz'
import { InteractiveAuthorityError } from './interactiveAuthority'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'

const NON_NEGATIVE_UNITS_PATTERN = /^\d+$/u
const AUD_MINIMUM_PAYOUT_UNITS = 10_000_000n

async function requireOwnerBusinessForCurrency(
  ctx: Pick<QueryCtx, 'db' | 'auth'> | Pick<MutationCtx, 'db' | 'auth' | 'scheduler'>,
  businessId: string,
  currency: string,
): Promise<void> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const businesses = await ctx.db
    .query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (q) =>
      q.eq('owningAccountRef', actor.canonicalAccountRef),
    )
    .order('desc')
    .take(20)
  if (!businesses.some((business) => String(business._id) === businessId)) {
    throw new InteractiveAuthorityError('account_access_missing')
  }
  if (currency !== 'AUD') {
    throw new InteractiveAuthorityError('authority_fact_invalid')
  }
}

function assertMinimumPayoutUnits(currency: string, minimumPayoutUnits: string): void {
  if (!NON_NEGATIVE_UNITS_PATTERN.test(minimumPayoutUnits)) {
    throw new Error('Invalid minimum payout units.')
  }
  if (currency === 'AUD' && BigInt(minimumPayoutUnits) < AUD_MINIMUM_PAYOUT_UNITS) {
    throw new Error('Minimum payout threshold must be at least A$10.00.')
  }
}

const payoutPreferencesValue = v.union(
  v.object({
    kind: v.literal('configured'),
    businessId: v.string(),
    currency: v.string(),
    minimumPayoutUnits: v.string(),
    schedule: v.union(v.literal('monthly'), v.literal('weekly'), v.literal('manual')),
    revision: v.number(),
  }),
  v.object({
    kind: v.literal('default'),
    businessId: v.string(),
    currency: v.string(),
    minimumPayoutUnits: v.string(),
    schedule: v.union(v.literal('monthly'), v.literal('weekly'), v.literal('manual')),
    revision: v.literal(0),
  }),
)

export type PayoutPreferencesRead =
  | Readonly<{
      kind: 'configured'
      businessId: string
      currency: string
      minimumPayoutUnits: string
      schedule: 'monthly' | 'weekly' | 'manual'
      revision: number
    }>
  | Readonly<{
      kind: 'default'
      businessId: string
      currency: string
      minimumPayoutUnits: string
      schedule: 'monthly' | 'weekly' | 'manual'
      revision: 0
    }>

export const readPayoutPreferences = query({
  args: {
    businessId: v.string(),
    currency: v.string(),
  },
  returns: payoutPreferencesValue,
  handler: async (ctx: QueryCtx, args): Promise<PayoutPreferencesRead> => {
    await requireOwnerBusinessForCurrency(ctx, args.businessId, args.currency)
    const existing = await ctx.db
      .query('moneySupplierPreferences')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .first()

    if (!existing) {
      return {
        kind: 'default',
        businessId: args.businessId,
        currency: args.currency,
        minimumPayoutUnits: '50000000', // Default A$50.00
        schedule: 'monthly',
        revision: 0,
      }
    }

    return {
      kind: 'configured',
      businessId: existing.businessId,
      currency: existing.currency,
      minimumPayoutUnits: existing.minimumPayoutUnits,
      schedule: existing.schedule,
      revision: existing.revision,
    }
  },
})

export const configurePayoutPreferences = mutation({
  args: {
    businessId: v.string(),
    currency: v.string(),
    minimumPayoutUnits: v.string(),
    schedule: v.union(v.literal('monthly'), v.literal('weekly'), v.literal('manual')),
    expectedRevision: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal('updated'), revision: v.number() }),
    v.object({ kind: v.literal('conflict'), currentRevision: v.number() }),
  ),
  handler: async (ctx: MutationCtx, args) => {
    await requireOwnerBusinessForCurrency(ctx, args.businessId, args.currency)
    assertMinimumPayoutUnits(args.currency, args.minimumPayoutUnits)

    const existing = await ctx.db
      .query('moneySupplierPreferences')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .first()

    const currentRevision = existing?.revision ?? 0
    if (args.expectedRevision !== currentRevision) {
      return { kind: 'conflict' as const, currentRevision }
    }

    const now = Date.now()
    const nextRevision = currentRevision + 1

    if (existing) {
      await ctx.db.patch(existing._id, {
        minimumPayoutUnits: args.minimumPayoutUnits,
        schedule: args.schedule,
        revision: nextRevision,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('moneySupplierPreferences', {
        businessId: args.businessId,
        currency: args.currency,
        minimumPayoutUnits: args.minimumPayoutUnits,
        schedule: args.schedule,
        revision: nextRevision,
        createdAt: now,
        updatedAt: now,
      })
    }

    return { kind: 'updated' as const, revision: nextRevision }
  },
})
