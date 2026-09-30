import { deserializeToolSearchResult, serializeToolSearchResult, type ToolSearchWireResult } from '@/modules/capability-supply/public'
import { presentToolSearch } from '@/modules/registry/tool-reranker'
import { jevDecisionOptions } from '../../decision/jevDecisionOptions'

export async function presentSearch(args: { result: ToolSearchWireResult; query: string; request?: string }) {
  const source = deserializeToolSearchResult(args.result)
  const presented = await presentToolSearch(source, args.query, {
    ...jevDecisionOptions(1500),
    ...(args.request === undefined ? {} : { request: args.request }),
  })
  return {
    result: serializeToolSearchResult(presented.result),
    use: presented.use,
    belowMatch: [...presented.belowMatch],
  }
}
