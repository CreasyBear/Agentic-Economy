import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { serviceAssertion } from './serviceAssertion'
import { observationArgs, observationResult, historyItem } from './lib/security/accountHistory/contracts'
import { recordClerkSecurityEventForServerHandler } from './lib/security/accountHistory/observation'
import {
  listCurrentOwnerSecurityHistoryHandler,
  listCurrentOwnerAgentSecurityHistoryHandler,
} from './lib/security/accountHistory/history'

export const recordClerkSecurityEventForServer = mutation({
  args: { ...observationArgs, serviceAuth: serviceAssertion },
  returns: observationResult,
  handler: recordClerkSecurityEventForServerHandler,
})

export const listCurrentOwnerSecurityHistory = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(historyItem),
  handler: listCurrentOwnerSecurityHistoryHandler,
})

export const listCurrentOwnerAgentSecurityHistory = query({
  args: { principalRef: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(historyItem),
  handler: listCurrentOwnerAgentSecurityHistoryHandler,
})
