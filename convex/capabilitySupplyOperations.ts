import { internalMutationGeneric, internalQueryGeneric, queryGeneric } from 'convex/server'
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
import {
  backfillCurrentOperationProjectionsHandler,
  currentOperationMismatchKind,
  currentOperationProjectionBackfillArgs,
  currentOperationProjectionBackfillReturns,
  currentOperationProjectionRebuildReturns,
  currentOperationReadControlHandler,
  currentOperationReadControlReturns,
  currentOperationReadMode,
  currentOperationShadowDiagnosticsHandler,
  currentOperationShadowDiagnosticsReturns,
  currentOperationStagingSnapshotHandler,
  currentOperationStagingSnapshotReturns,
  rebuildCurrentOperationProjectionHandler,
  recordCurrentOperationMismatchExplanationHandler,
  setCurrentOperationReadModeHandler,
} from './capabilitySupplyOperationProjection'
import { env } from './_generated/server'

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

export const rebuildCurrentOperationProjection = internalMutationGeneric({
  args: {
    publicationRef: v.string(),
    publicationRevision: v.number(),
    now: v.number(),
  },
  returns: currentOperationProjectionRebuildReturns,
  handler: rebuildCurrentOperationProjectionHandler,
})

export const backfillCurrentOperationProjections = internalMutationGeneric({
  args: currentOperationProjectionBackfillArgs,
  returns: currentOperationProjectionBackfillReturns,
  handler: backfillCurrentOperationProjectionsHandler,
})

export const readCurrentOperationReadControl = internalQueryGeneric({
  args: {},
  returns: currentOperationReadControlReturns,
  handler: currentOperationReadControlHandler,
})

export const setCurrentOperationReadMode = internalMutationGeneric({
  args: {
    mode: currentOperationReadMode,
    reason: v.string(),
    releaseOwner: v.string(),
    now: v.number(),
  },
  returns: v.object({ mode: currentOperationReadMode }),
  handler: setCurrentOperationReadModeHandler,
})

export const recordCurrentOperationMismatchExplanation = internalMutationGeneric({
  args: {
    operationRef: v.string(),
    mismatchKind: currentOperationMismatchKind,
    owner: v.string(),
    reason: v.string(),
    expiresAt: v.number(),
    regressionFixture: v.string(),
    now: v.number(),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: recordCurrentOperationMismatchExplanationHandler,
})

export const currentOperationShadowDiagnostics = internalQueryGeneric({
  args: { now: v.number() },
  returns: currentOperationShadowDiagnosticsReturns,
  handler: currentOperationShadowDiagnosticsHandler,
})

export const currentOperationStagingSnapshot = internalQueryGeneric({
  args: { now: v.number(), observedSince: v.optional(v.number()) },
  returns: currentOperationStagingSnapshotReturns,
  handler: async (ctx, args) => await currentOperationStagingSnapshotHandler(
    ctx,
    args,
    env.AE_RELEASE_SOURCE_REVISION,
  ),
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
