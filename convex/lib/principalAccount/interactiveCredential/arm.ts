import { makeFunctionReference } from 'convex/server'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { ExpireArgs, LifecycleArgs, LifecycleResult, ScheduledResult } from './contracts'
import { expireCredential, loadExactCredential, materializationMatches } from './credential'
import { interactiveCredentialExpiryNonce } from './nonce'

const expireInteractiveCredentialRef = makeFunctionReference<
  'mutation',
  ExpireArgs,
  LifecycleResult
>('interactiveCredentialLifecycle:expireInteractiveCredential')

export async function armInteractiveCredentialExpiryHandler(
  ctx: MutationCtx,
  args: LifecycleArgs,
): Promise<LifecycleResult> {
  const loaded = await loadExactCredential(ctx, args)
  if (loaded.kind === 'refused') return loaded
  const { credential } = loaded
  const now = Date.now()
  if (now >= credential.expiresAt) {
    return await expireCredential(ctx, credential, args, now)
  }
  const nonce = interactiveCredentialExpiryNonce(credential)
  const materialization = credential.expiryMaterialization
  if (materialization !== undefined) {
    if (!materializationMatches(materialization, credential, nonce)) {
      return { kind: 'refused', code: 'materialization_conflict' }
    }
    if (materialization.state === 'expired') return { kind: 'duplicate_expired' }
    if (materialization.state === 'scheduled' && materialization.scheduleRef !== undefined) {
      return scheduledProjection('duplicate', credential, materialization.scheduleRef, nonce)
    }
  }
  const scheduleRef = String(await ctx.scheduler.runAt(
    credential.expiresAt,
    expireInteractiveCredentialRef,
    {
      ...args,
      expectedExpiresAt: credential.expiresAt,
      scheduleNonce: nonce,
    },
  ))
  await ctx.db.patch(credential._id, {
    expiryMaterialization: {
      state: 'scheduled',
      credentialGeneration: credential.generation,
      credentialExpiresAt: credential.expiresAt,
      scheduleNonce: nonce,
      scheduleRef,
      materializedAt: now,
    },
    updatedAt: now,
  })
  return scheduledProjection('scheduled', credential, scheduleRef, nonce)
}

function scheduledProjection(
  kind: 'scheduled' | 'duplicate',
  credential: Doc<'credentials'>,
  scheduleRef: string,
  nonce: string,
): ScheduledResult {
  return {
    kind,
    credentialGeneration: credential.generation,
    expiresAt: credential.expiresAt,
    scheduleNonce: nonce,
    scheduleRef,
  }
}
