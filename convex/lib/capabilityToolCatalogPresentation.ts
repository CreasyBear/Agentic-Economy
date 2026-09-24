import { deserializeToolSearchResult, serializeToolSearchResult, type ToolSearchWireResult } from '@/modules/capability-supply/public'
import { presentToolSearch } from '@/modules/registry/tool-reranker'
import { env } from '../_generated/server'

function decisionOptions() {
  // RPC does not propagate browser cancellation; bound this Node attempt locally.
  return {
    deadlineAt: Date.now() + 1500,
    signal: AbortSignal.timeout(1500),
    disableJev: env.AE_JEV_DISCOVERY_ENABLED === 'false',
    ...(env.OPENROUTER_API_KEY === undefined ? {} : { openrouterApiKey: env.OPENROUTER_API_KEY }),
  }
}

export async function presentSearch(args: { result: ToolSearchWireResult; query: string; request?: string }) {
  const source = deserializeToolSearchResult(args.result)
  const presented = await presentToolSearch(source, args.query, {
    ...decisionOptions(),
    ...(args.request === undefined ? {} : { request: args.request }),
  })
  return {
    result: serializeToolSearchResult(presented.result),
    use: presented.use,
    belowMatch: [...presented.belowMatch],
  }
}
