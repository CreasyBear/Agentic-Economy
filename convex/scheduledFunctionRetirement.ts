import { v } from 'convex/values'

import { internal } from './_generated/api'
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

const RETIRE_BATCH = 200

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

    // Intentionally uses .take() on the base table without an index because
    // non-coinbase rows are being removed entirely and the table is bounded per batch.
    const entryRows = await ctx.db.query('marketExternalRegistryEntries').take(RETIRE_BATCH)
    for (const row of entryRows) {
      if (row.source === 'coinbase') continue
      entries += 1
      if (!dryRun) await ctx.db.delete(row._id)
    }
    if (entryRows.length === RETIRE_BATCH) {
      // More rows may remain; continue in a fresh transaction.
      if (!dryRun) await ctx.scheduler.runAfter(0, internal.scheduledFunctionRetirement.retireRegistrySources, {})
      return { entries, generations, stateRows, snapshots, continued: true }
    }

    for (const row of await ctx.db.query('marketExternalRegistryGenerations').collect()) {
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
