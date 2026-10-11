import { v, type ObjectType } from 'convex/values'
import { enqueueAccountNotice, keyBatchSourceRef } from '../../principalAccount/notifications/enqueue'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import { MARKET_SUPPLY_MANAGE_SCOPE, MARKET_TOOLS_CALL_SCOPE, agentAuthorityScopeForMode } from '@/modules/agent-access/contract'
import type { CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { DelegationService, delegationGrantRef } from '@/modules/authority/delegation/public'
import { principalRef } from '@/modules/principal-account/public'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../../authority/delegation/persistence'
import { persistAgentAudit, ensureProviderRevocation, type CanonicalCredentialOwner } from './records'
import { requireLifecycleOwner, lifecycleMembership, admitAgentLifecycleReduction } from './lifecycleAuthority'
import { invalidateOAuthRefreshFamilies } from './refreshInvalidation'
export const providerTarget = v.object({
  credentialRef: v.string(), providerCredentialId: v.string(),
})
export const lifecycleCommandResult = v.union(
  v.object({
    kind: v.union(v.literal('completed'), v.literal('replayed')),
    principalRef: v.string(),
    providerTargets: v.array(providerTarget),
    hasMore: v.optional(v.boolean()),
    correlationRef: v.string(),
  }),
  v.object({ kind: v.literal('conflict'), code: v.string(), correlationRef: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required'), correlationRef: v.string() }),
)
export const providerRevocationResult = v.union(
  v.object({ kind: v.union(v.literal('completed'), v.literal('replayed')) }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
)
const REVOKE_CREDENTIAL_OPERATION = 'agentAccessPrincipals.revokeCredentialForServer'
const RECORD_PROVIDER_REVOCATION_OPERATION = 'agentAccessPrincipals.recordProviderRevocationForServer'

export const revokeCredentialArgs = { credentialRef: v.string(), correlationRef: v.string() }
export const recordProviderRevocationArgs = {
  principalRef: v.string(), credentialRef: v.string(), providerCredentialId: v.string(),
  correlationRef: v.string(), outcome: v.union(v.literal('revoked'), v.literal('failed')),
}
async function revokeGrantLifecycle(
  ctx: MutationCtx,
  grant: Doc<'agentAccessGrants'>,
  owner: CanonicalCredentialOwner,
  correlationRef: string,
  now: number,
) {
  if (grant.lifecycle === 'active') await ctx.db.patch(grant._id, { lifecycle: 'revoked', updatedAt: now })
  const delegation = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', grant.grantRef)).unique()
  if (delegation === null || delegation.lifecycle !== 'active') return
  await new DelegationService(
    createConvexDelegationStore(ctx),
    createConvexDelegationContextPort(ctx, principalRef(owner.principalRef)),
    { now: () => now },
  ).revoke({
    grantRef: delegationGrantRef(delegation.grantRef),
    expectedGeneration: delegation.generation,
    context: {
      actorPrincipalRef: owner.principalRef,
      activeAccountRef: owner.accountRef,
      correlationRef,
      idempotencyRef: `agent-lifecycle:${grant.grantRef}`,
    },
  })
}

export async function revokeCanonicalCredential(
  ctx: MutationCtx,
  credential: Doc<'credentials'>,
  owner: CanonicalCredentialOwner,
  correlationRef: string,
  now: number,
): Promise<{ changed: boolean; providerCredentialId: string; providerRevocationPending: boolean } | null> {
  const binding = await credentialProviderBinding(ctx, credential)
  if (binding === null) return null
  const [sandbox, production] = await Promise.all([
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', binding.providerIdentifier).eq('environment', 'sandbox').eq('lifecycle', 'active')).take(2),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', binding.providerIdentifier).eq('environment', 'production').eq('lifecycle', 'active')).take(2),
  ])
  await Promise.all([...sandbox, ...production].map(
    (grant) => revokeGrantLifecycle(ctx, grant, owner, correlationRef, now),
  ))
  const changed = credential.lifecycle !== 'revoked' || binding.lifecycle !== 'revoked'
  const providerRevocationPending = binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'revoked'
  if (credential.lifecycle !== 'revoked') {
    await ctx.db.patch(credential._id, {
      lifecycle: 'revoked', revokedAt: credential.revokedAt ?? now, updatedAt: now,
      revision: credential.revision + 1,
    })
  }
  if (binding.lifecycle !== 'revoked') await ctx.db.patch(binding._id, {
    lifecycle: 'revoked',
    providerState: providerRevocationPending
      ? { kind: 'unknown', value: `revocation_pending:${correlationRef}` }
      : binding.providerState,
    revokedAt: now,
    updatedAt: now,
    revision: binding.revision + 1,
  })
  if (providerRevocationPending) await ensureProviderRevocation(ctx, {
    principalRef: credential.principalRef,
    credentialRef: credential.credentialRef,
    providerCredentialId: binding.providerIdentifier,
    correlationRef,
    now,
  })
  return { changed, providerCredentialId: binding.providerIdentifier, providerRevocationPending }
}

export async function revokeCanonicalCredentialForService(
  ctx: MutationCtx,
  credentialRefValue: string,
  owner: CanonicalCredentialOwner,
  correlationRef: string,
  now: number,
) {
  const credential = await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', credentialRefValue)).unique()
  if (credential === null) {
    return { kind: 'conflict' as const, code: 'credential_not_found' as const, providerTargets: [] }
  }
  const admission = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', credential.principalRef)).unique()
  if (admission === null || admission.ownerId !== owner.accountRef) {
    return { kind: 'conflict' as const, code: 'agent_not_found' as const, providerTargets: [] }
  }
  const revoked = await revokeCanonicalCredential(ctx, credential, owner, correlationRef, now)
  if (revoked === null) {
    return { kind: 'conflict' as const, code: 'credential_binding_invalid' as const, providerTargets: [] }
  }
  if (admission.credentialId === revoked.providerCredentialId && admission.lifecycle === 'active') {
    await promoteRemainingCredential(ctx, admission, credential.credentialRef, now)
  }
  return {
    kind: revoked.changed ? 'completed' as const : 'replayed' as const,
    providerTargets: revoked.providerRevocationPending
      ? [{ credentialRef: credential.credentialRef, providerCredentialId: revoked.providerCredentialId }]
      : [],
  }
}

export async function credentialProviderBinding(ctx: MutationCtx, credential: Doc<'credentials'>) {
  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_bindingRef', (query) => query.eq('bindingRef', credential.bindingRef)).unique()
  return binding === null
    || binding.principalRef !== credential.principalRef
    || binding.providerNamespace !== 'clerk/api-key'
    ? null
    : binding
}

async function promoteRemainingCredential(
  ctx: MutationCtx,
  admission: Doc<'agentAccessPrincipals'>,
  revokedCredentialRef: string,
  now: number,
) {
  const active = await ctx.db.query('credentials')
    .withIndex('by_principalRef_and_lifecycle', (query) => query.eq('principalRef', admission.principalId).eq('lifecycle', 'active'))
    .order('desc')
    .take(100)
  const ordered = active.filter((credential) => credential.credentialRef !== revokedCredentialRef)
    .toSorted((left, right) => right.generation - left.generation)
  const hasSupplyAuthority = new Set(admission.scopes).has(MARKET_SUPPLY_MANAGE_SCOPE)
  for (const credential of ordered) {
    const binding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', credential.bindingRef)).unique()
    if (binding === null || binding.lifecycle !== 'active') continue
    const grants = await ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', binding.providerIdentifier).eq('environment', admission.environment).eq('lifecycle', 'active'))
      .take(2)
    const grant = grants.find((candidate) => candidate.principalId === admission.principalId)
    if (grant === undefined) continue
    let normalizedGrant: ReturnType<typeof normalizeStoredAgentAccessGrant>
    try {
      normalizedGrant = normalizeStoredAgentAccessGrant(grant)
    } catch (cause) {
      degradeBackend(cause, undefined, { site: 'promoteRemainingCredential', reason: 'invalid_response' })
      continue
    }
    const scopes = hasSupplyAuthority
      ? [MARKET_SUPPLY_MANAGE_SCOPE]
      : [MARKET_TOOLS_CALL_SCOPE, agentAuthorityScopeForMode(normalizedGrant.authorityMode)]
    await ctx.db.patch(admission._id, {
      credentialId: binding.providerIdentifier,
      scopes,
      authorityMode: normalizedGrant.authorityMode,
      grantGeneration: normalizedGrant.generation,
      spendingPolicyDigest: normalizedGrant.spendingPolicyDigest,
      lifecycle: normalizedGrant.lifecycle,
      expiresAt: normalizedGrant.expiresAt,
      lastSeenAt: now,
    })
    return
  }
  await ctx.db.patch(admission._id, { lifecycle: 'revoked', lastSeenAt: now })
}
export async function revokeCredentialForServerHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof revokeCredentialArgs> & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
) {
  const command = { credentialRef: args.credentialRef, correlationRef: args.correlationRef }
  const owner = await requireLifecycleOwner(ctx, REVOKE_CREDENTIAL_OPERATION, command as StableHashValue, args.serviceAuth)
  if (owner === null) return { kind: 'refused' as const, code: 'authentication_required' as const, correlationRef: args.correlationRef }
  const credential = await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', args.credentialRef)).unique()
  if (credential === null || await lifecycleMembership(ctx, owner, credential.principalRef) === null) {
    return { kind: 'conflict' as const, code: 'credential_not_found' as const, correlationRef: args.correlationRef }
  }
  const now = Date.now()
  const admission = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', credential.principalRef)).unique()
  if (admission === null || admission.ownerId !== owner.accountRef) {
    return { kind: 'conflict' as const, code: 'agent_not_found' as const, correlationRef: args.correlationRef }
  }
  const consequenceAdmitted = await admitAgentLifecycleReduction(ctx, owner, {
    action: 'agent_access.revoke_credential',
    targetType: 'agent_credential',
    targetRef: credential.credentialRef,
    targetRevision: credential.revision,
    resourceRefs: [
      `agent:${credential.principalRef}`,
      `credential:${credential.credentialRef}`,
    ],
    consequenceSummary: 'Revoke this exact Agent credential generation and its current grants.',
    statusReadbackRef: `agent-access/${credential.principalRef}`,
    correlationRef: args.correlationRef,
    idempotencyRef: `agent-credential-revoke:${credential.credentialRef}:${credential.generation}`,
    command: {
      version: 'ae.agent-credential-revoke-consequence:v1',
      principalRef: credential.principalRef,
      credentialRef: credential.credentialRef,
      credentialGeneration: credential.generation,
      credentialRevision: credential.revision,
    },
    now,
  })
  if (!consequenceAdmitted) {
    return { kind: 'conflict' as const, code: 'authority_mismatch' as const, correlationRef: args.correlationRef }
  }
  const revoked = await revokeCanonicalCredential(ctx, credential, owner, args.correlationRef, now)
  if (revoked === null) return { kind: 'conflict' as const, code: 'credential_binding_invalid' as const, correlationRef: args.correlationRef }
  if (admission.credentialId === revoked.providerCredentialId && admission.lifecycle === 'active') {
    await promoteRemainingCredential(ctx, admission, credential.credentialRef, now)
  }
  await invalidateOAuthRefreshFamilies(ctx, { credentialRef: credential.credentialRef }, 'owner_credential_revoked', now)
  if (revoked.changed) await enqueueAccountNotice(ctx, {
    eventKind: 'key_revoked', accountRef: owner.accountRef,
    sourceEventRef: keyBatchSourceRef(owner.accountRef, now),
  })
  if (revoked.changed) await persistAgentAudit(ctx, {
    eventType: 'agent.credential.revoked',
    actorPrincipalRef: owner.principalRef,
    activeAccountRef: owner.accountRef,
    agentRef: credential.principalRef,
    credentialRef: credential.credentialRef,
    correlationRef: args.correlationRef,
    idempotencyRef: canonicalDigest({
      format: 'agent-credential-revocation-audit:v1',
      credentialRef: credential.credentialRef,
      correlationRef: args.correlationRef,
    } as never),
    authorityGeneration: credential.generation,
    beforeState: 'active_or_stale',
    outcome: 'revoked',
    occurredAt: now,
  })
  return {
    kind: revoked.changed ? 'completed' as const : 'replayed' as const,
    principalRef: credential.principalRef,
    providerTargets: revoked.providerRevocationPending
      ? [{ credentialRef: credential.credentialRef, providerCredentialId: revoked.providerCredentialId }]
      : [],
    hasMore: false,
    correlationRef: args.correlationRef,
  }
}
export async function recordProviderRevocationForServerHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof recordProviderRevocationArgs> & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
) {
  const command = {
    principalRef: args.principalRef,
    credentialRef: args.credentialRef,
    providerCredentialId: args.providerCredentialId,
    correlationRef: args.correlationRef,
    outcome: args.outcome,
  }
  const owner = await requireLifecycleOwner(ctx, RECORD_PROVIDER_REVOCATION_OPERATION, command as StableHashValue, args.serviceAuth)
  if (owner === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
  if (await lifecycleMembership(ctx, owner, args.principalRef) === null) return { kind: 'conflict' as const }
  const credential = await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', args.credentialRef)).unique()
  if (credential === null || credential.principalRef !== args.principalRef || credential.lifecycle !== 'revoked') return { kind: 'conflict' as const }
  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_bindingRef', (query) => query.eq('bindingRef', credential.bindingRef)).unique()
  if (binding === null || binding.providerIdentifier !== args.providerCredentialId || binding.lifecycle !== 'revoked') return { kind: 'conflict' as const }
  const revocation = await ctx.db.query('agentAccessProviderRevocations')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', args.credentialRef))
    .unique()
  if (revocation === null
    || revocation.principalRef !== args.principalRef
    || revocation.providerCredentialId !== args.providerCredentialId) return { kind: 'conflict' as const }
  if (binding.providerState.kind === 'known' && binding.providerState.value === 'revoked') {
    if (revocation.lifecycle === 'pending') {
      await ctx.db.patch(revocation._id, { lifecycle: 'completed', updatedAt: Date.now() })
    }
    return { kind: 'replayed' as const }
  }
  const nextState = args.outcome === 'revoked'
    ? { kind: 'known' as const, value: 'revoked' as const }
    : { kind: 'unknown' as const, value: `revocation_failed:${args.correlationRef}` }
  if (JSON.stringify(binding.providerState) === JSON.stringify(nextState)
    && (args.outcome !== 'revoked' || revocation.lifecycle === 'completed')) return { kind: 'replayed' as const }
  const updatedAt = Date.now()
  await Promise.all([
    ctx.db.patch(binding._id, { providerState: nextState, updatedAt, revision: binding.revision + 1 }),
    args.outcome === 'revoked'
      ? ctx.db.patch(revocation._id, { lifecycle: 'completed', updatedAt })
      : ctx.db.patch(revocation._id, { correlationRef: args.correlationRef, updatedAt }),
  ])
  return { kind: 'completed' as const }
}
