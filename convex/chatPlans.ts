import { internalAction, internalQuery } from './_generated/server'
import { internalMutation } from './usageTrackedMutation'
import { chatPlanQuoteArgs, chatPlanRunArgs, chatPlanReadArgs, authenticateChatPlanHandler, quoteChatPlanHandler,
  beginChatPlanHandler, runChatPlanHandler, getChatPlanHandler } from './lib/capabilityExecution/plans/chatPlans'
import { authenticatePlanQuoteResult, planQuoteResultValue } from './lib/capabilityExecution/plans/quotePlan'
import { beginRunResult } from './lib/capabilityExecution/plans/runAdmission'
import { planRunResultValue } from './lib/capabilityExecution/plans/planState'
import { readPlanResult } from './lib/capabilityExecution/plans/planReads'

export const authenticateQuote = internalMutation({ args: chatPlanQuoteArgs, returns: authenticatePlanQuoteResult, handler: authenticateChatPlanHandler })
export const quote = internalAction({ args: chatPlanQuoteArgs, returns: planQuoteResultValue, handler: quoteChatPlanHandler })
export const beginRun = internalMutation({ args: chatPlanRunArgs, returns: beginRunResult, handler: beginChatPlanHandler })
export const run = internalAction({ args: chatPlanRunArgs, returns: planRunResultValue, handler: runChatPlanHandler })
export const get = internalQuery({ args: chatPlanReadArgs, returns: readPlanResult, handler: getChatPlanHandler })
