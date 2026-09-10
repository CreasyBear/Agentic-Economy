import { internalQueryGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  compareArgs,
  compareHandler,
  detailHandler,
  toolRefArgs,
  publicCompareReturns,
  publicDetailReturns,
  publicSearchReturns,
  searchArgs,
  searchHandler,
} from './capabilitySupplyToolQueries'
import {
  offeringToolMapHandler,
  offeringToolMapReturns,
} from './capabilitySupplyToolOriginMap'
import {
  publishedOperationSnapshotReturns,
  sellerCanaryOperationSnapshotReturns,
  readExactSellerCanaryOperationSnapshotHandler,
  readCurrentPublishedToolSnapshotHandler,
} from './capabilitySupplyCurrentTool'

export { readCurrentPublishedTool } from './capabilitySupplyCurrentTool'

export const search = queryGeneric({
  args: searchArgs,
  returns: publicSearchReturns,
  handler: searchHandler,
})
export const detail = queryGeneric({
  args: toolRefArgs,
  returns: publicDetailReturns,
  handler: detailHandler,
})
export const compare = queryGeneric({
  args: compareArgs,
  returns: publicCompareReturns,
  handler: compareHandler,
})
export const offeringToolMap = queryGeneric({
  args: { businessIds: v.array(v.string()) },
  returns: offeringToolMapReturns,
  handler: offeringToolMapHandler,
})

export const readCurrentPublishedToolSnapshot = internalQueryGeneric({
  args: { toolRef: v.string() },
  returns: publishedOperationSnapshotReturns,
  handler: readCurrentPublishedToolSnapshotHandler,
})

export const readExactSellerCanaryOperationSnapshot = internalQueryGeneric({
  args: { publicationRef: v.string(), revision: v.number() },
  returns: sellerCanaryOperationSnapshotReturns,
  handler: readExactSellerCanaryOperationSnapshotHandler,
})
