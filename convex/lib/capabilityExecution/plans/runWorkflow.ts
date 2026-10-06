import { WorkflowManager, type WorkflowCtx } from '@convex-dev/workflow'
import { components, internal } from '../../../_generated/api'

export const planWorkflowManager = new WorkflowManager(components.workflow)

/** The Workflow schedules existing Calls; it never retries a provider purchase. */
export async function runPlanWorkflow(step: WorkflowCtx, args: { planRef: string }): Promise<null> {
  const waiting = new Map<string, Promise<string>>()
  for (;;) {
    const plan = await step.runQuery(internal.capabilityPlans.readProgress, args)
    if (plan === null || plan.terminationIntent !== undefined) return null
    const active = plan.nodes.filter(node => node.state === 'admitted')
    const selected: typeof plan.nodes = []
    for (const node of plan.nodes.filter(item => item.state === 'ready')) {
      if (active.length + selected.length >= plan.maximumConcurrentNodes) break
      if ([...active, ...selected].filter(item => item.providerHost === node.providerHost).length < 2) selected.push(node)
    }
    for (const node of selected) {
      const identity = { planRef: args.planRef, nodeId: node.nodeId }
      const preparation = await step.runAction(internal.capabilityPlans.prepareNode, identity, { retry: false })
      await step.runMutation(internal.capabilityPlans.admitNode, { ...identity, preparation })
    }
    if (selected.length > 0) continue
    if (active.length === 0) return null
    for (const node of active) if (!waiting.has(node.nodeId)) {
      waiting.set(node.nodeId, step.awaitEvent({ name: `${args.planRef}:${node.nodeId}` }).then(() => node.nodeId))
    }
    const completed = await Promise.race(waiting.values())
    waiting.delete(completed)
  }
}
