import { query } from './_generated/server'
import { listOwnedArgs, listOwnedResult, listOwnedPageArgs, listOwnedPageResult } from './lib/agentAccess/directory/contracts'
import { listOwnedHandler, listOwnedPageHandler } from './lib/agentAccess/directory/reads'

export const listOwned = query({ args: listOwnedArgs, returns: listOwnedResult, handler: listOwnedHandler })
export const listOwnedPage = query({ args: listOwnedPageArgs, returns: listOwnedPageResult, handler: listOwnedPageHandler })
