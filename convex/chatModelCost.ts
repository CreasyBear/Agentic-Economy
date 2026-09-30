import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'
import {
  chatModelCostBeginValue, chatModelCostObserveValue, chatModelCostStatsClaimValue, chatModelCostSummaryValue,
} from '@/modules/chat/model-cost'
import { beginHandler, observeHandler, claimStatsLookupHandler, readTurnHandler } from './lib/chat/turns/modelCost'

export const begin = internalMutation({ args: chatModelCostBeginValue.fields, returns: v.null(), handler: beginHandler })
export const observe = internalMutation({ args: chatModelCostObserveValue.fields, returns: v.null(), handler: observeHandler })
export const claimStatsLookup = internalMutation({
  args: { requestRef: v.string(), attempt: v.number() }, returns: chatModelCostStatsClaimValue, handler: claimStatsLookupHandler,
})
export const readTurn = internalQuery({ args: { turnRef: v.string() }, returns: chatModelCostSummaryValue, handler: readTurnHandler })
