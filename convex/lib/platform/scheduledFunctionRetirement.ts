import { v, type Infer } from 'convex/values'

import type { MutationCtx } from '../../_generated/server'

export const cancelByNameArgs = v.object({ names: v.array(v.string()), newest: v.optional(v.number()) })
export const cancelByNameResult = v.object({
  scanned: v.number(),
  cancelled: v.number(),
  byName: v.record(v.string(), v.number()),
})

/** Cancels pending scheduled functions by name before a deploy retires them. */
export async function cancelByNameHandler(ctx: MutationCtx, args: Infer<typeof cancelByNameArgs>) {
  const wanted = new Set(args.names)
  const byName: Record<string, number> = {}
  let cancelled = 0
  // Newest-first, bounded: a self-rescheduling loop leaves its live job at the head
  // and thousands of completed rows behind it, which an unbounded scan cannot read.
  const jobs = await ctx.db.system
    .query('_scheduled_functions')
    .order('desc')
    .take(args.newest ?? 1000)
  for (const job of jobs) {
    if (job.state.kind !== 'pending' && job.state.kind !== 'inProgress') continue
    if (!wanted.has(job.name)) continue
    await ctx.scheduler.cancel(job._id)
    cancelled += 1
    byName[job.name] = (byName[job.name] ?? 0) + 1
  }
  return { scanned: jobs.length, cancelled, byName }
}
