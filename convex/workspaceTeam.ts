import { query } from './_generated/server'

import { listDirectoryArgs, listDirectoryResult, listDirectoryHandler } from './lib/principalAccount/workspace/directory'
import { invitationContextArgs, invitationContextResult, invitationContextHandler } from './lib/principalAccount/workspace/invitation'

export const listDirectory = query({
  args: listDirectoryArgs.fields,
  returns: listDirectoryResult,
  handler: listDirectoryHandler,
})

export const invitationContext = query({
  args: invitationContextArgs.fields,
  returns: invitationContextResult,
  handler: invitationContextHandler,
})
