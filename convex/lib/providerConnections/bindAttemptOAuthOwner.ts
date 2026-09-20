import { type Infer } from 'convex/values'

import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { resolveBusinessActor } from '../../authz'
import { requireSourceWrite } from '../../sourceWriteAdmission'
import { isCanonicalDigest } from '../../../src/modules/common/canonical-digest'
import {
  bindOAuthOwnerArgs,
  bindOAuthOwnerArgsValue,
  bindOAuthOwnerResult,
  readOAuthCallbackOwnerArgs,
  readOAuthCallbackOwnerResult,
} from './attemptValidators'
import { providerConnectionSecretRef } from './attemptShared'

type BindOAuthOwnerArgs = Infer<typeof bindOAuthOwnerArgsValue>

export { bindOAuthOwnerArgs, bindOAuthOwnerResult, readOAuthCallbackOwnerArgs, readOAuthCallbackOwnerResult }

export async function bindOAuthOwnerHandler(
  ctx: MutationCtx,
  args: BindOAuthOwnerArgs,
) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused' as const, code: 'not_found' as const }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'not_found' as const }
  const attempt = await ctx.db.query('capabilityProviderConnectionAttempts')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
    .unique()
  if (attempt === null
    || attempt.owningAccountRef !== actor.canonicalAccountRef
    || attempt.sourceKind !== 'mcp_oauth'
    || attempt.lifecycle !== 'pending') {
    return { kind: 'refused' as const, code: 'not_found' as const }
  }
  const now = Date.now()
  if (attempt.expiresAt <= now) {
    await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
    return { kind: 'refused' as const, code: 'attempt_expired' as const }
  }
  if (!isCanonicalDigest(args.stateHash)
    || args.secretRef !== providerConnectionSecretRef(attempt.owningAccountRef, attempt.attemptRef)) {
    return { kind: 'refused' as const, code: 'connection_conflict' as const }
  }
  if (attempt.stateHash !== undefined || attempt.pkceSecretRef !== undefined) {
    return attempt.stateHash === args.stateHash && attempt.pkceSecretRef === args.secretRef
      ? { kind: 'replayed' as const }
      : { kind: 'refused' as const, code: 'connection_conflict' as const }
  }
  const pointer = await ctx.db.query('secretPointers')
    .withIndex('by_secretRef', (query) => query.eq('secretRef', args.secretRef))
    .unique()
  if (pointer === null
    || pointer.owningAccountRef !== actor.canonicalAccountRef
    || pointer.lastAction.operation !== 'provision'
    || pointer.lastAction.actorPrincipalRef !== actor.canonicalPrincipalRef
    || pointer.lastAction.idempotencyRef !== args.provisionCommandId) {
    return { kind: 'refused' as const, code: 'secret_unavailable' as const }
  }
  await ctx.db.patch(attempt._id, {
    stateHash: args.stateHash,
    pkceSecretRef: args.secretRef,
    credentialSecretRef: args.secretRef,
    updatedAt: now,
  })
  return { kind: 'bound' as const }
}

export async function readOAuthCallbackOwnerHandler(
  ctx: QueryCtx,
  args: { attemptRef: string; stateHash: string; observedAt: number },
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner'
    || !Number.isSafeInteger(args.observedAt)
    || args.observedAt < 0
    || !isCanonicalDigest(args.stateHash)) return { kind: 'not_found' as const }
  const attempt = await ctx.db.query('capabilityProviderConnectionAttempts')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
    .unique()
  const pkceSecretRef = attempt?.pkceSecretRef
  if (attempt === null
    || attempt.owningAccountRef !== actor.canonicalAccountRef
    || attempt.sourceKind !== 'mcp_oauth'
    || attempt.lifecycle !== 'pending'
    || attempt.expiresAt <= args.observedAt
    || attempt.stateHash !== args.stateHash
    || pkceSecretRef === undefined) return { kind: 'not_found' as const }
  const pointer = await ctx.db.query('secretPointers')
    .withIndex('by_secretRef', (query) => query.eq('secretRef', pkceSecretRef))
    .unique()
  if (pointer === null || pointer.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'not_found' as const }
  }
  return {
    kind: 'available' as const,
    attempt: {
      attemptRef: attempt.attemptRef,
      sourceUrl: attempt.sourceUrl,
      environment: attempt.environment,
      secretRef: pointer.secretRef,
      activeGeneration: pointer.activeGeneration,
      pointerRevision: pointer.revision,
    },
  }
}
