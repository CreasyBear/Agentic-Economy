import { WorkflowManager, vWorkflowId } from '@convex-dev/workflow'
import { vResultValidator } from '@convex-dev/workpool'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { internalAction, internalMutation } from './_generated/server'
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
  returns: v.object({ kind: v.union(v.literal('started'), v.literal('refreshing')), generation: v.string() }),
  handler: async (ctx, args): Promise<{ kind: 'started' | 'refreshing'; generation: string }> => {
    if (args.workload === undefined) await ctx.runMutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = parseWorkloadCronSnapshot(args.workload ?? await ctx.runQuery(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' }))
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
    if (args.result.kind !== 'success') await ctx.runMutation(internal.x402DirectoryIndexStore.fail, {
      ...args.context, reason: args.result.kind === 'failed' ? args.result.error : 'directory_refresh_canceled',
    })
    await workflow.cleanup(ctx, args.workflowId)
    return null
  },
})
