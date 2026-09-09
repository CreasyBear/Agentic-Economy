import { v } from 'convex/values'

import { internalMutation } from './_generated/server'

/**
 * Cancels pending scheduled functions by name before a deploy retires them.
 * Auditable alternative to the dashboard: returns counts for the closeout.
 */
export const cancelByName = internalMutation({
  args: { names: v.array(v.string()) },
  returns: v.object({
    scanned: v.number(),
    cancelled: v.number(),
    byName: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
    const wanted = new Set(args.names)
    const byName: Record<string, number> = {}
    let scanned = 0
    let cancelled = 0
    for await (const job of ctx.db.system.query('_scheduled_functions')) {
      scanned += 1
      if (job.state.kind !== 'pending' && job.state.kind !== 'inProgress') continue
      if (!wanted.has(job.name)) continue
      await ctx.scheduler.cancel(job._id)
      cancelled += 1
      byName[job.name] = (byName[job.name] ?? 0) + 1
    }
    return { scanned, cancelled, byName }
  },
})
