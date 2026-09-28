import { v } from 'convex/values'
import { fetchCoinbaseReferenceRate } from '@/modules/money/reference-rate'
import { validReferenceRate } from '@/modules/money/public'
import { internal } from './_generated/api'
import { internalAction, internalMutation, internalQuery, query, type ActionCtx } from './_generated/server'
import { readReferenceRate } from './lib/money/referenceRate/store'

const rateValue = v.object({
  source: v.literal('coinbase'), base: v.literal('USDC'), quote: v.literal('AUD'),
  rate: v.string(), fetchedAt: v.number(),
})

/** Read-only projection shared by browser-facing server routes; absence means no fresh price. */
export const current = query({
  args: {}, returns: v.union(rateValue, v.null()),
  handler: async (ctx) => await readReferenceRate(ctx.db, Date.now()),
})
export const currentInternal = internalQuery({
  args: {}, returns: v.union(rateValue, v.null()),
  handler: async (ctx) => await readReferenceRate(ctx.db, Date.now()),
})


export const persist = internalMutation({
  args: { rate: rateValue }, returns: v.null(),
  handler: async (ctx, { rate }) => {
    if (!validReferenceRate(rate) || rate.fetchedAt > Date.now()) throw new Error('reference_rate_invalid')
    const existing = await ctx.db.query('moneyReferenceRates')
      .withIndex('by_pair', (q) => q.eq('pair', 'USDC/AUD')).unique()
    if (existing === null) await ctx.db.insert('moneyReferenceRates', {
      pair: 'USDC/AUD', rate: rate.rate, fetchedAt: rate.fetchedAt,
    })
    else if (existing.fetchedAt < rate.fetchedAt) await ctx.db.patch(existing._id, {
      rate: rate.rate, fetchedAt: rate.fetchedAt,
    })
    return null
  },
})

/** Failed refresh never modifies the last-good observation. */
export const run = internalAction({
  handler: async (ctx: ActionCtx): Promise<null> => {
    const rate = await fetchCoinbaseReferenceRate()
    if (rate !== undefined) await ctx.runMutation(internal.referenceRateRefresh.persist, { rate })
    return null
  },
})
