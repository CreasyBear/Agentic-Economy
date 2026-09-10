import { v } from 'convex/values'
import type { RegisteredMutation } from 'convex/server'
import { mutation, internalMutation, internalQuery } from './_generated/server'
import { serviceAssertion } from './serviceAssertion'
import {
  agentAccessPrincipalValue,
  verifySupplyAgentPrincipal,
  verifyMarketAgentPrincipal,
} from './lib/agentAccess/principals/verification'
import {
  agentPrincipalArgs,
  agentPrincipalResult,
  registerAgentPrincipalResult,
  getAgentPrincipalResult,
  canonicalAgentDelegationScopes,
  recordAgentPrincipalHandler,
  registerAgentPrincipalHandler,
  getAgentPrincipalHandler,
} from './lib/agentAccess/principals/records'
import {
  issuedBindingArgs,
  issuedBindingResult,
  renameAgentArgs,
  renameAgentResult,
  registerIssuedAgentBindingForServerHandler,
  renameAgentForServerHandler,
  type RegisterIssuedBindingArgs,
  type RegisterIssuedBindingResult,
} from './lib/agentAccess/principals/bindings'
import {
  replacementRegistrationArgs,
  replacementRegistrationResult,
  replacementTransitionArgs,
  replacementTransitionResult,
  prepareCredentialReplacementForServerHandler,
  promoteCredentialReplacementForServerHandler,
  cancelCredentialReplacementForServerHandler,
  prepareCredentialReplacementCore,
  transitionCredentialReplacementCore,
  revokeReplacementMaterial,
} from './lib/agentAccess/principals/replacement'
import {
  revokeCredentialArgs,
  disconnectAgentArgs,
  recordProviderRevocationArgs,
  lifecycleCommandResult,
  providerRevocationResult,
  revokeCredentialForServerHandler,
  disconnectAgentForServerHandler,
  recordProviderRevocationForServerHandler,
  revokeCanonicalCredentialForService,
  invalidateOAuthRefreshFamilies,
} from './lib/agentAccess/principals/revocation'

// -- Validators / plain helpers re-exported at their original module path so ----
// -- existing importers (convex/agentAccessOAuth.ts, tests, src/modules/*) -----
// -- keep working unchanged. Handler bodies and DB logic live under -----------
// -- convex/lib/agentAccess/principals/*, grouped by concern. -----------------
export { agentAccessPrincipalValue, verifySupplyAgentPrincipal, verifyMarketAgentPrincipal }
export type { AgentAccessPrincipalValue, AgentPrincipalAdmission, AgentSupplyPrincipalAdmission } from './lib/agentAccess/principals/verification'
export { canonicalAgentDelegationScopes }
export type { CanonicalCredentialOwner } from './lib/agentAccess/principals/records'
export { prepareCredentialReplacementCore, transitionCredentialReplacementCore, revokeReplacementMaterial }
export { revokeCanonicalCredentialForService, invalidateOAuthRefreshFamilies }

export const registerIssuedAgentBindingForServer: RegisteredMutation<'public', RegisterIssuedBindingArgs, RegisterIssuedBindingResult> = mutation({
  args: { ...issuedBindingArgs, serviceAuth: serviceAssertion },
  returns: issuedBindingResult,
  handler: registerIssuedAgentBindingForServerHandler,
})

export const renameAgentForServer = mutation({
  args: renameAgentArgs,
  returns: renameAgentResult,
  handler: renameAgentForServerHandler,
})

export const prepareCredentialReplacementForServer = mutation({
  args: { ...replacementRegistrationArgs, serviceAuth: serviceAssertion },
  returns: replacementRegistrationResult,
  handler: prepareCredentialReplacementForServerHandler,
})

export const promoteCredentialReplacementForServer = mutation({
  args: { ...replacementTransitionArgs, serviceAuth: serviceAssertion },
  returns: replacementTransitionResult,
  handler: promoteCredentialReplacementForServerHandler,
})

export const cancelCredentialReplacementForServer = mutation({
  args: { ...replacementTransitionArgs, serviceAuth: serviceAssertion },
  returns: replacementTransitionResult,
  handler: cancelCredentialReplacementForServerHandler,
})

export const revokeCredentialForServer = mutation({
  args: { ...revokeCredentialArgs, serviceAuth: serviceAssertion },
  returns: lifecycleCommandResult,
  handler: revokeCredentialForServerHandler,
})

export const disconnectAgentForServer = mutation({
  args: { ...disconnectAgentArgs, serviceAuth: serviceAssertion },
  returns: lifecycleCommandResult,
  handler: disconnectAgentForServerHandler,
})

export const recordProviderRevocationForServer = mutation({
  args: { ...recordProviderRevocationArgs, serviceAuth: serviceAssertion },
  returns: providerRevocationResult,
  handler: recordProviderRevocationForServerHandler,
})

export const recordAgentPrincipal = internalMutation({
  args: {
    ...agentPrincipalArgs,
    ownerId: v.string(),
    ownerTokenIdentifier: v.optional(v.string()),
  },
  returns: agentPrincipalResult,
  handler: recordAgentPrincipalHandler,
})

export const registerAgentPrincipal = mutation({
  args: agentPrincipalArgs,
  returns: registerAgentPrincipalResult,
  handler: registerAgentPrincipalHandler,
})

export const getAgentPrincipal = internalQuery({
  args: { principalId: v.string() },
  returns: getAgentPrincipalResult,
  handler: getAgentPrincipalHandler,
})
