import { start } from '@convex-dev/workflow'
import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from '../../platform/workloadCron/context'
import { reconcileWorkloadCronSnapshot } from '../../platform/workloadCron/admission'
import { ANALYTICS_VERSION } from './analytics'
import { indexedSourceValue, progressValue, type IndexProgress } from './contracts'
import { DIRECTORY_INDEX_PAGE_SIZE, writeSource, type WriteOutcome } from './ingestion'
import { directoryGeneration, directoryState } from './rows'

async function authorize(ctx: MutationCtx, workload: Parameters<typeof parseWorkloadCronSnapshot>[0]) {
  await reconcileWorkloadCronSnapshot(ctx, 'refresh Agentic Economy API registry', parseWorkloadCronSnapshot(workload))
}

/**
 * Well 8 Lane B: one live generation, updated in place. `begin` no longer
 * mints a fresh generation when an active one already exists - it reuses
 * `state.activeGeneration`, resets that generation row's per-run cursor and
 * reports, and records the run's start time on `marketExternalRegistryState.
 * runStartedAt` (threaded through to every touched row's `lastSeenRunAt`,
 * and to the removal sweep's staleness threshold). Only the very first ever
 * run (no `activeGeneration` yet) mints a new generation id.
 */
export const beginArgs = v.object({ startedAt: v.number(), workload: workloadCronSnapshotValue })
export const beginReturns = v.object({ kind: v.union(v.literal('started'), v.literal('refreshing')), generation: v.string() })
export const beginHandler = async (ctx: MutationCtx, args: Infer<typeof beginArgs>): Promise<{ kind: 'started' | 'refreshing'; generation: string }> => {
    await authorize(ctx, args.workload)
    if (!Number.isSafeInteger(args.startedAt)) throw new Error('directory_generation_invalid')
    const state = await directoryState(ctx)
    if (state?.refreshGeneration !== undefined) {
      const previous = await directoryGeneration(ctx, state.refreshGeneration)
      if (previous?.status === 'refreshing') return { kind: 'refreshing', generation: previous.generation }
    }
    const generation = state?.activeGeneration ?? `coinbase-${args.startedAt}-${crypto.randomUUID()}`
    if (!/^coinbase-[a-zA-Z0-9-]{1,100}$/u.test(generation)) throw new Error('directory_generation_invalid')
    const existingRow = await directoryGeneration(ctx, generation)
    if (existingRow === null) {
      await ctx.db.insert('marketExternalRegistryGenerations', {
        generation, source: 'coinbase', status: 'refreshing', startedAt: args.startedAt,
        ingestedCount: 0, nextOffset: 0, pageItemCursor: 0, pagesFetched: 0, observations: 0, duplicateObservations: 0, terminalObserved: false, analyticsVersion: ANALYTICS_VERSION,
      })
    } else {
      // Reuse in place: reset this run's cursor/report fields; `ingestedCount`
      // (the live row total) and `terminalObserved` (sticky "has ever
      // completed" flag read by activeDirectoryGeneration) are NOT reset, so
      // reads stay served from the last-good state for the run's whole
      // duration - there is no spare "previous complete generation" anymore.
      // Preserve completedAt too: only a terminal page may advance evidence
      // of a completed scan; retries and failed refreshes keep its true age.
      await ctx.db.patch(existingRow._id, {
        status: 'refreshing', startedAt: args.startedAt, nextOffset: 0, pageItemCursor: 0,
        pagesFetched: 0, observations: 0, duplicateObservations: 0,
        sourceReportedInitial: undefined, sourceReportedLatest: undefined, sourceReportedMinimum: undefined, sourceReportedMaximum: undefined,
        failedAt: undefined, failureReason: undefined,
      })
    }
    const next = {
      key: 'coinbase' as const, activeGeneration: generation, refreshGeneration: generation,
      runStartedAt: args.startedAt, lastAttemptAt: args.startedAt, lastAttemptStatus: 'refreshing' as const,
    }
    if (state === null) await ctx.db.insert('marketExternalRegistryState', next)
    else await ctx.db.replace(state._id, next)
    await start(ctx, internal.x402DirectoryIndexRefresh.scan, { generation, workload: args.workload, runStartedAt: args.startedAt }, {
      startAsync: true, onComplete: internal.x402DirectoryIndexRefresh.onComplete,
      context: { generation, workload: args.workload, runStartedAt: args.startedAt },
    })
    return { kind: 'started', generation }
  }

