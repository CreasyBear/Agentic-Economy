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
  args: { generation: v.string(), workload: workloadCronSnapshotValue },
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
  returns: v.object({ kind: v.union(v.literal('started'), v.literal('refreshing'), v.literal('unchanged')), generation: v.string() }),
  handler: async (ctx, args): Promise<{ kind: 'started' | 'refreshing' | 'unchanged'; generation: string }> => {
    if (args.workload === undefined) await ctx.runMutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = parseWorkloadCronSnapshot(args.workload ?? await ctx.runQuery(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' }))
    // Change-signal guard: a full re-index rewrites ~14,541 resources (2-3
    // search rows and ~15 aggregate-component calls each) - roughly 225,000
    // function calls (before: 24h cadence -> ~225,000/day -> ~6.75M/month,
    // 6.75x the Starter 1M/month allowance). Comparing the source's reported
    // total against what the active generation already recorded costs 3 calls
    // (query + probe + audit patch) and lets an unchanged upstream skip the
    // rewrite entirely (after: with the 7-day cadence below, ~6 guard-only
    // days/week at ~3 calls plus at most 1 real refresh/week -> well under
    // 1M/month even every week actually changes).
    const active = await ctx.runQuery(internal.x402DirectoryIndexStore.activeCoverage, {})
    if (active !== null) {
      const probedTotal = await ctx.runAction(internal.x402DirectoryIndexSource.probeTotal, {})
      if (probedTotal === active.sourceReportedLatest) {
        console.info(JSON.stringify({
          kind: 'x402_directory_refresh_unchanged', generation: active.generation, storedTotal: active.sourceReportedLatest, probedTotal,
        }))
        await ctx.runMutation(internal.x402DirectoryIndexStore.recordUnchangedCheck, { workload })
        return { kind: 'unchanged', generation: active.generation }
      }
    }
    return await ctx.runMutation(internal.x402DirectoryIndexStore.begin, {
      generation: `coinbase-${Date.now()}-${crypto.randomUUID()}`, startedAt: Date.now(), workload,
    })
  },
})

export const onComplete = internalMutation({
  args: {
    workflowId: vWorkflowId, result: vResultValidator,
    context: v.object({ generation: v.string(), workload: workloadCronSnapshotValue }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.result.kind !== 'success') {
      await ctx.runMutation(internal.x402DirectoryIndexStore.fail, {
        ...args.context, reason: args.result.kind === 'failed' ? args.result.error : 'directory_refresh_canceled',
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
    }
    await workflow.cleanup(ctx, args.workflowId)
    return null
  },
})
