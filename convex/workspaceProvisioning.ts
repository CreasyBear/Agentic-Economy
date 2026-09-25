import { internalMutation } from './_generated/server'
import {
  provisionOrganizationWorkspaceForServerArgs,
  provisionOrganizationWorkspaceForServerHandler,
  provisionOrganizationWorkspaceForServerResult,
} from './lib/principalAccount/provisioning/provision'

export const provisionOrganizationWorkspaceForServer = internalMutation({
  args: provisionOrganizationWorkspaceForServerArgs.fields,
  returns: provisionOrganizationWorkspaceForServerResult,
  handler: provisionOrganizationWorkspaceForServerHandler,
})
