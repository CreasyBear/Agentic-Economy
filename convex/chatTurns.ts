import { internalMutation, internalQuery, mutation, query } from './_generated/server'
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
} from './lib/chat/turns/contracts'
import {
  ownerChatGrantStatusHandler, readTurnHandler, readDeltasHandler, authorizePayableToolHandler,
} from './lib/chat/turns/reads'
import {
  startTurnHandler, cancelTurnHandler, recordOwnerChatCallHandler, finishTurnHandler,
} from './lib/chat/turns/writes'
import { authorizeKeyTurnGeneration as authorizeKeyGenerationHandler } from './lib/chat/turns/handlers'

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
