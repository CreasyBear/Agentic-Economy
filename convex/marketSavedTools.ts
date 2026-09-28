import { mutation, query } from './_generated/server'
import { agentSavedArgs, savedIdentityValue, savedListResultValue, savedRemoveResultValue, savedSaveResultValue } from './lib/market/savedTools/contracts'
import { agentList, agentRemove, agentSave, ownerList, ownerRemove, ownerSave } from './lib/market/savedTools/store'

export const listOwner = query({ args: {}, returns: savedListResultValue, handler: ownerList })
export const saveOwner = mutation({ args: { identity: savedIdentityValue }, returns: savedSaveResultValue,
  handler: (ctx, args) => ownerSave(ctx, args.identity) })
export const removeOwner = mutation({ args: { identity: savedIdentityValue }, returns: savedRemoveResultValue,
  handler: (ctx, args) => ownerRemove(ctx, args.identity) })
export const listAgent = query({ args: agentSavedArgs, returns: savedListResultValue, handler: agentList })
export const saveAgent = mutation({ args: { ...agentSavedArgs, identity: savedIdentityValue }, returns: savedSaveResultValue, handler: agentSave })
export const removeAgent = mutation({ args: { ...agentSavedArgs, identity: savedIdentityValue }, returns: savedRemoveResultValue, handler: agentRemove })
