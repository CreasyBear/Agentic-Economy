import { v, type ObjectType } from 'convex/values'
import { accountRef, principalRef } from '@/modules/principal-account/public'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { revokeCanonicalCredentialForService } from '../principals/revocation'
import { requireOAuthSourceWrite } from './shared'
import { refreshFamilyFromDocument } from './refreshMaterial'
import { persistRefreshAudit } from './refreshAudit'
export const revokeRefreshFamilyArgs = {
  tokenHash: v.string(), clientId: v.string(), now: v.number(), reason: v.string(),
  operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
}
export const revokeRefreshFamilyResult = v.object({ kind: v.union(v.literal('completed'), v.literal('replayed'), v.literal('unknown')) })
export async function revokeRefreshFamilyHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof revokeRefreshFamilyArgs>,
) {
  await requireOAuthSourceWrite(ctx, args)
  const token = await ctx.db.query('agentAccessOAuthRefreshTokens')
    .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.tokenHash)).unique()
  if (token === null) return { kind: 'unknown' as const }
  const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_familyRef', (query) => query.eq('familyRef', token.familyRef)).unique()
  if (family === null || family.clientId !== args.clientId) return { kind: 'unknown' as const }
  if (family.lifecycle !== 'active') return { kind: 'replayed' as const }
  await revokeRefreshFamilyCore(ctx, family, args.reason, args.now, args.correlationId)
  return { kind: 'completed' as const }
}

export const revokeRefreshFamilyByAccessTokenArgs = {
  tokenHash: v.string(), clientId: v.string(), now: v.number(), reason: v.string(),
  operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
}
export const revokeRefreshFamilyByAccessTokenResult = v.object({ kind: v.union(v.literal('completed'), v.literal('replayed'), v.literal('unknown')) })
export async function revokeRefreshFamilyByAccessTokenHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof revokeRefreshFamilyByAccessTokenArgs>,
) {
  await requireOAuthSourceWrite(ctx, args)
  const matchingTokens = await ctx.db.query('agentAccessOAuthRefreshTokens')
    .withIndex('by_accessTokenHash', (query) => query.eq('accessTokenHash', args.tokenHash)).take(3)
  if (matchingTokens.length === 0) return { kind: 'unknown' as const }
  const familyRefs = [...new Set(matchingTokens.map((token) => token.familyRef))]
  if (familyRefs.length !== 1) throw new Error('refresh_family_access_token_ambiguous')
  const familyRef = familyRefs[0]
  if (familyRef === undefined) return { kind: 'unknown' as const }
  const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_familyRef', (query) => query.eq('familyRef', familyRef)).unique()
  if (family === null) return { kind: 'unknown' as const }
  if (family.clientId !== args.clientId) return { kind: 'unknown' as const }
  if (family.lifecycle !== 'active') return { kind: 'replayed' as const }
  await revokeRefreshFamilyCore(ctx, family, args.reason, args.now, args.correlationId)
  return { kind: 'completed' as const }
}
export async function revokeRefreshReuse(
  ctx: MutationCtx,
  family: Doc<'agentAccessOAuthRefreshFamilies'>,
  now: number,
  correlationRef: string,
) {
  await revokeRefreshFamilyCore(ctx, family, 'refresh_token_reuse', now, correlationRef)
  return { kind: 'revoked' as const }
}

export async function revokeRefreshFamilyCore(
  ctx: MutationCtx,
  family: Doc<'agentAccessOAuthRefreshFamilies'>,
  reason: string,
  now: number,
  correlationRef: string,
): Promise<{ providerCleanupPending: boolean }> {
  if (family.lifecycle !== 'active') return { providerCleanupPending: false }
  const owner = { principalRef: principalRef(family.ownerPrincipalRef), accountRef: accountRef(family.ownerId) }
  const revoked = await revokeCanonicalCredentialForService(ctx, family.currentCredentialRef, owner, correlationRef, now)
  if (revoked.kind !== 'completed' && revoked.kind !== 'replayed') {
    throw new Error(`refresh_family_canonical_revocation_failed:${revoked.code}`)
  }
  await ctx.db.patch(family._id, {
    lifecycle: reason === 'expired' ? 'expired' : 'revoked',
    revision: family.revision + 1,
    revokedAt: now,
    revocationReason: reason,
    updatedAt: now,
  })
  await persistRefreshAudit(
    ctx,
    { ...refreshFamilyFromDocument(family), lifecycle: reason === 'expired' ? 'expired' : 'revoked' },
    'connection.revoked',
    reason,
    correlationRef,
    now,
  )
  return { providerCleanupPending: revoked.providerTargets.length > 0 }
}
