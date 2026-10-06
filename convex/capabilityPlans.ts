import { action, internalQuery } from './_generated/server'
import { internalMutation } from './usageTrackedMutation'

import {
  authenticatePlanQuoteArgs,
  authenticatePlanQuoteHandler,
  authenticatePlanQuoteResult,
  planQuoteResultValue,
  quotePlanActionArgs,
  quotePlanActionHandler,
  quotePlanHandler as handleQuotePlan,
  quotePlanHandlerArgs,
  readPlanQuoteMaterialArgs,
  readPlanQuoteMaterialHandler,
  readPlanQuoteMaterialResult,
} from './lib/capabilityExecution/plans/quotePlan'

export const authenticateQuote = internalMutation({
  args: authenticatePlanQuoteArgs,
  returns: authenticatePlanQuoteResult,
  handler: authenticatePlanQuoteHandler,
})

export const readQuoteMaterial = internalQuery({
  args: readPlanQuoteMaterialArgs,
  returns: readPlanQuoteMaterialResult,
  handler: readPlanQuoteMaterialHandler,
})

export const quotePlanHandler = internalMutation({
  args: quotePlanHandlerArgs,
  returns: planQuoteResultValue,
  handler: handleQuotePlan,
})

export const quote = action({
  args: quotePlanActionArgs,
  returns: planQuoteResultValue,
  handler: quotePlanActionHandler,
})
