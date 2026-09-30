import { v, type ObjectType } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { env, type MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import { MARKET_SUPPLY_MANAGE_SCOPE, MARKET_TOOLS_CALL_SCOPE, agentAuthorityScopeForMode } from '@/modules/agent-access/contract'
import type { CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { DelegationService, delegationGrantRef } from '@/modules/authority/delegation/public'
import { principalRef } from '@/modules/principal-account/public'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../../authority/delegation/persistence'
import { persistAgentAudit, validReplacementAssertion, ensureProviderRevocation, type CanonicalCredentialOwner } from './records'
export const replacementTransitionResult = v.union(
  v.object({ kind: v.union(v.literal('completed'), v.literal('replayed')), providerCredentialId: v.string() }),
  v.object({ kind: v.union(v.literal('conflict'), v.literal('unavailable')) }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
)
export const replacementTransitionArgs = {
  principalRef: v.string(), successorCredentialRef: v.string(), successorGrantRef: v.string(),
}
const PROMOTE_REPLACEMENT_OPERATION = 'agentAccessPrincipals.promoteCredentialReplacementForServer'
const CANCEL_REPLACEMENT_OPERATION = 'agentAccessPrincipals.cancelCredentialReplacementForServer'
async function replacementOwner(
  ctx: MutationCtx,
  identity: NonNullable<Awaited<ReturnType<MutationCtx['auth']['getUserIdentity']>>>,
  operation: string,
  input: Readonly<{ principalRef: string; successorCredentialRef: string; successorGrantRef: string }>,
  assertion: CustomerRequestServiceAssertion,
) {
  if (!await validReplacementAssertion(operation, input as StableHashValue, assertion)) return null
  try {
    return await resolveInteractiveAuthorityContext(ctx, identity)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'replacementOwner', reason: 'forbidden' })
  }
}

export async function transitionCredentialReplacementCore(
  ctx: MutationCtx,
  input: Readonly<{ principalRef: string; successorCredentialRef: string; successorGrantRef: string }>,
  owner: CanonicalCredentialOwner,
  mode: 'promote' | 'cancel',
  now: number,
) {
  const [successor, successorGrant, current] = await Promise.all([
    ctx.db.query('credentials').withIndex('by_credentialRef', (query) => query.eq('credentialRef', input.successorCredentialRef)).unique(),
    ctx.db.query('agentAccessGrants').withIndex('by_grantRef', (query) => query.eq('grantRef', input.successorGrantRef)).unique(),
    ctx.db.query('agentAccessPrincipals').withIndex('by_principalId', (query) => query.eq('principalId', input.principalRef)).unique(),
  ])
  if (successor === null || successorGrant === null || current === null
    || successor.principalRef !== input.principalRef
    || successor.predecessorCredentialRef === undefined
    || successorGrant.principalId !== input.principalRef
    || successorGrant.credentialId === current.credentialId && mode === 'cancel'
    || current.ownerId !== owner.accountRef) return { kind: 'conflict' as const }
  let normalizedSuccessorGrant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  try {
    normalizedSuccessorGrant = normalizeStoredAgentAccessGrant(successorGrant)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'conflict' as const }, { site: 'transitionCredentialReplacementCore', reason: 'invalid_response' })
  }
  const successorBinding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_bindingRef', (query) => query.eq('bindingRef', successor.bindingRef)).unique()
  if (successorBinding === null || successorBinding.providerIdentifier !== successorGrant.credentialId) return { kind: 'conflict' as const }
  if (mode === 'cancel') {
    if (successor.lifecycle === 'revoked') return { kind: 'replayed' as const, providerCredentialId: successorBinding.providerIdentifier }
    await revokeReplacementMaterial(ctx, successor, successorBinding, successorGrant, owner, now, 'successor_cancelled')
    await persistAgentAudit(ctx, {
      eventType: 'agent.credential.replacement_cancelled',
      actorPrincipalRef: owner.principalRef,
      activeAccountRef: owner.accountRef,
      agentRef: input.principalRef,
      credentialRef: successor.credentialRef,
      correlationRef: canonicalDigest({ format: 'agent-credential-replacement-cancel:v1', successorGrantRef: input.successorGrantRef } as never),
      idempotencyRef: `agent-credential-replacement-cancel:${input.successorGrantRef}`,
      authorityGeneration: normalizedSuccessorGrant.generation,
      beforeState: 'replacement_prepared',
      outcome: 'replacement_cancelled',
      occurredAt: now,
    })
    return { kind: 'completed' as const, providerCredentialId: successorBinding.providerIdentifier }
  }
  if (current.credentialId === successorBinding.providerIdentifier) {
    const predecessor = await predecessorCredentialBinding(ctx, successor)
    return predecessor === null
      ? { kind: 'conflict' as const }
      : { kind: 'replayed' as const, providerCredentialId: predecessor.binding.providerIdentifier }
  }
  const paymentEnvironment = deploymentPaymentEnvironment(env)
  if (paymentEnvironment === undefined
    || current.environment !== paymentEnvironment
    || successorGrant.environment !== paymentEnvironment) return { kind: 'conflict' as const }
  if (successor.lifecycle !== 'active'
    || successorBinding.lifecycle !== 'active'
    || normalizedSuccessorGrant.lifecycle !== 'active'
    || !Number.isFinite(successor.expiresAt)
    || successor.expiresAt <= now
    || !Number.isFinite(normalizedSuccessorGrant.expiresAt)
    || normalizedSuccessorGrant.expiresAt <= now) return { kind: 'conflict' as const }
  const predecessor = await predecessorMaterial(ctx, successor)
  if (predecessor === null || predecessor.binding.providerIdentifier !== current.credentialId) return { kind: 'conflict' as const }
  await revokeReplacementMaterial(ctx, predecessor.credential, predecessor.binding, predecessor.grant, owner, now, 'predecessor_replaced')
  const successorScopes = current.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
    ? [MARKET_SUPPLY_MANAGE_SCOPE]
    : [MARKET_TOOLS_CALL_SCOPE, agentAuthorityScopeForMode(normalizedSuccessorGrant.authorityMode)]
  await ctx.db.patch(current._id, {
    credentialId: successorBinding.providerIdentifier,
    scopes: successorScopes,
    authorityMode: normalizedSuccessorGrant.authorityMode,
    grantGeneration: normalizedSuccessorGrant.generation,
    spendingPolicyDigest: normalizedSuccessorGrant.spendingPolicyDigest,
    lifecycle: normalizedSuccessorGrant.lifecycle,
    expiresAt: normalizedSuccessorGrant.expiresAt,
    lastSeenAt: now,
  })
  await persistAgentAudit(ctx, {
    eventType: 'agent.credential.replacement_promoted',
    actorPrincipalRef: owner.principalRef,
    activeAccountRef: owner.accountRef,
    agentRef: input.principalRef,
    credentialRef: successor.credentialRef,
    correlationRef: canonicalDigest({ format: 'agent-credential-replacement-promote:v1', successorGrantRef: input.successorGrantRef } as never),
    idempotencyRef: `agent-credential-replacement-promote:${input.successorGrantRef}`,
    authorityGeneration: normalizedSuccessorGrant.generation,
    beforeState: 'replacement_prepared',
    outcome: 'replacement_promoted',
    occurredAt: now,
  })
  return { kind: 'completed' as const, providerCredentialId: predecessor.binding.providerIdentifier }
}

