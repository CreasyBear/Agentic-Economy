import { mutation } from './_generated/server'
import {
  recordOrganizationMembershipCreatedForServerArgs,
  recordOrganizationMembershipCreatedForServerResult,
  recordOrganizationMembershipUpdatedForServerArgs,
  recordOrganizationMembershipUpdatedForServerResult,
  recordOrganizationMembershipDeletedForServerArgs,
  recordOrganizationMembershipDeletedForServerResult,
} from './lib/principalAccount/memberships/contracts'
import { recordOrganizationMembershipCreatedForServerHandler } from './lib/principalAccount/memberships/membershipCreated'
import { recordOrganizationMembershipUpdatedForServerHandler } from './lib/principalAccount/memberships/membershipUpdated'
import { recordOrganizationMembershipDeletedForServerHandler } from './lib/principalAccount/memberships/membershipDeleted'

export const recordOrganizationMembershipCreatedForServer = mutation({
  args: recordOrganizationMembershipCreatedForServerArgs,
  returns: recordOrganizationMembershipCreatedForServerResult,
  handler: recordOrganizationMembershipCreatedForServerHandler,
})

export const recordOrganizationMembershipUpdatedForServer = mutation({
  args: recordOrganizationMembershipUpdatedForServerArgs,
  returns: recordOrganizationMembershipUpdatedForServerResult,
  handler: recordOrganizationMembershipUpdatedForServerHandler,
})

export const recordOrganizationMembershipDeletedForServer = mutation({
  args: recordOrganizationMembershipDeletedForServerArgs,
  returns: recordOrganizationMembershipDeletedForServerResult,
  handler: recordOrganizationMembershipDeletedForServerHandler,
})
