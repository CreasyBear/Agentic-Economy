import { mutation, query } from './_generated/server'

import { readWorkspaceDecommissionEligibilityArgs, readWorkspaceDecommissionEligibilityResult, readWorkspaceDecommissionEligibilityHandler } from './lib/workspace/decommissionRead'
import { readWorkspaceOrganizationBindingArgs, readWorkspaceOrganizationBindingResult, readWorkspaceOrganizationBindingHandler } from './lib/workspace/organizationBinding'
import { renameUnboundWorkspaceArgs, renameUnboundWorkspaceResult, renameUnboundWorkspaceHandler } from './lib/workspace/rename'
import { closeWorkspaceArgs, closeWorkspaceResult, closeWorkspaceHandler } from './lib/workspace/close'
import { transferWorkspaceOwnershipArgs, transferWorkspaceOwnershipResult, transferWorkspaceOwnershipHandler } from './lib/workspace/ownershipTransfer'

export const readWorkspaceDecommissionEligibility = query({
  args: readWorkspaceDecommissionEligibilityArgs.fields,
  returns: readWorkspaceDecommissionEligibilityResult,
  handler: readWorkspaceDecommissionEligibilityHandler,
})

export const readWorkspaceOrganizationBinding = query({
  args: readWorkspaceOrganizationBindingArgs.fields,
  returns: readWorkspaceOrganizationBindingResult,
  handler: readWorkspaceOrganizationBindingHandler,
})

export const renameUnboundWorkspace = mutation({
  args: renameUnboundWorkspaceArgs.fields,
  returns: renameUnboundWorkspaceResult,
  handler: renameUnboundWorkspaceHandler,
})

export const closeWorkspace = mutation({
  args: closeWorkspaceArgs.fields,
  returns: closeWorkspaceResult,
  handler: closeWorkspaceHandler,
})

export const transferWorkspaceOwnership = mutation({
  args: transferWorkspaceOwnershipArgs.fields,
  returns: transferWorkspaceOwnershipResult,
  handler: transferWorkspaceOwnershipHandler,
})
