import type { QueryCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { queryCapabilityGraph } from '@/modules/capability-supply/public'
import { suggestPlans } from '@/modules/capability-execution/plan/suggest'
import { mercatorFlowPlanToPlanJson } from '@/modules/capability-execution/plan/mercator'
import { mercatorImportInputSchema } from '@/modules/capability-execution/plan/draft.schemas'
import { capabilitySupplyGraphPorts } from '../../capabilitySupply/graphPorts/ports'
import { readCurrentPublishedTool } from '../../capabilitySupply/currentTool/reads'
import { admittedToolRefForMercatorRoute } from '../../market/directoryIndex/lookup'

/** Editable drafts are observations only. No Quote, Hold, approval or Call is written. */
export async function suggestPlanDraftsHandler(ctx: QueryCtx): Promise<string> {
  const graph = await queryCapabilityGraph(capabilitySupplyGraphPorts(ctx.db), { networkId: 'ae:public', includeInactive: false, limit: 100 })
  if (graph.kind === 'unavailable') return JSON.stringify({ kind: 'refused', code: graph.reason })
  const environment = deploymentPaymentEnvironment(env)
  const nodes = []
  for (const node of graph.nodes) {
    if (node.admittedToolRef === undefined) continue
    const current = await readCurrentPublishedTool(ctx, node.admittedToolRef, Date.now())
    if (current !== undefined && current.runtimeEnvironment === environment) nodes.push(node)
  }
  const result = suggestPlans({ ...graph, nodes })
  return JSON.stringify(result.kind === 'suggested'
    ? { kind: 'drafts', plans: result.suggestions.slice(0, 10).map(item => item.plan), validation: 'untyped_ref' }
    : { kind: 'refused', code: result.kind === 'refused' ? result.code : result.reason })
}

export async function importPlanDraftHandler(ctx: QueryCtx, args: { inputJson: string }): Promise<string> {
  if (new TextEncoder().encode(args.inputJson).byteLength > 262_144) return JSON.stringify({ kind: 'refused', code: 'plan_too_large' })
  let input: unknown
  try { input = JSON.parse(args.inputJson) } catch { return JSON.stringify({ kind: 'refused', code: 'input_schema_mismatch' }) }
  const parsed = mercatorImportInputSchema.safeParse(input)
  if (!parsed.success) return JSON.stringify({ kind: 'refused', code: 'input_schema_mismatch' })
  const result = await mercatorFlowPlanToPlanJson(parsed.data.flowPlan, parsed.data.providerHostByServiceId,
    selector => admittedToolRefForMercatorRoute(ctx, selector))
  return JSON.stringify('kind' in result ? { kind: 'refused', code: result.code }
    : { kind: 'drafts', plans: [result], validation: 'untyped_ref' })
}
