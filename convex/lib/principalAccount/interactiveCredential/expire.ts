import type { MutationCtx } from '../../../_generated/server'
import type { ExpireArgs, LifecycleResult } from './contracts'
import { credentialByRef, expireCredential, loadExactCredential, materializationMatches } from './credential'

export async function expireInteractiveCredentialHandler(
  ctx: MutationCtx,
  args: ExpireArgs,
): Promise<LifecycleResult> {
  const loaded = await loadExactCredential(ctx, args)
  if (loaded.kind === 'refused') {
    if (loaded.code === 'credential_not_active') {
      const existing = await credentialByRef(ctx, args.credentialRef)
      if (existing?.expiryMaterialization?.state === 'expired') return { kind: 'duplicate_expired' }
    }
    return loaded
  }
  const { credential } = loaded
  if (credential.expiresAt !== args.expectedExpiresAt
    || !materializationMatches(credential.expiryMaterialization, credential, args.scheduleNonce)
    || credential.expiryMaterialization?.state !== 'scheduled') {
    return { kind: 'refused', code: 'materialization_conflict' }
  }
  const now = Date.now()
  if (now < credential.expiresAt) return { kind: 'not_due' }
  return await expireCredential(ctx, credential, args, now)
}
