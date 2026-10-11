import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import {
  deletionNoticeArgs,
  sendDeletionNoticeHandler,
  retirePersonalAccountForServerArgs,
  retirePersonalAccountForServerHandler,
  retirePersonalAccountForServerResult,
} from './lib/principalAccount/personalAccount/retire'
import { revokeMachineAgentsChunk as revokeMachineAgentsChunkHandler, revokeMachineAgentsChunkArgs } from './lib/principalAccount/personalAccount/retireDependents'
import {
  readDeletionEligibilityArgs,
  readDeletionEligibilityHandler,
  readDeletionEligibilityResult,
} from './lib/principalAccount/personalAccount/eligibility'
import {
  exportUserDataArgs,
  exportUserDataHandler,
  exportUserDataResult,
} from './lib/principalAccount/personalAccount/exportData'

export const retirePersonalAccountForServer = mutation({
  args: retirePersonalAccountForServerArgs.fields,
  returns: retirePersonalAccountForServerResult,
  handler: retirePersonalAccountForServerHandler,
})

export const sendDeletionNotice = internalMutation({
  args: deletionNoticeArgs,
  returns: v.null(),
  handler: sendDeletionNoticeHandler,
})

export const revokeMachineAgentsChunk = internalMutation({
  args: revokeMachineAgentsChunkArgs,
  returns: v.null(),
  handler: (ctx, args) => revokeMachineAgentsChunkHandler(ctx, args),
})

export const readDeletionEligibility = internalQuery({
  args: readDeletionEligibilityArgs,
  returns: readDeletionEligibilityResult,
  handler: readDeletionEligibilityHandler,
})

export const exportUserData = query({
  args: exportUserDataArgs,
  returns: exportUserDataResult,
  handler: exportUserDataHandler,
})
