import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'

/**
 * Cancels pending scheduled functions by name before a deploy retires them.
 * Auditable alternative to the dashboard: returns counts for the closeout.
 */
export const cancelByName = internalMutation({
  args: { names: v.array(v.string()), newest: v.optional(v.number()) },
  returns: v.object({
    scanned: v.number(),
    cancelled: v.number(),
    byName: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
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
  },
})

const RETIRE_BATCH = 200
const RETIRED_SOURCES = ['agentic_market', 'treg'] as const

/**
 * One-time cutover for Well 0: removes rows the retired Agentic Market and
 * Treg ingest paths wrote, so the schema can be tightened to Coinbase only.
 * Batched with scheduler continuation per convex guidelines; idempotent (a
 * second run deletes zero). Returns per-table counts for the closeout.
 */
export const retireRegistrySources = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    entries: v.number(),
    generations: v.number(),
    stateRows: v.number(),
    snapshots: v.number(),
    continued: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun === true
    let entries = 0
    let generations = 0
    let stateRows = 0
    let snapshots = 0

    // Walk retired sources by index per generation so kept coinbase rows never
    // stall the batch (a raw .take() would return the same 200 kept rows forever).
    const generationRows = await ctx.db.query('marketExternalRegistryGenerations').collect()
    for (const generationRow of generationRows) {
      for (const source of RETIRED_SOURCES) {
        const entryRows = await ctx.db
          .query('marketExternalRegistryEntries')
          .withIndex('by_generation_source_and_documentId', (q) =>
            q.eq('generation', generationRow.generation).eq('source', source),
          )
          .take(RETIRE_BATCH)
        entries += entryRows.length
        if (!dryRun) for (const row of entryRows) await ctx.db.delete(row._id)
        if (entryRows.length === RETIRE_BATCH) {
          // More rows may remain; continue in a fresh transaction.
          if (!dryRun) await ctx.scheduler.runAfter(0, internal.scheduledFunctionRetirement.retireRegistrySources, {})
          return { entries, generations, stateRows, snapshots, continued: true }
        }
      }
    }

    for (const row of generationRows) {
      if (row.source === 'coinbase') continue
      generations += 1
      if (!dryRun) await ctx.db.delete(row._id)
    }
    for (const row of await ctx.db.query('marketExternalRegistryState').collect()) {
      if (row.key === 'coinbase') continue
      stateRows += 1
      if (!dryRun) await ctx.db.delete(row._id)
    }
    for (const row of await ctx.db.query('marketExternalSnapshots').collect()) {
      snapshots += 1
      if (!dryRun) await ctx.db.delete(row._id)
    }
    return { entries, generations, stateRows, snapshots, continued: false }
  },
})
