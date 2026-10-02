import { v } from 'convex/values'

import { httpAction, query } from './_generated/server'
import { anonymousChatHandler } from './lib/chat/anonymous/http'
import { anonymousChatRecipient } from './lib/chat/anonymous/recipient'

export const anonymousChat = httpAction(anonymousChatHandler)

export const recipient = query({
  args: {},
  returns: v.union(v.null(), v.object({ label: v.string(), host: v.string() })),
  handler: () => anonymousChatRecipient(),
})
