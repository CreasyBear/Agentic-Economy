import { type RegisteredMutation } from 'convex/server'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { listOwnerGrantReadbacksArgs, listOwnerGrantReadbacksResult, listOwnerGrantReadbacksHandler, readGrantArgs, readGrantHandler, readActiveGrantArgs, readActiveGrantHandler, grantReadResult } from './lib/agentAccess/policy/reads'
import { registerGrantForServerArgs, grantWriteForServerResult, registerGrantForServerHandler, type RegisterGrantForServerArgs, type RegisterGrantForServerResult } from './lib/agentAccess/policy/registration'
import { upsertGrantArgs, grantWriteResult, upsertGrantHandler, revokeGrantArgs, grantRevocationResult, revokeGrantHandler } from './lib/agentAccess/policy/writes'

export const listOwnerGrantReadbacks = query({
  args: listOwnerGrantReadbacksArgs,
  returns: listOwnerGrantReadbacksResult,
  handler: listOwnerGrantReadbacksHandler,
})

export const registerGrantForServer: RegisteredMutation<'public', RegisterGrantForServerArgs, RegisterGrantForServerResult> = mutation({
  args: registerGrantForServerArgs,
  returns: grantWriteForServerResult,
  handler: registerGrantForServerHandler,
})

export const upsertGrant = internalMutation({
  args: upsertGrantArgs,
  returns: grantWriteResult,
  handler: upsertGrantHandler,
})

export const readGrant = internalQuery({
  args: readGrantArgs,
  returns: grantReadResult,
  handler: readGrantHandler,
})

export const readActiveGrant = internalQuery({
  args: readActiveGrantArgs,
  returns: grantReadResult,
  handler: readActiveGrantHandler,
})

/** Internal lifecycle primitive. Owner-facing revocation uses the canonical
 * agent lifecycle commands, never this grant-shaped seam directly. */
export const revokeGrant = internalMutation({
  args: revokeGrantArgs,
  returns: grantRevocationResult,
  handler: revokeGrantHandler,
})
