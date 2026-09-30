import { v, type ObjectType } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { accountRef, principalRef } from '@/modules/principal-account/public'
import { agentAccessPolicyValue } from '@/modules/agent-access/public'
import { env, type MutationCtx } from '../../../_generated/server'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { prepareCredentialReplacementCore } from '../principals/replacement'
import { transitionCredentialReplacementCore } from '../principals/replacementTransition'
import { authorityMode, environment, refreshFamilyLifecycle, requireOAuthSourceWrite } from './shared'
import { refreshFamilyFromDocument, resolveRefreshCanonicalMaterial } from './refreshMaterial'
import { persistRefreshAudit } from './refreshAudit'
import { revokeRefreshReuse, revokeRefreshFamilyCore } from './refreshRevocation'
const refreshFamily = v.object({
  familyRef: v.string(), revision: v.number(), clientId: v.string(), ownerId: v.string(),
  ownerPrincipalRef: v.string(), providerSubject: v.string(), principalRef: v.string(), displayName: v.string(), applicationRef: v.string(), environment,
  scopes: v.array(v.string()), authorityMode,
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()), spendingPolicy: agentAccessPolicyValue,
  currentCredentialRef: v.string(), currentProviderCredentialId: v.string(), currentGrantRef: v.string(),
  currentGeneration: v.number(), currentAccessExpiresAt: v.number(), currentTokenHash: v.string(), lifecycle: refreshFamilyLifecycle,
  createdAt: v.number(), expiresAt: v.number(), updatedAt: v.number(),
  revokedAt: v.optional(v.number()), revocationReason: v.optional(v.string()),
})
const refreshClaimResult = v.union(
  v.object({
    kind: v.union(v.literal('claimed'), v.literal('replayed')),
    family: refreshFamily,
    claimRef: v.string(),
  }),
  v.object({
    kind: v.literal('recovered'),
    family: refreshFamily,
    invalidatedProviderCredentialId: v.optional(v.string()),
  }),
  v.object({ kind: v.union(v.literal('invalid_grant'), v.literal('busy'), v.literal('revoked')) }),
)
const refreshCommitResult = v.union(
  v.object({
    kind: v.union(v.literal('completed'), v.literal('replayed')),
    family: refreshFamily,
    providerCleanupTarget: v.optional(v.object({ credentialRef: v.string(), providerCredentialId: v.string() })),
  }),
  v.object({ kind: v.literal('conflict'), code: v.string() }),
)
const refreshCreateResult = v.union(
  v.object({ kind: v.union(v.literal('recorded'), v.literal('replayed')), family: refreshFamily }),
  v.object({ kind: v.literal('conflict'), code: v.string() }),
)