export const checkpointArgs = v.object({ generation: v.string() })
export const checkpointReturns = v.union(v.null(), v.object({ status: v.union(v.literal('refreshing'), v.literal('complete'), v.literal('failed')), nextOffset: v.number(), indexedTotal: v.number() }))
export const checkpointHandler = async (ctx: QueryCtx, args: Infer<typeof checkpointArgs>) => {
    const row = await directoryGeneration(ctx, args.generation)
    return row === null ? null : { status: row.status, nextOffset: row.nextOffset ?? 0, indexedTotal: row.ingestedCount }
  }

/** Each successful page advances its checkpoint atomically with all metadata/index writes. */
export const applyPageArgs = v.object({
    generation: v.string(), offset: v.number(), reportedTotal: v.number(), items: v.array(indexedSourceValue),
    startItem: v.optional(v.number()), totalItems: v.optional(v.number()), skippedInvalidItems: v.optional(v.number()),
    observedAt: v.number(), runStartedAt: v.number(), workload: workloadCronSnapshotValue,
  })
export const applyPageReturns = progressValue
export const applyPageHandler = async (ctx: MutationCtx, args: Infer<typeof applyPageArgs>): Promise<IndexProgress> => {
    await authorize(ctx, args.workload)
    const generation = await directoryGeneration(ctx, args.generation)
    const state = await directoryState(ctx)
    if (generation === null || generation.status !== 'refreshing' || state?.refreshGeneration !== args.generation) return { kind: 'stale', generation: args.generation, nextOffset: generation?.nextOffset ?? 0, indexedTotal: generation?.ingestedCount ?? 0 }
    const offset = generation.nextOffset ?? 0
    if (args.offset < offset) return { kind: 'advanced', generation: args.generation, nextOffset: offset, indexedTotal: generation.ingestedCount }
    if (args.offset !== offset || !Number.isSafeInteger(args.offset) || args.offset < 0 || !Number.isSafeInteger(args.reportedTotal) || args.reportedTotal < 0
      || args.items.length > DIRECTORY_INDEX_PAGE_SIZE || !Number.isSafeInteger(args.observedAt)) throw new Error('directory_source_page_invalid')
    const startItem = args.startItem ?? 0
    const totalItems = args.totalItems ?? args.items.length
    const pageItemCursor = generation.pageItemCursor ?? 0
    if (startItem < pageItemCursor) return { kind: 'advanced', generation: args.generation, nextOffset: offset, indexedTotal: generation.ingestedCount }
    const skippedInvalidItems = args.skippedInvalidItems ?? 0
    if (startItem !== pageItemCursor || !Number.isSafeInteger(totalItems) || totalItems < 0 || totalItems > DIRECTORY_INDEX_PAGE_SIZE
      || !Number.isSafeInteger(skippedInvalidItems) || skippedInvalidItems < 0 || totalItems + skippedInvalidItems > DIRECTORY_INDEX_PAGE_SIZE
      || startItem + args.items.length > totalItems) throw new Error('directory_source_batch_invalid')
    const pageDone = startItem + args.items.length === totalItems
    if (totalItems === 0 && skippedInvalidItems === 0 && args.offset < args.reportedTotal) throw new Error('directory_source_ended_early')
    const counts: Record<WriteOutcome, number> = { inserted: 0, unchanged: 0, activity_patched: 0, rewritten: 0 }
    for (const item of args.items) counts[await writeSource(ctx, args.generation, item, args.observedAt, args.runStartedAt)] += 1
    const inserted = counts.inserted
    console.info(JSON.stringify({ kind: 'x402_directory_page_applied', generation: args.generation, offset: args.offset, ...counts }))
    const complete = totalItems === 0 && skippedInvalidItems === 0
    // The source paginates fixed offset windows, including a short final page.
    // Advancing by its window avoids re-reading a rounded-down final offset.
    const nextOffset = complete || !pageDone ? args.offset : args.offset + DIRECTORY_INDEX_PAGE_SIZE
    const ingestedCount = generation.ingestedCount + inserted
    const analyticsBehind = generation.analyticsVersion === undefined
      ? generation.terminalObserved === true
      : generation.analyticsVersion < ANALYTICS_VERSION
    const next = {
      nextOffset, pageItemCursor: pageDone ? 0 : startItem + args.items.length, ingestedCount, sourceReportedInitial: generation.sourceReportedInitial ?? args.reportedTotal,
      sourceReportedLatest: args.reportedTotal,
      sourceReportedMinimum: Math.min(generation.sourceReportedMinimum ?? args.reportedTotal, args.reportedTotal),
      sourceReportedMaximum: Math.max(generation.sourceReportedMaximum ?? args.reportedTotal, args.reportedTotal),
      pagesFetched: (generation.pagesFetched ?? 0) + (pageDone ? 1 : 0),
      observations: (generation.observations ?? 0) + args.items.length,
      duplicateObservations: (generation.duplicateObservations ?? 0) + args.items.length - inserted,
      // Sticky true (never reset false): activeDirectoryGeneration gates read
      // availability on this alone, so a mid-run patch never makes the live
      // generation look "not ready yet" (rows.ts:activeDirectoryGeneration).
      terminalObserved: complete || generation.terminalObserved === true,
      ...(complete ? {
        status: 'complete' as const, completedAt: args.observedAt,
        ...(analyticsBehind ? {} : { analyticsVersion: ANALYTICS_VERSION, analyticsStatus: 'ready' as const }),
      } : {}),
    }
    await ctx.db.patch(generation._id, next)
    if (complete && analyticsBehind) await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexBackfill.start, {})
    if (complete && state !== null) {
      await ctx.db.replace(state._id, {
        key: 'coinbase', activeGeneration: args.generation,
        ...(state.runStartedAt === undefined ? {} : { runStartedAt: state.runStartedAt }),
        lastAttemptAt: args.observedAt, lastAttemptStatus: 'complete',
      })
    }
    return { kind: complete ? 'complete' : 'advanced', generation: args.generation, nextOffset, indexedTotal: ingestedCount }
  }

export const failArgs = v.object({ generation: v.string(), reason: v.string(), workload: workloadCronSnapshotValue })
export const failReturns = v.null()
export const failHandler = async (ctx: MutationCtx, args: Infer<typeof failArgs>) => {
    // Failure records preserve visibility even if the workload was revoked.
    // They never write source rows, replace active coverage, or admit supply.
    // The live generation is left exactly as far as this run got - a partial
    // scan must never trigger the removal sweep (that only runs from
    // onComplete after a full successful scan), so nothing is deleted here.
    const generation = await directoryGeneration(ctx, args.generation)
    if (generation === null || generation.status !== 'refreshing') return null
    const state = await directoryState(ctx)
    await ctx.db.patch(generation._id, { status: 'failed', failedAt: Date.now(), failureReason: args.reason.slice(0, 500) })
    if (state?.refreshGeneration === args.generation) await ctx.db.replace(state._id, {
      key: 'coinbase', ...(state.activeGeneration === undefined ? {} : { activeGeneration: state.activeGeneration }),
      ...(state.runStartedAt === undefined ? {} : { runStartedAt: state.runStartedAt }),
      lastAttemptAt: Date.now(), lastAttemptStatus: 'failed', lastError: args.reason.slice(0, 500),
    })
    return null
  }
