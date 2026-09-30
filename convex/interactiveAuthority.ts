import { internalAction, internalQuery, mutation } from './_generated/server'

import { clerkActiveOrganizationId } from './lib/principalAccount/interactiveAuthority/clerk'
import type { InteractiveAuthorityErrorCode } from './lib/principalAccount/interactiveAuthority/errors'
import { InteractiveAuthorityError } from './lib/principalAccount/interactiveAuthority/errors'
import {
  resolveInteractiveAuthorityContext,
  resolveMaterializedInteractiveAuthorityContext,
} from './lib/principalAccount/interactiveAuthority/factResolution'
import {
  materializeCurrentInteractiveAuthorityArgs,
  materializeCurrentInteractiveAuthorityHandler,
  materializeCurrentInteractiveAuthorityResult,
} from './lib/principalAccount/interactiveAuthority/materializeMutation'
import {
  ensureOwnerIdentityForAuthenticatedIdentity,
  type OwnerIdentityProvisioningRefs,
} from './lib/principalAccount/interactiveAuthority/provisioning'
import { requireAccessFactForAccount } from './lib/principalAccount/interactiveAuthority/accessFacts'
import {
  resolveActiveAccountRefForPrincipal,
  resolveClosedWorkspaceActorAccountRef,
} from './lib/principalAccount/interactiveAuthority/accountResolution'
import {
  readCurrentInteractiveAuthorityFactsArgs,
  readCurrentInteractiveAuthorityFactsHandler,
  readCurrentInteractiveAuthorityFactsResult,
} from './lib/principalAccount/interactiveAuthority/readFacts'
import {
  resolveCurrentInteractiveAuthorityArgs,
  resolveCurrentInteractiveAuthorityHandler,
  resolveCurrentInteractiveAuthorityResult,
} from './lib/principalAccount/interactiveAuthority/resolveCurrent'
import {
  reconcileScheduledInteractiveAuthorityArgs,
  reconcileScheduledInteractiveAuthorityHandler,
  reconcileScheduledInteractiveAuthorityResult,
  resolveScheduledInteractiveAuthorityContext,
} from './lib/principalAccount/interactiveAuthority/scheduledReconcile'
import { interactiveAuthorityContextValue } from './lib/principalAccount/interactiveAuthority/contracts'

// -- Registrations only. Validators, handler bodies, and DB logic live under --
// -- convex/lib/principalAccount/interactiveAuthority/*, grouped by concern. --
// -- preserve existing import paths for convex modules, tests, and src. --------

export { clerkActiveOrganizationId }
export type { InteractiveAuthorityErrorCode }
export { InteractiveAuthorityError }
export { interactiveAuthorityContextValue }
export {
  resolveInteractiveAuthorityContext,
  resolveMaterializedInteractiveAuthorityContext,
}
export type { OwnerIdentityProvisioningRefs }
export { ensureOwnerIdentityForAuthenticatedIdentity }
export { requireAccessFactForAccount }
export { resolveActiveAccountRefForPrincipal, resolveClosedWorkspaceActorAccountRef }
export { resolveScheduledInteractiveAuthorityContext }

/**
 * A non-cached authority consequence boundary. Wall clock validity is checked
 * here, after the cached query has returned only current database facts.
 */
export const resolveCurrentInteractiveAuthority = internalAction({
  args: resolveCurrentInteractiveAuthorityArgs,
  returns: resolveCurrentInteractiveAuthorityResult,
  handler: resolveCurrentInteractiveAuthorityHandler,
})

/**
 * This query deliberately does not read wall-clock time. Its result is safe to
 * cache because every input is a database fact and any fact change invalidates
 * the cache. Only the internal action above may turn these facts into current
 * authority.
 */
export const readCurrentInteractiveAuthorityFacts = internalQuery({
  args: readCurrentInteractiveAuthorityFactsArgs,
  returns: readCurrentInteractiveAuthorityFactsResult,
  handler: readCurrentInteractiveAuthorityFactsHandler,
})

/**
 * Session bootstrap for cache-safe authenticated reads. The verified Clerk
 * token is only a binding locator: the owner-identity provisioning seam first
 * ensures canonical authority rows exist for the verified identity, then the
 * lifecycle handler loads and validates the canonical binding and credential
 * before it schedules exact expiry.
 */
export const materializeCurrentInteractiveAuthority = mutation({
  args: materializeCurrentInteractiveAuthorityArgs,
  returns: materializeCurrentInteractiveAuthorityResult,
  handler: materializeCurrentInteractiveAuthorityHandler,
})

/**
 * Cache-safe query projection. Current validity comes exclusively from the
 * generation-bound scheduled lifecycle materialized on the credential row.
 */
export const reconcileScheduledInteractiveAuthority = internalQuery({
  args: reconcileScheduledInteractiveAuthorityArgs,
  returns: reconcileScheduledInteractiveAuthorityResult,
  handler: reconcileScheduledInteractiveAuthorityHandler,
})
