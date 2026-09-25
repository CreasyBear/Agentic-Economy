import { v } from 'convex/values'

import type { MutationCtx } from '../../../_generated/server'
import { resolveInteractiveAuthorityContext } from './factResolution'
import { InteractiveAuthorityError } from './errors'
import { ensureOwnerIdentityForAuthenticatedIdentity, logProvisionRefusal } from './provisioning'

export const materializeCurrentInteractiveAuthorityArgs = {}

export const materializeCurrentInteractiveAuthorityResult = v.boolean()

export async function materializeCurrentInteractiveAuthorityHandler(
  ctx: MutationCtx,
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    logProvisionRefusal('mutation_identity_null')
    return false
  }
  try {
    await ensureOwnerIdentityForAuthenticatedIdentity(ctx, identity)
    await resolveInteractiveAuthorityContext(ctx, identity)
    return true
  } catch (error) {
    if (error instanceof InteractiveAuthorityError) {
      if (error.code === 'active_account_selection_required') return true
      logProvisionRefusal('materialize_failed', { code: error.code })
      return false
    }
    throw error
  }
}