export const createRefreshFamilyArgs = {
  grantRef: v.string(), keyId: v.string(), clientId: v.string(), tokenHash: v.string(), accessTokenHash: v.string(),
  createdAt: v.number(), expiresAt: v.number(), operationKey: v.string(), correlationId: v.string(),
  ...sourceWriteArgs,
}
export const createRefreshFamilyResult = refreshCreateResult
export async function createRefreshFamilyHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof createRefreshFamilyArgs>,
) {
  await requireOAuthSourceWrite(ctx, args)
  if (args.tokenHash.trim().length === 0 || args.accessTokenHash.trim().length === 0 || args.createdAt >= args.expiresAt) {
    return { kind: 'conflict' as const, code: 'invalid_material' as const }
  }
  const oauthGrant = await ctx.db.query('agentAccessOAuthGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef)).unique()
  if (oauthGrant === null || oauthGrant.clientId !== args.clientId || oauthGrant.keyId !== args.keyId
    || oauthGrant.ownerId === undefined
    || oauthGrant.offlineAccess !== true || (oauthGrant.status !== 'delivery_claimed' && oauthGrant.status !== 'consumed')) {
    return { kind: 'conflict' as const, code: 'grant_not_eligible' as const }
  }
  const current = await resolveRefreshCanonicalMaterial(ctx, args.keyId)
  if (current === null) return { kind: 'conflict' as const, code: 'canonical_binding_invalid' as const }
  const deploymentEnvironment = deploymentPaymentEnvironment(env)
  if (deploymentEnvironment === undefined
    || current.environment !== deploymentEnvironment
    || oauthGrant.requestedAccess.environment !== deploymentEnvironment
    || oauthGrant.approvedAccess.environment !== deploymentEnvironment) {
    return { kind: 'conflict' as const, code: 'canonical_binding_invalid' as const }
  }
  const familyRef = canonicalDigest({
    format: 'agent-access-oauth-refresh-family:v1',
    grantRef: args.grantRef,
    clientId: args.clientId,
  } as never)
  const [existingFamily, existingToken] = await Promise.all([
    ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_familyRef', (query) => query.eq('familyRef', familyRef)).unique(),
    ctx.db.query('agentAccessOAuthRefreshTokens')
      .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.tokenHash)).unique(),
  ])
  if (existingFamily !== null) {
    const replay = existingFamily.clientId === args.clientId
      && existingFamily.lifecycle === 'active'
      && existingFamily.currentProviderCredentialId === args.keyId
      && existingFamily.currentTokenHash === args.tokenHash
      && existingFamily.expiresAt === args.expiresAt
    return replay
      ? { kind: 'replayed' as const, family: refreshFamilyFromDocument(existingFamily) }
      : { kind: 'conflict' as const, code: 'family_conflict' as const }
  }
  if (existingToken !== null) return { kind: 'conflict' as const, code: 'token_hash_conflict' as const }
  const family = {
    familyRef, revision: 1, clientId: args.clientId, ownerId: current.ownerId,
    ownerPrincipalRef: current.ownerPrincipalRef, providerSubject: oauthGrant.ownerId, principalRef: current.principalRef,
    displayName: oauthGrant.displayName,
    applicationRef: current.applicationRef, environment: current.environment,
    scopes: current.scopes, authorityMode: current.authorityMode,
    toolAccess: current.toolAccess, toolRefs: current.toolRefs,
    spendingPolicy: current.spendingPolicy, currentCredentialRef: current.credentialRef,
    currentProviderCredentialId: args.keyId, currentGrantRef: current.grantRef,
    currentGeneration: current.generation, currentAccessExpiresAt: current.expiresAt,
    currentTokenHash: args.tokenHash,
    lifecycle: 'active' as const, createdAt: args.createdAt, expiresAt: args.expiresAt,
    updatedAt: args.createdAt,
  }
  await ctx.db.insert('agentAccessOAuthRefreshFamilies', family)
  await ctx.db.insert('agentAccessOAuthRefreshTokens', {
    tokenHash: args.tokenHash, accessTokenHash: args.accessTokenHash,
    familyRef, generation: 1, lifecycle: 'active', createdAt: args.createdAt,
  })
  await persistRefreshAudit(ctx, family, 'connection.connected', 'refresh_family_issued', args.correlationId, args.createdAt)
  return { kind: 'recorded' as const, family }
}

