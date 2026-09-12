import { WorkflowManager, vWorkflowId } from '@convex-dev/workflow'
import { vResultValidator } from '@convex-dev/workpool'
import { v } from 'convex/values'
import { isRecord } from '@/modules/common/is-record'
import { components, internal, api } from './_generated/api'
import { internalAction, internalMutation } from './_generated/server'
import { marketDispatchWorkpool } from './marketDispatchWorkpool'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from './workloadCron'
import type { IndexProgress } from './lib/x402DirectoryIndex/contracts'

const workflow = new WorkflowManager(components.workflow)

export const scan = workflow.define({
  args: { generation: v.string(), runStartedAt: v.number(), workload: workloadCronSnapshotValue },
  returns: v.object({ kind: v.union(v.literal('complete'), v.literal('preserved')), generation: v.string(), indexedTotal: v.number() }),
}).handler(async (step, args): Promise<{ kind: 'complete' | 'preserved'; generation: string; indexedTotal: number }> => {
  let offset = 0
  for (;;) {
    const result: IndexProgress = await step.runAction(internal.x402DirectoryIndexSource.page, { ...args, offset }, {
      name: `source-page-${offset}`, retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
    })
    if (result.kind !== 'advanced') return { kind: result.kind === 'complete' ? 'complete' : 'preserved', generation: args.generation, indexedTotal: result.indexedTotal }
    if (result.nextOffset <= offset) throw new Error('directory_scan_did_not_advance')
    offset = result.nextOffset
  }
})

export const start = internalAction({
  args: { workload: v.optional(workloadCronSnapshotValue) },
  returns: v.object({ kind: v.union(v.literal('started'), v.literal('refreshing')), generation: v.string() }),
  handler: async (ctx, args): Promise<{ kind: 'started' | 'refreshing'; generation: string }> => {
    if (args.workload === undefined) await ctx.runMutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = parseWorkloadCronSnapshot(args.workload ?? await ctx.runQuery(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' }))
    // Well 8 Lane B: no more change-signal guard here. The old guard existed
    // to skip a full re-index (~225,000 calls) when nothing changed upstream;
    // now every run diffs per-resource against the retained observation
    // (x402DirectoryIndexStore.writeSource) and an unchanged resource costs
    // one small patch, so there is no expensive "full rewrite" left to skip -
    // the weekly cadence below is the only cost control needed.
    return await ctx.runMutation(internal.x402DirectoryIndexStore.begin, { startedAt: Date.now(), workload })
  },
})

export const onComplete = internalMutation({
  args: {
    workflowId: vWorkflowId, result: vResultValidator,
    context: v.object({ generation: v.string(), workload: workloadCronSnapshotValue, runStartedAt: v.number() }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.result.kind !== 'success') {
      await ctx.runMutation(internal.x402DirectoryIndexStore.fail, {
        generation: args.context.generation, workload: args.context.workload,
        reason: args.result.kind === 'failed' ? args.result.error : 'directory_refresh_canceled',
      })
    } else if (isRecord(args.result.returnValue) && args.result.returnValue.kind === 'complete' && typeof args.result.returnValue.generation === 'string') {
      // Pre-admission: only the first adoption-sorted page of eligible
      // entries (plan-limit budget), not the whole eligible set, so a cache
      // hit through convex/x402DirectoryIndex.ts:bySlug is common on the
      // catalogue's most-adopted Tools without every generation refresh
      // paying for a full re-admission sweep.
      const resources = await ctx.runQuery(internal.x402DirectoryIndex.firstEligiblePage, { generation: args.result.returnValue.generation })
      if (resources.length > 0) {
        await marketDispatchWorkpool.enqueueActionBatch(ctx, api.x402Directory.resolve, resources.map(resource => ({ resource })), { retry: true })
      }
      // Removal sweep only runs after a full, successful scan (never after a
      // partial/failed one - x402DirectoryIndexStore.fail leaves the live
      // generation untouched on failure).
      await ctx.scheduler.runAfter(0, internal.x402DirectoryIndexStore.cleanup, {
        generation: args.context.generation, runStartedAt: args.context.runStartedAt,
      })
    }
    await workflow.cleanup(ctx, args.workflowId)
    return null
  },
})
