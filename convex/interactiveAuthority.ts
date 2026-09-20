import { internalAction, internalQuery, mutation } from './_generated/server'

import type { InteractiveAccountSelectionState } from './lib/interactiveAuthority/clerk'
import { clerkActiveOrganizationId } from './lib/interactiveAuthority/clerk'
import type { InteractiveAuthorityErrorCode } from './lib/interactiveAuthority/errors'
import { InteractiveAuthorityError } from './lib/interactiveAuthority/errors'
import {
  resolveInteractiveAuthorityContext,
  resolveMaterializedInteractiveAuthorityContext,
} from './lib/interactiveAuthority/factResolution'
import {
  materializeCurrentInteractiveAuthorityArgs,
  materializeCurrentInteractiveAuthorityHandler,
  materializeCurrentInteractiveAuthorityResult,
} from './lib/interactiveAuthority/materializeMutation'
import {
  ensureOwnerIdentityForAuthenticatedIdentity,
  type OwnerIdentityProvisioningRefs,
} from './lib/interactiveAuthority/provisioning'
import { requireAccessFactForAccount } from './lib/interactiveAuthority/accessFacts'
import { resolveActiveAccountRefForPrincipal } from './lib/interactiveAuthority/accountResolution'
import {
  readCurrentInteractiveAuthorityFactsArgs,
  readCurrentInteractiveAuthorityFactsHandler,
  readCurrentInteractiveAuthorityFactsResult,
} from './lib/interactiveAuthority/readFacts'
import {
  resolveCurrentInteractiveAuthorityArgs,
  resolveCurrentInteractiveAuthorityHandler,
  resolveCurrentInteractiveAuthorityResult,
} from './lib/interactiveAuthority/resolveCurrent'
import {
  reconcileScheduledInteractiveAuthorityArgs,
  reconcileScheduledInteractiveAuthorityHandler,
  reconcileScheduledInteractiveAuthorityResult,
  resolveScheduledInteractiveAuthorityContext,
} from './lib/interactiveAuthority/scheduledReconcile'
import { interactiveAuthorityContextValue } from './lib/interactiveAuthority/validators'

// -- Registrations only. Validators, handler bodies, and DB logic live under --
// -- convex/lib/interactiveAuthority/*, grouped by concern. Re-exports below --
// -- preserve existing import paths for convex modules, tests, and src. --------

export type { InteractiveAccountSelectionState }
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
export { resolveActiveAccountRefForPrincipal }
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
