import { internalQuery, internalAction, query } from './_generated/server'
import { internalMutation, mutation } from './usageTrackedMutation'
import { listOwnerCallsArgs, listOwnerCallsHandler, listOwnerCallsResult } from './lib/capabilityExecution/callProjection/history'
import { readOwnerAgentReadbackArgs, readOwnerAgentReadbackHandler, readOwnerAgentReadbackResult } from './lib/capabilityExecution/callProjection/ownerAgentReadback'
import { readOwnerUsageArgs, readOwnerUsageHandler, readOwnerUsageResult } from './lib/capabilityExecution/callProjection/usage'
import { prepareOwnerSpendReadArgs, prepareOwnerSpendReadHandler, prepareOwnerSpendReadResult } from './lib/capabilityExecution/callProjection/spendAdmission'
import { rebuildArgs, rebuildHandler, rebuildResult } from './lib/capabilityExecution/callProjection/rebuild'
import { callExportPageArgs, callExportPageHandler, callExportPageResult } from './lib/capabilityExecution/callProjection/exportPage'
import { beginCallExportArgs, beginCallExportHandler, beginCallExportResult } from './lib/capabilityExecution/callProjection/exportAudit'
import { requestUsageReportArgs, requestUsageReportResult, reportRefArgs, readUsageReportResult, usageReportPageArgs, usageReportPartsResult, usageReportUnitsResult, listUsageReportsArgs, listUsageReportsResult, captureUsageReportArgs, captureUsageReportResult } from './lib/capabilityExecution/callProjection/durableReportContracts'
import { requestUsageReportHandler, readUsageReportHandler, readUsageReportPartsHandler, readUsageReportUnitsHandler, listUsageReportsHandler, captureUsageReportPageHandler } from './lib/capabilityExecution/callProjection/durableReport'
import { completeUsageReportArgs, completeUsageReportResult, completeUsageReportWorkHandler, runUsageReportPageHandler } from './lib/capabilityExecution/callProjection/durableReportWork'

export const requestOwnerUsageReport = mutation({args:requestUsageReportArgs,returns:requestUsageReportResult,handler:requestUsageReportHandler})
export const readOwnerUsageReport = query({args:reportRefArgs,returns:readUsageReportResult,handler:readUsageReportHandler})
export const readOwnerUsageReportParts = query({args:usageReportPageArgs,returns:usageReportPartsResult,handler:readUsageReportPartsHandler})
export const readOwnerUsageReportUnits = query({args:usageReportPageArgs,returns:usageReportUnitsResult,handler:readUsageReportUnitsHandler})
export const listOwnerUsageReports = query({args:listUsageReportsArgs,returns:listUsageReportsResult,handler:listUsageReportsHandler})
export const captureUsageReportPage = internalMutation({args:captureUsageReportArgs,returns:captureUsageReportResult,handler:captureUsageReportPageHandler})
export const runUsageReportPage = internalAction({args:captureUsageReportArgs,returns:captureUsageReportResult,handler:runUsageReportPageHandler})
export const completeUsageReportWork = internalMutation({args:completeUsageReportArgs,returns:completeUsageReportResult,handler:completeUsageReportWorkHandler})

export const beginOwnerCallExport = mutation({
  args: beginCallExportArgs,
  returns: beginCallExportResult,
  handler: beginCallExportHandler,
})

export const readOwnerCallExportPage = query({
  args: callExportPageArgs,
  returns: callExportPageResult,
  handler: callExportPageHandler,
})

export const listOwnerCalls = query({
  args: listOwnerCallsArgs,
  returns: listOwnerCallsResult,
  handler: listOwnerCallsHandler,
})

export const readOwnerAgentReadback = query({
  args: readOwnerAgentReadbackArgs,
  returns: readOwnerAgentReadbackResult,
  handler: readOwnerAgentReadbackHandler,
})

export const readOwnerUsage = query({
  args: readOwnerUsageArgs,
  returns: readOwnerUsageResult,
  handler: readOwnerUsageHandler,
})

export const prepareOwnerSpendRead = internalQuery({
  args: prepareOwnerSpendReadArgs,
  returns: prepareOwnerSpendReadResult,
  handler: prepareOwnerSpendReadHandler,
})

export const rebuild = internalMutation({
  args: rebuildArgs,
  returns: rebuildResult,
  handler: rebuildHandler,
})
