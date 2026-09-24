import { action, internalMutation, query } from './_generated/server'
import {
  listOwnerObligationsArgs,
  listOwnerObligationsResult,
  listOwnerObligationsHandler,
} from './lib/money/providerObligations/reads'
import {
  prepareOwnerReversalArgs,
  prepareOwnerReversalResult,
  prepareOwnerReversalHandler,
} from './lib/money/providerObligations/prepare'
import {
  reverseOwnerSettlementArgs,
  reverseOwnerSettlementResult,
  reverseOwnerSettlementHandler,
} from './lib/money/providerObligations/reverse'
import {
  finalizeOwnerReversalArgs,
  finalizeOwnerReversalResult,
  finalizeOwnerReversalHandler,
  markOwnerReversalUnknownArgs,
  markOwnerReversalUnknownResult,
  markOwnerReversalUnknownHandler,
} from './lib/money/providerObligations/finalize'

export const listOwnerObligations = query({
  args: listOwnerObligationsArgs,
  returns: listOwnerObligationsResult,
  handler: listOwnerObligationsHandler,
})

export const prepareOwnerReversal = internalMutation({
  args: prepareOwnerReversalArgs,
  returns: prepareOwnerReversalResult,
  handler: prepareOwnerReversalHandler,
})

export const reverseOwnerSettlement = action({
  args: reverseOwnerSettlementArgs,
  returns: reverseOwnerSettlementResult,
  handler: reverseOwnerSettlementHandler,
})

export const finalizeOwnerReversal = internalMutation({
  args: finalizeOwnerReversalArgs,
  returns: finalizeOwnerReversalResult,
  handler: finalizeOwnerReversalHandler,
})

export const markOwnerReversalUnknown = internalMutation({
  args: markOwnerReversalUnknownArgs,
  returns: markOwnerReversalUnknownResult,
  handler: markOwnerReversalUnknownHandler,
})
