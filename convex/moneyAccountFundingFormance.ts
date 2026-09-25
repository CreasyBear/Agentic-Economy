import { action, internalAction } from './_generated/server'
import {
  applyVerifiedEventFromInboxArgs,
  applyVerifiedEventFromInboxHandler,
  applyVerifiedEventFromInboxResult,
} from './lib/money/funding/formanceEvent'
import {
  readBalanceArgs,
  readBalanceHandler,
  readBalanceResult,
} from './lib/money/funding/formanceBalance'

export const applyVerifiedEventFromInbox = internalAction({
  args: applyVerifiedEventFromInboxArgs.fields,
  returns: applyVerifiedEventFromInboxResult,
  handler: applyVerifiedEventFromInboxHandler,
})

export const readBalance = action({
  args: readBalanceArgs,
  returns: readBalanceResult,
  handler: readBalanceHandler,
})
