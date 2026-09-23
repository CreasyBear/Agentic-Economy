import { mutation } from './_generated/server'
import {
  checkpointProcureArgs,
  checkpointProcureHandler,
  completeProcureArgs,
  completeProcureHandler,
  procureIdentityResult,
  reserveProcureArgs,
  reserveProcureHandler,
} from './lib/callLifecycle/procureIdentity'

export const reserve = mutation({
  args: reserveProcureArgs,
  returns: procureIdentityResult,
  handler: reserveProcureHandler,
})

export const checkpointQuote = mutation({
  args: checkpointProcureArgs,
  returns: procureIdentityResult,
  handler: checkpointProcureHandler,
})

export const complete = mutation({
  args: completeProcureArgs,
  returns: procureIdentityResult,
  handler: completeProcureHandler,
})