export const claimRefreshFamilyArgs = {
  tokenHash: v.string(), clientId: v.string(), claimRef: v.string(), successorTokenHash: v.string(),
  now: v.number(), claimExpiresAt: v.number(), operationKey: v.string(), correlationId: v.string(),
  ...sourceWriteArgs,
}
export const claimRefreshFamilyResult = refreshClaimResult
export async function claimRefreshFamilyHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof claimRefreshFamilyArgs>,
) {
  await requireOAuthSourceWrite(ctx, args)
  if (args.tokenHash === args.successorTokenHash || args.claimRef.trim().length === 0
    || args.now >= args.claimExpiresAt) return { kind: 'invalid_grant' as const }
  const token = await ctx.db.query('agentAccessOAuthRefreshTokens')
    .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.tokenHash)).unique()
  if (token === null) return { kind: 'invalid_grant' as const }
  const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_familyRef', (query) => query.eq('familyRef', token.familyRef)).unique()
  if (family === null || family.clientId !== args.clientId || family.lifecycle !== 'active') {
    return { kind: 'invalid_grant' as const }
  }
  if (family.expiresAt <= args.now) {
    await revokeRefreshFamilyCore(ctx, family, 'expired', args.now, args.correlationId)
    return { kind: 'revoked' as const }
  }
  if (token.lifecycle === 'consumed' && token.replayUntil !== undefined && token.replayUntil >= args.now) {
    if (token.recoveredAt !== undefined) {
      return token.replacedByTokenHash === args.successorTokenHash
        ? { kind: 'recovered' as const, family: refreshFamilyFromDocument(family) }
        : await revokeRefreshReuse(ctx, family, args.now, args.correlationId)
    }
    if (family.environment !== deploymentPaymentEnvironment(env)) return { kind: 'invalid_grant' as const }
    const conflict = await ctx.db.query('agentAccessOAuthRefreshTokens')
      .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.successorTokenHash)).unique()
    if (conflict !== null) return { kind: 'invalid_grant' as const }
    const currentToken = await ctx.db.query('agentAccessOAuthRefreshTokens')
      .withIndex('by_tokenHash', (query) => query.eq('tokenHash', family.currentTokenHash)).unique()
    if (currentToken === null || currentToken.lifecycle !== 'active') {
      return await revokeRefreshReuse(ctx, family, args.now, args.correlationId)
    }
    await ctx.db.patch(currentToken._id, { lifecycle: 'invalidated', invalidatedAt: args.now })
    await ctx.db.insert('agentAccessOAuthRefreshTokens', {
      tokenHash: args.successorTokenHash, accessTokenHash: currentToken.accessTokenHash,
      familyRef: family.familyRef,
      generation: currentToken.generation + 1, lifecycle: 'active', createdAt: args.now,
    })
    await ctx.db.patch(token._id, {
      recoveredAt: args.now,
      replacedByTokenHash: args.successorTokenHash,
    })
    await ctx.db.patch(family._id, {
      currentTokenHash: args.successorTokenHash,
      revision: family.revision + 1,
      updatedAt: args.now,
    })
    const recovered = await ctx.db.get(family._id)
    if (recovered === null) throw new Error('refresh_family_recovery_missing')
    await persistRefreshAudit(
      ctx,
      refreshFamilyFromDocument(recovered),
      'connection.reauthorized',
      'refresh_delivery_recovered',
      args.correlationId,
      args.now,
    )
    return { kind: 'recovered' as const, family: refreshFamilyFromDocument(recovered) }
  }
  if (token.lifecycle === 'consumed' || token.lifecycle === 'invalidated') {
    return await revokeRefreshReuse(ctx, family, args.now, args.correlationId)
  }
  if (token.tokenHash !== family.currentTokenHash) return { kind: 'invalid_grant' as const }
  if (token.lifecycle === 'claimed') {
    if (token.claimRef === args.claimRef && token.replacedByTokenHash === args.successorTokenHash) {
      return { kind: 'replayed' as const, family: refreshFamilyFromDocument(family), claimRef: args.claimRef }
    }
    if (token.claimExpiresAt !== undefined && token.claimExpiresAt > args.now) return { kind: 'busy' as const }
  }
  if (family.environment !== deploymentPaymentEnvironment(env)) return { kind: 'invalid_grant' as const }
  const successor = await ctx.db.query('agentAccessOAuthRefreshTokens')
    .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.successorTokenHash)).unique()
  if (successor !== null) return { kind: 'invalid_grant' as const }
  await ctx.db.patch(token._id, {
    lifecycle: 'claimed', claimRef: args.claimRef, claimedAt: args.now,
    claimExpiresAt: args.claimExpiresAt, replacedByTokenHash: args.successorTokenHash,
  })
  return { kind: 'claimed' as const, family: refreshFamilyFromDocument(family), claimRef: args.claimRef }
}

