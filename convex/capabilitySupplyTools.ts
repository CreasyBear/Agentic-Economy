import { internalQueryGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  compareArgs,
  toolRefArgs,
  publicCompareReturns,
  publicDetailReturns,
  publicSearchReturns,
  searchArgs,
} from './lib/capabilitySupply/tool/contracts'
import { compareHandler, detailHandler, searchHandler } from './lib/capabilitySupply/tool/reads'
import {
  offeringToolMapArgs,
  offeringToolMapHandler,
  offeringToolMapResult,
} from './lib/capabilitySupply/tool/originMap'
import {
  publishedOperationSnapshotReturns,
  readCurrentPublishedToolSnapshotHandler,
} from './lib/capabilitySupply/currentTool/reads'

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

// The catalog action must call the same read model via an internal target.
export const searchInternal = internalQueryGeneric({
  args: searchArgs,
  returns: publicSearchReturns,
  handler: searchHandler,
})
export const detailInternal = internalQueryGeneric({
  args: toolRefArgs,
  returns: publicDetailReturns,
  handler: detailHandler,
})
export const compareInternal = internalQueryGeneric({
  args: compareArgs,
  returns: publicCompareReturns,
  handler: compareHandler,
})
export const offeringToolMap = queryGeneric({
  args: offeringToolMapArgs,
  returns: offeringToolMapResult,
  handler: offeringToolMapHandler,
})

export const readCurrentPublishedToolSnapshot = internalQueryGeneric({
  args: { toolRef: v.string() },
  returns: publishedOperationSnapshotReturns,
  handler: readCurrentPublishedToolSnapshotHandler,
})

