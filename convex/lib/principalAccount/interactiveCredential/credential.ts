import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { LifecycleArgs, LifecycleResult } from './contracts'
import { interactiveCredentialExpiryNonce } from './nonce'

export async function loadExactCredential(
  ctx: MutationCtx,
  args: LifecycleArgs,
): Promise<
  | Readonly<{ kind: 'loaded'; credential: Doc<'credentials'> }>
  | Extract<LifecycleResult, { kind: 'refused' }>
> {
  const [binding, credential] = await Promise.all([
    ctx.db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', args.bindingRef)).unique(),
    credentialByRef(ctx, args.credentialRef),
  ])
  if (binding === null) return { kind: 'refused', code: 'binding_missing' }
  if (credential === null) return { kind: 'refused', code: 'credential_missing' }
  if (!Number.isSafeInteger(args.expectedGeneration)
    || args.expectedGeneration < 1
    || credential.bindingRef !== args.bindingRef
    || credential.generation !== args.expectedGeneration
    || credential.type !== 'provider_token') {
    return { kind: 'refused', code: 'credential_mismatch' }
  }
  if (binding.bindingRef !== credential.bindingRef
    || binding.principalRef !== credential.principalRef
    || binding.credentialGeneration !== credential.generation
    || binding.lifecycle !== 'active'
    || binding.providerNamespace !== 'clerk/user') {
    return { kind: 'refused', code: 'binding_mismatch' }
  }
  if (credential.lifecycle !== 'active') return { kind: 'refused', code: 'credential_not_active' }
  return { kind: 'loaded', credential }
}

export async function credentialByRef(ctx: MutationCtx, ref: string) {
  return await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', ref)).unique()
}

export async function expireCredential(
  ctx: MutationCtx,
  credential: Doc<'credentials'>,
  args: LifecycleArgs,
  now: number,
): Promise<LifecycleResult> {
  const nonce = interactiveCredentialExpiryNonce(credential)
  await ctx.db.patch(credential._id, {
    lifecycle: 'stale',
    staleAt: credential.expiresAt,
    revision: credential.revision + 1,
    updatedAt: now,
    expiryMaterialization: {
      state: 'expired',
      credentialGeneration: args.expectedGeneration,
      credentialExpiresAt: credential.expiresAt,
      scheduleNonce: nonce,
      ...(credential.expiryMaterialization?.scheduleRef === undefined
        ? {}
        : { scheduleRef: credential.expiryMaterialization.scheduleRef }),
      materializedAt: now,
    },
  })
  return { kind: 'expired' }
}

export function materializationMatches(
  materialization: Doc<'credentials'>['expiryMaterialization'],
  credential: Doc<'credentials'>,
  nonce: string,
): boolean {
  return materialization !== undefined
    && materialization.credentialGeneration === credential.generation
    && materialization.credentialExpiresAt === credential.expiresAt
    && materialization.scheduleNonce === nonce
}
