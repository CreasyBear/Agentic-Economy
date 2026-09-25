import { callPublicSourceAction, callPublicSourceQuery, sourceAction, sourceQuery } from '@/lib/server/convex-source'
import { projectMarketFlowView, type MarketFlowRankFacts, type MarketFlowView } from '@/modules/market/flow-tape'

const rank = sourceQuery<{ payTos: string[] }, MarketFlowRankFacts>('marketFlow:rank')
const visibleVolumes = sourceQuery<{ payTos: string[] }, ReadonlyArray<{ payTo: string; amountAtomic: string }>>('marketFlow:visibleVolumes')
const lookupVolumes = sourceAction<{ payTos: string[] }, ReadonlyArray<{ payTo: string; amountAtomic: string }>>('marketFlowRefresh:lookupVolumes')

export async function readMarketFlowRank(payTos: readonly string[]): Promise<MarketFlowView> {
  return projectMarketFlowView(await callPublicSourceQuery(rank, { payTos: [...payTos] }))
}

/** Stored amounts only. A page view does not call Coinbase. */
export async function readMarketFlowCachedVolumes(payTos: readonly string[]) {
  return await callPublicSourceQuery(visibleVolumes, { payTos: [...payTos] })
}

/** Fills payees the stored window does not have yet. Not the steady-state page read. */
export async function readMarketFlowVolumes(payTos: readonly string[]) {
  return await callPublicSourceAction(lookupVolumes, { payTos: [...payTos] })
}
