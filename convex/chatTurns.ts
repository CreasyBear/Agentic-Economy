import { internalQuery, query } from './_generated/server'
import { internalMutation, mutation } from './usageTrackedMutation'
import {
  ownerChatGrantStatusArgs, ownerChatGrantStatusResult,
  startTurnArgs, startTurnResult,
  cancelTurnArgs, cancelTurnResult,
  readTurnArgs, readTurnResult,
  readDeltasArgs, readDeltasResult,
  authorizeKeyGenerationArgs, authorizeKeyGenerationResult,
  recordOwnerChatCallArgs, recordOwnerChatCallResult,
  authorizePayableToolArgs, authorizePayableToolResult,
  finishTurnArgs, finishTurnResult,
  issueSearchContinuationArgs, issueSearchContinuationResult,
  readSearchContinuationArgs, readSearchContinuationResult,
} from './lib/chat/turns/contracts'
import {
  ownerChatGrantStatusHandler, readTurnHandler, readDeltasHandler, authorizePayableToolHandler,
} from './lib/chat/turns/reads'
import {
  startTurnHandler, cancelTurnHandler, recordOwnerChatCallHandler, finishTurnHandler,
  issueSearchContinuation,
} from './lib/chat/turns/writes'
import { authorizeKeyTurnGeneration as authorizeKeyGenerationHandler } from './lib/chat/turns/handlers'
import { readSearchContinuation } from './lib/chat/turns/searchContinuation'

export const ownerChatGrantStatus = query({
  args: ownerChatGrantStatusArgs,
  returns: ownerChatGrantStatusResult,
  handler: ownerChatGrantStatusHandler,
})

export const startTurn = mutation({
  args: startTurnArgs,
  returns: startTurnResult,
  handler: startTurnHandler,
})

export const cancelTurn = mutation({
  args: cancelTurnArgs,
  returns: cancelTurnResult,
  handler: cancelTurnHandler,
})

export const readTurn = query({
  args: readTurnArgs,
  returns: readTurnResult,
  handler: readTurnHandler,
})

export const readDeltas = query({
  args: readDeltasArgs,
  returns: readDeltasResult,
  handler: readDeltasHandler,
})

export const authorizeKeyGeneration = internalQuery({
  args: authorizeKeyGenerationArgs,
  returns: authorizeKeyGenerationResult,
  handler: authorizeKeyGenerationHandler,
})

export const recordOwnerChatCall = internalMutation({
  args: recordOwnerChatCallArgs,
  returns: recordOwnerChatCallResult,
  handler: recordOwnerChatCallHandler,
})

export const authorizePayableTool = internalQuery({
  args: authorizePayableToolArgs,
  returns: authorizePayableToolResult,
  handler: authorizePayableToolHandler,
})

export const finishTurn = internalMutation({
  args: finishTurnArgs,
  returns: finishTurnResult,
  handler: finishTurnHandler,
})

export const issueSearchPage = internalMutation({
  args: issueSearchContinuationArgs,
  returns: issueSearchContinuationResult,
  handler: issueSearchContinuation,
})

export const readSearchPage = internalQuery({
  args: readSearchContinuationArgs,
  returns: readSearchContinuationResult,
  handler: readSearchContinuation,
})
