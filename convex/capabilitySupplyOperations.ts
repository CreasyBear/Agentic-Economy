import { internalQueryGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  compareArgs,
  compareHandler,
  currentProjectionDiagnosticsHandler,
  currentProjectionDiagnosticsReturns,
  currentSearchBenchmarkHandler,
  currentSearchBenchmarkReturns,
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
  keylessExecutableListReturns,
  keylessExecutableReturns,
  listKeylessExecutableHandler,
  offeringOperationMapHandler,
  offeringOperationMapReturns,
  publishedOperationSnapshotReturns,
  readCurrentPublishedOperationSnapshotHandler,
  readKeylessExecutableHandler,
  serverFunctionAuth,
} from './capabilitySupplyOperationKeyless'

export { readCurrentPublishedOperation } from './capabilitySupplyOperationKeyless'

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

export const currentProjectionDiagnostics = internalQueryGeneric({
  args: { now: v.number() },
  returns: currentProjectionDiagnosticsReturns,
  handler: currentProjectionDiagnosticsHandler,
})

export const currentSearchBenchmark = internalQueryGeneric({
  args: searchArgs,
  returns: currentSearchBenchmarkReturns,
  handler: currentSearchBenchmarkHandler,
})
export const readKeylessExecutable = queryGeneric({
  args: { operationRef: v.string(), serviceAuth: v.optional(serverFunctionAuth) },
  returns: keylessExecutableReturns,
  handler: readKeylessExecutableHandler,
})

export const listKeylessExecutable = queryGeneric({
  args: {},
  returns: keylessExecutableListReturns,
  handler: listKeylessExecutableHandler,
})
