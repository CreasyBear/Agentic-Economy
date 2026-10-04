import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { listOwnerCallsArgs, listOwnerCallsHandler, listOwnerCallsResult } from './lib/capabilityExecution/callProjection/history'
import { readOwnerAgentReadbackArgs, readOwnerAgentReadbackHandler, readOwnerAgentReadbackResult } from './lib/capabilityExecution/callProjection/ownerAgentReadback'
import { readOwnerUsageArgs, readOwnerUsageHandler, readOwnerUsageResult } from './lib/capabilityExecution/callProjection/usage'
import { prepareOwnerSpendReadArgs, prepareOwnerSpendReadHandler, prepareOwnerSpendReadResult } from './lib/capabilityExecution/callProjection/spendAdmission'
import { rebuildArgs, rebuildHandler, rebuildResult } from './lib/capabilityExecution/callProjection/rebuild'
import { callExportPageArgs, callExportPageHandler, callExportPageResult } from './lib/capabilityExecution/callProjection/exportPage'
import { beginCallExportArgs, beginCallExportHandler, beginCallExportResult } from './lib/capabilityExecution/callProjection/exportAudit'

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
