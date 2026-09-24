import { mutation } from './_generated/server'
import {
  recordOrganizationInvitationCreatedForServerArgs,
  recordOrganizationInvitationCreatedForServerResult,
  recordOrganizationInvitationRevokedForServerArgs,
  recordOrganizationInvitationRevokedForServerResult,
} from './lib/principalAccount/invitations/contracts'
import { recordOrganizationInvitationCreatedForServerHandler } from './lib/principalAccount/invitations/invitationCreated'
import { recordOrganizationInvitationRevokedForServerHandler } from './lib/principalAccount/invitations/invitationRevoked'

export const recordOrganizationInvitationCreatedForServer = mutation({
  args: recordOrganizationInvitationCreatedForServerArgs,
  returns: recordOrganizationInvitationCreatedForServerResult,
  handler: recordOrganizationInvitationCreatedForServerHandler,
})

export const recordOrganizationInvitationRevokedForServer = mutation({
  args: recordOrganizationInvitationRevokedForServerArgs,
  returns: recordOrganizationInvitationRevokedForServerResult,
  handler: recordOrganizationInvitationRevokedForServerHandler,
})
