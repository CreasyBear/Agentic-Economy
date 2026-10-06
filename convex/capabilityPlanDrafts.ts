import { v } from 'convex/values'
import { internalQuery } from './_generated/server'
import { suggestPlanDraftsHandler, importPlanDraftHandler } from './lib/capabilityExecution/plans/planDrafts'
export const suggest = internalQuery({ args: {}, returns: v.string(), handler: suggestPlanDraftsHandler })
export const importMercator = internalQuery({ args: { inputJson: v.string() }, returns: v.string(), handler: importPlanDraftHandler })