async function predecessorMaterial(ctx: MutationCtx, successor: Doc<'credentials'>) {
  const predecessor = await predecessorCredentialBinding(ctx, successor)
  if (predecessor === null) return null
  const { credential, binding } = predecessor
  const [sandboxActive, productionActive, sandboxRevoked, productionRevoked] = await Promise.all([
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', binding.providerIdentifier).eq('environment', 'sandbox').eq('lifecycle', 'active')).take(2),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', binding.providerIdentifier).eq('environment', 'production').eq('lifecycle', 'active')).take(2),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', binding.providerIdentifier).eq('environment', 'sandbox').eq('lifecycle', 'revoked')).take(2),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', binding.providerIdentifier).eq('environment', 'production').eq('lifecycle', 'revoked')).take(2),
  ])
  const grant = [...sandboxActive, ...productionActive, ...sandboxRevoked, ...productionRevoked]
    .find((candidate) => candidate.principalId === successor.principalRef)
  return grant === undefined ? null : { credential, binding, grant }
}

async function predecessorCredentialBinding(ctx: MutationCtx, successor: Doc<'credentials'>) {
  const predecessorCredentialRef = successor.predecessorCredentialRef
  if (predecessorCredentialRef === undefined) return null
  const credential = await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', predecessorCredentialRef)).unique()
  if (credential === null) return null
  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_bindingRef', (query) => query.eq('bindingRef', credential.bindingRef)).unique()
  return binding === null ? null : { credential, binding }
}

