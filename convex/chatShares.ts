import { mutation, query } from './_generated/server'
import {
  getShareStateArgs,
  getShareStateHandler,
  getShareStateResult,
  issueShareArgs,
  issueShareHandler,
  issueShareResult,
  revokeShareArgs,
  revokeShareHandler,
  revokeShareResult,
} from './lib/chat/shares/grants'
import {
  listSharedMessagesArgs,
  listSharedMessagesHandler,
} from './lib/chat/shares/reads'
import { listSharedMessagesResult } from './lib/chat/shares/contracts'

export const issueShare = mutation({
  args: issueShareArgs,
  returns: issueShareResult,
  handler: issueShareHandler,
})

export const revokeShare = mutation({
  args: revokeShareArgs,
  returns: revokeShareResult,
  handler: revokeShareHandler,
})

export const getShareState = query({
  args: getShareStateArgs,
  returns: getShareStateResult,
  handler: getShareStateHandler,
})

export const listSharedMessages = query({
  args: listSharedMessagesArgs,
  returns: listSharedMessagesResult,
  handler: listSharedMessagesHandler,
})