export const commitRefreshFamilyRotationArgs = {
  familyRef: v.string(), expectedRevision: v.number(), tokenHash: v.string(), claimRef: v.string(),
  successorTokenHash: v.string(), issuanceKey: v.string(), successorGrantRef: v.string(),
  successorCredentialId: v.string(), successorAccessTokenHash: v.string(), createdAt: v.number(), accessExpiresAt: v.number(),
  replayUntil: v.number(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
}
export const commitRefreshFamilyRotationResult = refreshCommitResult
export async function commitRefreshFamilyRotationHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof commitRefreshFamilyRotationArgs>,
) {
  await requireOAuthSourceWrite(ctx, args)
  const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_familyRef', (query) => query.eq('familyRef', args.familyRef)).unique()
  if (family === null) return { kind: 'conflict' as const, code: 'family_not_found' as const }
  if (family.currentTokenHash === args.successorTokenHash
    && family.currentProviderCredentialId === args.successorCredentialId) {
    return {
      kind: 'replayed' as const,
      family: refreshFamilyFromDocument(family),
    }
  }
  if (family.lifecycle !== 'active' || family.revision !== args.expectedRevision
    || family.currentTokenHash !== args.tokenHash || family.expiresAt <= args.createdAt
    || args.accessExpiresAt <= args.createdAt || args.accessExpiresAt > family.expiresAt
    || args.replayUntil < args.createdAt) {
    return { kind: 'conflict' as const, code: 'stale_family' as const }
  }
  const token = await ctx.db.query('agentAccessOAuthRefreshTokens')
    .withIndex('by_tokenHash', (query) => query.eq('tokenHash', args.tokenHash)).unique()
  if (token === null || token.familyRef !== family.familyRef || token.lifecycle !== 'claimed'
    || token.claimRef !== args.claimRef || token.replacedByTokenHash !== args.successorTokenHash) {
    return { kind: 'conflict' as const, code: 'stale_claim' as const }
  }
  const owner = { principalRef: principalRef(family.ownerPrincipalRef), accountRef: accountRef(family.ownerId) }
  const prepared = await prepareCredentialReplacementCore(ctx, {
    principalRef: family.principalRef, replacementMode: 'planned', issuanceKey: args.issuanceKey,
    grantRef: args.successorGrantRef, credentialId: args.successorCredentialId,
    applicationRef: family.applicationRef, environment: family.environment, scopes: family.scopes,
    authorityMode: family.authorityMode, toolAccess: family.toolAccess,
    toolRefs: family.toolRefs, spendingPolicy: family.spendingPolicy,
    createdAt: args.createdAt, expiresAt: args.accessExpiresAt,
  }, owner, args.createdAt)
  if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') {
    return { kind: 'conflict' as const, code: 'replacement_prepare_failed' as const }
  }
  const promoted = await transitionCredentialReplacementCore(ctx, {
    principalRef: family.principalRef,
    successorCredentialRef: prepared.successorCredentialRef,
    successorGrantRef: prepared.successorGrantRef,
  }, owner, 'promote', args.createdAt)
  if (promoted.kind !== 'completed' && promoted.kind !== 'replayed') {
    throw new Error('refresh_replacement_promote_failed')
  }
  await ctx.db.patch(token._id, {
    lifecycle: 'consumed', consumedAt: args.createdAt, replayUntil: args.replayUntil,
    claimExpiresAt: undefined,
  })
  await ctx.db.insert('agentAccessOAuthRefreshTokens', {
    tokenHash: args.successorTokenHash, accessTokenHash: args.successorAccessTokenHash,
    familyRef: family.familyRef,
    generation: token.generation + 1, lifecycle: 'active', createdAt: args.createdAt,
  })
  await ctx.db.patch(family._id, {
    revision: family.revision + 1,
    currentCredentialRef: prepared.successorCredentialRef,
    currentProviderCredentialId: args.successorCredentialId,
    currentGrantRef: prepared.successorGrantRef,
    currentGeneration: prepared.generation,
    currentAccessExpiresAt: args.accessExpiresAt,
    currentTokenHash: args.successorTokenHash,
    spendingPolicy: {
      ...family.spendingPolicy,
      budget: { ...family.spendingPolicy.budget, generation: prepared.generation },
      rate: { ...family.spendingPolicy.rate, generation: prepared.generation },
    },
    updatedAt: args.createdAt,
  })
  const committed = await ctx.db.get(family._id)
  if (committed === null) throw new Error('refresh_family_commit_missing')
  await persistRefreshAudit(
    ctx,
    refreshFamilyFromDocument(committed),
    'connection.reauthorized',
    'refresh_rotated',
    args.correlationId,
    args.createdAt,
  )
  return {
    kind: 'completed' as const,
    family: refreshFamilyFromDocument(committed),
    providerCleanupTarget: {
      credentialRef: prepared.predecessorCredentialRef,
      providerCredentialId: promoted.providerCredentialId,
    },
  }
}
