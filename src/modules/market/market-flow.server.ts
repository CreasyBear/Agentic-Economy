import { callPublicSourceAction, callPublicSourceQuery, createConvexServerFunctionAssertion, sourceAction, sourceQuery, type ConvexServerFunctionAssertion } from '@/lib/server/convex-source'
import { projectMarketFlowView, type MarketFlowRankFacts, type MarketFlowView } from '@/modules/market/flow-tape'

const rank = sourceQuery<{ payTos: string[] }, MarketFlowRankFacts>('marketFlow:rank')
const visibleVolumes = sourceQuery<{ payTos: string[] }, ReadonlyArray<{ payTo: string; amountAtomic: string }>>('marketFlow:visibleVolumes')
const LOOKUP_VOLUMES_OPERATION = 'marketFlowRefresh.lookupVolumes'
const LOOKUP_VOLUMES_SCOPE = 'market_flow:lookup'
const lookupVolumes = sourceAction<{ payTos: string[]; serviceAuth: ConvexServerFunctionAssertion }, ReadonlyArray<{ payTo: string; amountAtomic: string }>>('marketFlowRefresh:lookupVolumes')

export async function readMarketFlowRank(payTos: readonly string[]): Promise<MarketFlowView> {
  return projectMarketFlowView(await callPublicSourceQuery(rank, { payTos: [...payTos] }))
}

/** Stored amounts only. A page view does not call Coinbase. */
export async function readMarketFlowCachedVolumes(payTos: readonly string[]) {
  return await callPublicSourceQuery(visibleVolumes, { payTos: [...payTos] })
}

/** Fills payees the stored window does not have yet. Server-signed; not a public page read. */
export async function readMarketFlowVolumes(payTos: readonly string[]) {
  const bounded = [...payTos].slice(0, 48)
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: LOOKUP_VOLUMES_OPERATION,
    scope: LOOKUP_VOLUMES_SCOPE,
    command: { payTos: bounded },
  })
  return await callPublicSourceAction(lookupVolumes, { payTos: bounded, serviceAuth })
}
