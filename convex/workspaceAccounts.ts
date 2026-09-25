import { mutation, query } from './_generated/server'

import { readWorkspaceDecommissionEligibilityArgs, readWorkspaceDecommissionEligibilityResult, readWorkspaceDecommissionEligibilityHandler } from './lib/principalAccount/workspace/decommissionRead'
import { readWorkspaceOrganizationBindingArgs, readWorkspaceOrganizationBindingResult, readWorkspaceOrganizationBindingHandler } from './lib/principalAccount/workspace/organizationBinding'
import { renameUnboundWorkspaceArgs, renameUnboundWorkspaceResult, renameUnboundWorkspaceHandler } from './lib/principalAccount/workspace/rename'
import { closeWorkspaceArgs, closeWorkspaceResult, closeWorkspaceHandler } from './lib/principalAccount/workspace/close'
import { transferWorkspaceOwnershipArgs, transferWorkspaceOwnershipResult, transferWorkspaceOwnershipHandler } from './lib/principalAccount/workspace/ownershipTransfer'

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
