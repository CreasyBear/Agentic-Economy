import { mutation } from './_generated/server'
import {
  provisionOrganizationWorkspaceForServerArgs,
  provisionOrganizationWorkspaceForServerHandler,
  provisionOrganizationWorkspaceForServerResult,
} from './lib/principalAccount/provisioning/provision'

export const provisionOrganizationWorkspaceForServer = mutation({
  args: provisionOrganizationWorkspaceForServerArgs.fields,
  returns: provisionOrganizationWorkspaceForServerResult,
  handler: provisionOrganizationWorkspaceForServerHandler,
})
