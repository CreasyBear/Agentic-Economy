import { internalQueryGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  compareArgs,
  compareHandler,
  detailHandler,
  inspectArgs,
  inspectPlanHandler,
  operationRefArgs,
  publicCompareReturns,
  publicDetailReturns,
  publicInspectReturns,
  publicSearchReturns,
  searchArgs,
  searchHandler,
} from './capabilitySupplyOperationQueries'
import {
  offeringOperationMapHandler,
  offeringOperationMapReturns,
} from './capabilitySupplyOperationOriginMap'
import {
  publishedOperationSnapshotReturns,
  readCurrentPublishedOperationSnapshotHandler,
} from './capabilitySupplyCurrentOperation'

export { readCurrentPublishedOperation } from './capabilitySupplyCurrentOperation'

export const search = queryGeneric({
  args: searchArgs,
  returns: publicSearchReturns,
  handler: searchHandler,
})
export const detail = queryGeneric({
  args: operationRefArgs,
  returns: publicDetailReturns,
  handler: detailHandler,
})
export const compare = queryGeneric({
  args: compareArgs,
  returns: publicCompareReturns,
  handler: compareHandler,
})
export const inspectPlan = queryGeneric({
  args: inspectArgs,
  returns: publicInspectReturns,
  handler: inspectPlanHandler,
})

export const offeringOperationMap = queryGeneric({
  args: { businessIds: v.array(v.string()) },
  returns: offeringOperationMapReturns,
  handler: offeringOperationMapHandler,
})

export const readCurrentPublishedOperationSnapshot = internalQueryGeneric({
  args: { operationRef: v.string() },
  returns: publishedOperationSnapshotReturns,
  handler: readCurrentPublishedOperationSnapshotHandler,
})