export async function revokeReplacementMaterial(
  ctx: MutationCtx,
  credential: Doc<'credentials'>,
  binding: Doc<'externalIdentityBindings'>,
  grant: Doc<'agentAccessGrants'>,
  owner: CanonicalCredentialOwner,
  now: number,
  reason: string,
  correlationRef: string = canonicalDigest({
    format: 'agent-provider-revocation:v1',
    credentialRef: credential.credentialRef,
  } as never),
) {
  if (credential.lifecycle !== 'revoked') await ctx.db.patch(credential._id, {
    lifecycle: 'revoked', revokedAt: now, updatedAt: now, revision: credential.revision + 1,
  })
  if (binding.lifecycle !== 'revoked') await ctx.db.patch(binding._id, {
    lifecycle: 'revoked', providerState: { kind: 'unknown', value: reason }, revokedAt: now, updatedAt: now, revision: binding.revision + 1,
  })
  if (grant.lifecycle === 'active') await ctx.db.patch(grant._id, { lifecycle: 'revoked', updatedAt: now })
  const delegation = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', grant.grantRef)).unique()
  if (delegation !== null && delegation.lifecycle === 'active') {
    const action = {
      actorPrincipalRef: owner.principalRef,
      activeAccountRef: owner.accountRef,
      correlationRef: canonicalDigest({ format: 'agent-credential-revoke:v1', grantRef: grant.grantRef } as never),
      idempotencyRef: `agent-credential-revoke:${grant.grantRef}`,
    }
    await new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, principalRef(owner.principalRef)),
      { now: () => now },
    ).revoke({ grantRef: delegationGrantRef(delegation.grantRef), expectedGeneration: delegation.generation, context: action })
  }
  await ensureProviderRevocation(ctx, {
    principalRef: credential.principalRef,
    credentialRef: credential.credentialRef,
    providerCredentialId: binding.providerIdentifier,
    correlationRef,
    now,
  })
}

export async function promoteCredentialReplacementForServerHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof replacementTransitionArgs> & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
) {
  const { serviceAuth, ...input } = args
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
  const owner = await replacementOwner(ctx, identity, PROMOTE_REPLACEMENT_OPERATION, input, serviceAuth)
  if (owner === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
  return await transitionCredentialReplacementCore(ctx, input, owner, 'promote', Date.now())
}

export async function cancelCredentialReplacementForServerHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof replacementTransitionArgs> & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
) {
  const { serviceAuth, ...input } = args
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
  const owner = await replacementOwner(ctx, identity, CANCEL_REPLACEMENT_OPERATION, input, serviceAuth)
  if (owner === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
  return await transitionCredentialReplacementCore(ctx, input, owner, 'cancel', Date.now())
}
