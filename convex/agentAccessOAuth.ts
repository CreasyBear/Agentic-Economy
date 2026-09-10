import { internalMutation, mutation, query } from './_generated/server'
import {
  cleanupExpiredOAuthGrantsArgs,
  cleanupExpiredOAuthGrantsResult,
  cleanupExpiredOAuthGrantsHandler,
  insertGrantArgs,
  insertGrantResult,
  insertGrantHandler,
  getGrantByHashArgs,
  getGrantByHashResult,
  getGrantByHashHandler,
  getGrantByRefArgs,
  getGrantByRefResult,
  getGrantByRefHandler,
  updateGrantArgs,
  updateGrantResult,
  updateGrantHandler,
} from './lib/agentAccess/oauth/grants'
import {
  insertClientArgs,
  insertClientResult,
  insertClientHandler,
  getClientArgs,
  getClientResult,
  getClientHandler,
} from './lib/agentAccess/oauth/clients'
import {
  reserveAgentAccessConsentArgs,
  reserveAgentAccessConsentResult,
  reserveAgentAccessConsentHandler,
} from './lib/agentAccess/oauth/consent'
import {
  listOwnerConnectionReadbacksArgs,
  listOwnerConnectionReadbacksResult,
  listOwnerConnectionReadbacksHandler,
  listOwnerReconnectCandidatesArgs,
  listOwnerReconnectCandidatesResult,
  listOwnerReconnectCandidatesHandler,
  listOwnerConnectionHistoryArgs,
  listOwnerConnectionHistoryResult,
  listOwnerConnectionHistoryHandler,
  revokeOwnerConnectionArgs,
  revokeOwnerConnectionResult,
  revokeOwnerConnectionHandler,
} from './lib/agentAccess/oauth/ownerConnections'
import {
  createRefreshFamilyArgs,
  createRefreshFamilyResult,
  createRefreshFamilyHandler,
  claimRefreshFamilyArgs,
  claimRefreshFamilyResult,
  claimRefreshFamilyHandler,
  commitRefreshFamilyRotationArgs,
  commitRefreshFamilyRotationResult,
  commitRefreshFamilyRotationHandler,
  revokeRefreshFamilyArgs,
  revokeRefreshFamilyResult,
  revokeRefreshFamilyHandler,
  revokeRefreshFamilyByAccessTokenArgs,
  revokeRefreshFamilyByAccessTokenResult,
  revokeRefreshFamilyByAccessTokenHandler,
} from './lib/agentAccess/oauth/refreshFamilies'

// -- Registrations only. Handler bodies and DB logic live under -------------
// -- convex/lib/agentAccess/oauth/*, grouped by concern: grants, clients, ---
// -- consent, owner connections, and refresh families. -----------------------

export const cleanupExpiredOAuthGrants = internalMutation({
  args: cleanupExpiredOAuthGrantsArgs,
  returns: cleanupExpiredOAuthGrantsResult,
  handler: cleanupExpiredOAuthGrantsHandler,
})

export const insertGrant = mutation({
  args: insertGrantArgs,
  returns: insertGrantResult,
  handler: insertGrantHandler,
})

export const getGrantByHash = query({
  args: getGrantByHashArgs,
  returns: getGrantByHashResult,
  handler: getGrantByHashHandler,
})

export const getGrantByRef = query({
  args: getGrantByRefArgs,
  returns: getGrantByRefResult,
  handler: getGrantByRefHandler,
})

export const updateGrant = mutation({
  args: updateGrantArgs,
  returns: updateGrantResult,
  handler: updateGrantHandler,
})

export const reserveAgentAccessConsent = mutation({
  args: reserveAgentAccessConsentArgs,
  returns: reserveAgentAccessConsentResult,
  handler: reserveAgentAccessConsentHandler,
})

export const insertClient = mutation({
  args: insertClientArgs,
  returns: insertClientResult,
  handler: insertClientHandler,
})

export const getClient = query({
  args: getClientArgs,
  returns: getClientResult,
  handler: getClientHandler,
})

export const listOwnerConnectionReadbacks = query({
  args: listOwnerConnectionReadbacksArgs,
  returns: listOwnerConnectionReadbacksResult,
  handler: listOwnerConnectionReadbacksHandler,
})

export const listOwnerReconnectCandidates = query({
  args: listOwnerReconnectCandidatesArgs,
  returns: listOwnerReconnectCandidatesResult,
  handler: listOwnerReconnectCandidatesHandler,
})

export const listOwnerConnectionHistory = query({
  args: listOwnerConnectionHistoryArgs,
  returns: listOwnerConnectionHistoryResult,
  handler: listOwnerConnectionHistoryHandler,
})

export const revokeOwnerConnection = mutation({
  args: revokeOwnerConnectionArgs,
  returns: revokeOwnerConnectionResult,
  handler: revokeOwnerConnectionHandler,
})

export const createRefreshFamily = mutation({
  args: createRefreshFamilyArgs,
  returns: createRefreshFamilyResult,
  handler: createRefreshFamilyHandler,
})

export const claimRefreshFamily = mutation({
  args: claimRefreshFamilyArgs,
  returns: claimRefreshFamilyResult,
  handler: claimRefreshFamilyHandler,
})

export const commitRefreshFamilyRotation = mutation({
  args: commitRefreshFamilyRotationArgs,
  returns: commitRefreshFamilyRotationResult,
  handler: commitRefreshFamilyRotationHandler,
})

export const revokeRefreshFamily = mutation({
  args: revokeRefreshFamilyArgs,
  returns: revokeRefreshFamilyResult,
  handler: revokeRefreshFamilyHandler,
})

export const revokeRefreshFamilyByAccessToken = mutation({
  args: revokeRefreshFamilyByAccessTokenArgs,
  returns: revokeRefreshFamilyByAccessTokenResult,
  handler: revokeRefreshFamilyByAccessTokenHandler,
})
