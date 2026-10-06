import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parsePlan } from '@/modules/capability-execution/plan/parse'
import { resolvePlanInput } from '@/modules/capability-execution/plan/resolve'
import type { NoCallOutcome } from '@/modules/capability-execution/plan/contracts'
import { readCurrentPublishedTool } from '../../capabilitySupply/currentTool/reads'
import { planPrincipal, projectPlan, readPlan, readPlanCalls } from './planState'
import { validateRunPlan } from './runAdmission'

export const planNodeValue = v.object({ planRef: v.string(), nodeId: v.string() })
export const nodeOutcomeValue = v.union(v.literal('skipped'), v.literal('input_invalid'), v.literal('ref_type_mismatch'),
  v.literal('input_exceeds_bound'), v.literal('price_exceeded_ceiling'), v.literal('cancelled'))

/** Resolve the persisted template from financially conclusive predecessor outputs only. */
export async function readNodeMaterial(ctx: Pick<QueryCtx, 'db'>, args: { planRef: string; nodeId: string }) {
  const noCall = (outcome: NoCallOutcome) => ({ kind: 'no_call' as const, outcome })
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.authority === undefined || plan.holdReservationRefs === undefined
    || plan.state !== 'running' || plan.terminationIntent !== undefined || plan.runDeadlineAt <= Date.now()) return noCall('cancelled')
  const node = plan.nodes.find(item => item.nodeId === args.nodeId)
  const principal = planPrincipal(plan)
  if (node === undefined || principal === undefined) return noCall('skipped')
  const progress = await projectPlan(ctx, plan)
  const projected = progress.nodes.find(item => item.nodeId === args.nodeId)
  if (projected?.state !== 'ready') return noCall(projected?.state === 'skipped' ? 'skipped' : 'input_invalid')
  if ((await validateRunPlan(ctx, plan, Date.now())).kind === 'refused') return noCall('skipped')
  const parsed = parsePlan(JSON.parse(plan.planJson))
  if ('kind' in parsed) return noCall('input_invalid')
  const template = parsed.nodes.find(item => item.id === node.nodeId)
  if (template === undefined || canonicalDigest(template.input) !== node.inputTemplateDigest) return noCall('input_invalid')
  const tool = await readCurrentPublishedTool(ctx, node.toolRef, Date.now())
  if (tool === undefined || tool.materialDigest !== node.toolMaterialDigest) return noCall('skipped')
  const outputs: Record<string, unknown> = {}
  for (const call of await readPlanCalls(ctx, plan.planRef)) {
    if (call.planNodeId !== undefined && node.dependsOn.includes(call.planNodeId)
      && call.result?.kind === 'completed' && 'output' in call.result) outputs[call.planNodeId] = call.result.output
  }
  const resolved = resolvePlanInput(template, outputs, tool.contract.inputSchema)
  if (resolved.kind === 'failed') return noCall(resolved.code)
  return { kind: 'ready' as const, plan, node, principal, tool, input: resolved.input, inputDigest: resolved.inputDigest }
}
