import type { UserIdentity } from 'convex/server'

import type { MutationCtx } from '../../../_generated/server'
import {
  armInteractiveCredentialExpiryHandler,
} from '../../../interactiveCredentialLifecycle'
import { CLERK_USER_PROVIDER_NAMESPACE } from './constants'
import { InteractiveAuthorityError } from './errors'

export async function materializeInteractiveCredentialExpiry(
  ctx: Pick<MutationCtx, 'db' | 'scheduler'>,
  identity: UserIdentity,
): Promise<void> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) return
  const bindings = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) return
  const [binding] = bindings
  if (binding === undefined) return
  const credentials = await ctx.db.query('credentials')
    .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
      .eq('bindingRef', binding.bindingRef)
      .eq('generation', binding.credentialGeneration)
      .eq('lifecycle', 'active'))
    .take(2)
  if (credentials.length !== 1) return
  const [credential] = credentials
  if (credential === undefined) return
  if (credential.type !== 'provider_token'
    || credential.principalRef !== binding.principalRef
    || typeof identity.exp !== 'number'
    || !Number.isSafeInteger(identity.exp)
    || identity.exp * 1_000 !== credential.expiresAt) return
  const result = await armInteractiveCredentialExpiryHandler(ctx as MutationCtx, {
    bindingRef: binding.bindingRef,
    credentialRef: credential.credentialRef,
    expectedGeneration: credential.generation,
  })
  if (result.kind === 'refused') throw new InteractiveAuthorityError('credential_not_current')
}
