import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'

const lifecycleResultValue = v.union(
  v.object({
    kind: v.literal('scheduled'),
    credentialGeneration: v.number(),
    expiresAt: v.number(),
    scheduleNonce: v.string(),
    scheduleRef: v.string(),
  }),
  v.object({
    kind: v.literal('duplicate'),
    credentialGeneration: v.number(),
    expiresAt: v.number(),
    scheduleNonce: v.string(),
    scheduleRef: v.string(),
  }),
  v.object({ kind: v.literal('expired') }),
  v.object({ kind: v.literal('duplicate_expired') }),
  v.object({ kind: v.literal('not_due') }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('credential_missing'),
      v.literal('credential_mismatch'),
      v.literal('binding_missing'),
      v.literal('binding_mismatch'),
      v.literal('credential_not_active'),
      v.literal('materialization_conflict'),
    ),
  }),
)

const lifecycleArgs = {
  bindingRef: v.string(),
  credentialRef: v.string(),
  expectedGeneration: v.number(),
} as const

const expireArgs = {
  ...lifecycleArgs,
  expectedExpiresAt: v.number(),
  scheduleNonce: v.string(),
} as const

type LifecycleArgs = Readonly<{
  bindingRef: string
  credentialRef: string
  expectedGeneration: number
}>

type ExpireArgs = LifecycleArgs & Readonly<{
  expectedExpiresAt: number
  scheduleNonce: string
}>

const expireInteractiveCredentialRef = makeFunctionReference<
  'mutation',
  ExpireArgs,
  LifecycleResult
>('interactiveCredentialLifecycle:expireInteractiveCredential')

type ScheduledResult = Readonly<{
  kind: 'scheduled' | 'duplicate'
  credentialGeneration: number
  expiresAt: number
  scheduleNonce: string
  scheduleRef: string
}>

type LifecycleResult =
  | ScheduledResult
  | Readonly<{ kind: 'expired' | 'duplicate_expired' | 'not_due' }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'credential_missing'
        | 'credential_mismatch'
        | 'binding_missing'
        | 'binding_mismatch'
        | 'credential_not_active'
        | 'materialization_conflict'
    }>

export const armInteractiveCredentialExpiry = internalMutation({
  args: lifecycleArgs,
  returns: lifecycleResultValue,
  handler: armInteractiveCredentialExpiryHandler,
})

export const expireInteractiveCredential = internalMutation({
  args: expireArgs,
  returns: lifecycleResultValue,
  handler: expireInteractiveCredentialHandler,
})

export const reconcileInteractiveCredentialExpiry = internalMutation({
  args: lifecycleArgs,
  returns: lifecycleResultValue,
  handler: reconcileInteractiveCredentialExpiryHandler,
})

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

export async function reconcileInteractiveCredentialExpiryHandler(
  ctx: MutationCtx,
  args: LifecycleArgs,
): Promise<LifecycleResult> {
  const existing = await credentialByRef(ctx, args.credentialRef)
  if (existing !== null
    && existing.bindingRef === args.bindingRef
    && existing.generation === args.expectedGeneration
    && existing.lifecycle !== 'active'
    && existing.expiryMaterialization?.state === 'expired') {
    return { kind: 'duplicate_expired' }
  }
  const loaded = await loadExactCredential(ctx, args)
  if (loaded.kind === 'refused') return loaded
  const now = Date.now()
  if (now >= loaded.credential.expiresAt) {
    return await expireCredential(ctx, loaded.credential, args, now)
  }
  return await armInteractiveCredentialExpiryHandler(ctx, args)
}

async function loadExactCredential(
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

async function credentialByRef(ctx: MutationCtx, ref: string) {
  return await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', ref)).unique()
}

async function expireCredential(
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

export function interactiveCredentialExpiryNonce(
  credential: Pick<Doc<'credentials'>, 'bindingRef' | 'credentialRef' | 'generation' | 'expiresAt'>,
): string {
  return canonicalDigest({
    kind: 'interactive_credential_expiry:v1',
    bindingRef: credential.bindingRef,
    credentialRef: credential.credentialRef,
    generation: credential.generation,
    expiresAt: credential.expiresAt,
  })
}

function materializationMatches(
  materialization: Doc<'credentials'>['expiryMaterialization'],
  credential: Doc<'credentials'>,
  nonce: string,
): boolean {
  return materialization !== undefined
    && materialization.credentialGeneration === credential.generation
    && materialization.credentialExpiresAt === credential.expiresAt
    && materialization.scheduleNonce === nonce
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
