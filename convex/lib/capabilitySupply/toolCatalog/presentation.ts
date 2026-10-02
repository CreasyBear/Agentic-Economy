import { deserializeToolSearchResult, serializeToolSearchResult, type ToolSearchWireResult } from '@/modules/capability-supply/public'
import { presentToolSearch, type ToolSearchUse } from '@/modules/registry/tool-reranker'
import type { ChatModelCostBinding } from '@/modules/chat/model-cost'
import type { ActionCtx } from '../../../_generated/server'
import { createJevModelCostObserver } from '../../chat/turns/jevModelCost'
import { jevDecisionOptions } from '../../decision/jevDecisionOptions'

export async function presentSearch(
  args: { result: ToolSearchWireResult; query: string; request?: string; modelCostBinding?: ChatModelCostBinding },
  ctx?: Pick<ActionCtx, 'runMutation'>,
): Promise<{ result: ToolSearchWireResult; use: ToolSearchUse | null; belowMatch: string[] }> {
  if (args.modelCostBinding !== undefined && ctx === undefined) throw new Error('jev_cost_context_required')
  const source = deserializeToolSearchResult(args.result)
  const presented = await presentToolSearch(source, args.query, {
    ...jevDecisionOptions(1500),
    ...(args.request === undefined ? {} : { request: args.request }),
    ...(args.modelCostBinding === undefined || ctx === undefined ? {} : {
      inferenceObserver: createJevModelCostObserver(ctx, args.modelCostBinding, 'discovery_rerank'),
    }),
  })
  return {
    result: serializeToolSearchResult(presented.result),
    use: presented.use,
    belowMatch: [...presented.belowMatch],
  }
}
