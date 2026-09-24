import { v, type Infer } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'

export const readReservationArgs = v.object({ callRef: v.string() })
export const readReservationResult = v.union(v.object({
    reservationRef: v.string(),
    quoteRef: v.string(),
    decisionAudUnits: v.string(),
    sourceUsdcUnits: v.optional(v.string()),
    journalTransactionRef: v.string(),
    treasuryReservationRef: v.optional(v.string()),
    state: v.string(),
  }), v.null())
export const readReservationHandler = async (ctx: QueryCtx, args: Infer<typeof readReservationArgs>) => {
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (call === null
      || call.quoteRef === undefined
      || call.formanceReservationRefs === undefined) return null
    const quoteRef = call.quoteRef
    const quote = await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', (query) => query.eq('quoteRef', quoteRef))
      .unique()
    if (quote === null) return null
    const [audRef, usdcRef] = call.formanceReservationRefs
    if (audRef === undefined || usdcRef === undefined) return null
    return {
      reservationRef: audRef,
      quoteRef: quote.quoteRef,
      decisionAudUnits: quote.decisionAudUnits,
      ...(quote.sourceUsdcUnits === undefined ? {} : { sourceUsdcUnits: quote.sourceUsdcUnits }),
      journalTransactionRef: audRef,
      treasuryReservationRef: usdcRef,
      state: call.formanceFinancialState ?? 'reservation_pending',
    }
  }
