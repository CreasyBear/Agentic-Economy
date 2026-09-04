import {
  WorkflowManager,
  cancel,
  getStatus,
  restart,
  sendEvent,
  start,
  vWorkflowId,
  type WorkflowId,
} from '@convex-dev/workflow'
import { components, internal } from '../../convex/_generated/api'
import {
  type FunctionReference,
  internalMutationGeneric as internalMutation,
  mutationGeneric as mutation,
  queryGeneric as query,
} from 'convex/server'
import { v } from 'convex/values'

const manager = new WorkflowManager(components.workflow)
const proofInternal = (internal as unknown as Readonly<{
  workflowProof: Readonly<{
    recordExactStep: FunctionReference<'mutation', 'internal', { caseRef: string; step: string }, null>
    requireReady: FunctionReference<'mutation', 'internal', { caseRef: string }, null>
    restartProof: FunctionReference<'mutation', 'internal', { args: { caseRef: string } }, unknown>
    waitingProof: FunctionReference<'mutation', 'internal', { args: { caseRef: string } }, unknown>
  }>
}>).workflowProof

export const recordExactStep = internalMutation({
  args: { caseRef: v.string(), step: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = (await ctx.db.query('workflowProofEntries').collect())
      .find((entry) => entry.caseRef === args.caseRef && entry.step === args.step)
    if (existing === undefined) {
      await ctx.db.insert('workflowProofEntries', {
        caseRef: args.caseRef,
        step: args.step,
        executions: 1,
        ready: false,
      })
    } else {
      await ctx.db.patch(existing._id, { executions: existing.executions + 1 })
    }
    return null
  },
})

export const requireReady = internalMutation({
  args: { caseRef: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const control = (await ctx.db.query('workflowProofEntries').collect())
      .find((entry) => entry.caseRef === args.caseRef && entry.step === 'control')
    if (control?.ready !== true) throw new Error('proof_external_authority_unavailable')
    return null
  },
})

export const restartProof = manager.define({
  args: { caseRef: v.string() },
  returns: v.string(),
}).handler(async (step, args): Promise<string> => {
  await step.runMutation(proofInternal.recordExactStep, {
    caseRef: args.caseRef,
    step: 'freeze',
  }, { name: 'freeze' })
  await step.runMutation(proofInternal.requireReady, {
    caseRef: args.caseRef,
  }, { name: 'authoritative-readback' })
  return args.caseRef
})

export const waitingProof = manager.define({
  args: { caseRef: v.string() },
  returns: v.string(),
}).handler(async (step, args): Promise<string> => {
  await step.runMutation(proofInternal.recordExactStep, {
    caseRef: args.caseRef,
    step: 'freeze',
  }, { name: 'freeze' })
  await step.awaitEvent({ name: 'continue' })
  await step.runMutation(proofInternal.recordExactStep, {
    caseRef: args.caseRef,
    step: 'complete',
  }, { name: 'complete' })
  return args.caseRef
})

export const begin = mutation({
  args: { caseRef: v.string(), kind: v.union(v.literal('restart'), v.literal('waiting')) },
  returns: vWorkflowId,
  handler: async (ctx, args): Promise<WorkflowId> => {
    await ctx.db.insert('workflowProofEntries', {
      caseRef: args.caseRef,
      step: 'control',
      executions: 0,
      ready: false,
    })
    return await start(
      ctx,
      args.kind === 'restart' ? proofInternal.restartProof : proofInternal.waitingProof,
      { caseRef: args.caseRef },
      { startAsync: true },
    )
  },
})

export const permit = mutation({
  args: { caseRef: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const control = (await ctx.db.query('workflowProofEntries').collect())
      .find((entry) => entry.caseRef === args.caseRef && entry.step === 'control')
    if (control === undefined) throw new Error('proof_control_missing')
    await ctx.db.patch(control._id, { ready: true })
    return null
  },
})

export const resume = mutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, args) => {
    await sendEvent(ctx, components.workflow, {
      workflowId: args.workflowId,
      name: 'continue',
      value: null,
    })
    return null
  },
})

export const retry = mutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, args) => {
    await restart(ctx, components.workflow, args.workflowId, {
      from: 'authoritative-readback',
      startAsync: true,
    })
    return null
  },
})

export const stop = mutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, args) => {
    await cancel(ctx, components.workflow, args.workflowId)
    return null
  },
})

export const inspect = query({
  args: { workflowId: vWorkflowId, caseRef: v.string() },
  handler: async (ctx, args) => ({
    status: await getStatus(ctx, components.workflow, args.workflowId),
    entries: (await ctx.db.query('workflowProofEntries').collect())
      .filter((entry) => entry.caseRef === args.caseRef),
  }),
})
