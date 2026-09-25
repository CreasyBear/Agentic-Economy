import { v, type ObjectType } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { persistAgentAudit } from './records'
import { requireLifecycleOwner, lifecycleMembership, admitAgentLifecycleReduction } from './lifecycleAuthority'
import { credentialProviderBinding, revokeCanonicalCredential } from './revocation'
import { invalidateOAuthRefreshFamilies } from './refreshInvalidation'
const DISCONNECT_AGENT_OPERATION = 'agentAccessPrincipals.disconnectAgentForServer'
export const disconnectAgentArgs = { principalRef: v.string(), correlationRef: v.string() }
export async function disconnectAgentForServerHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof disconnectAgentArgs> & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
) {
  const command = { principalRef: args.principalRef, correlationRef: args.correlationRef }
  const owner = await requireLifecycleOwner(ctx, DISCONNECT_AGENT_OPERATION, command as StableHashValue, args.serviceAuth)
  if (owner === null) return { kind: 'refused' as const, code: 'authentication_required' as const, correlationRef: args.correlationRef }
  if (await lifecycleMembership(ctx, owner, args.principalRef) === null) {
    return { kind: 'conflict' as const, code: 'agent_not_found' as const, correlationRef: args.correlationRef }
  }
  const admission = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', args.principalRef)).unique()
  if (admission === null || admission.ownerId !== owner.accountRef) {
    return { kind: 'conflict' as const, code: 'agent_not_found' as const, correlationRef: args.correlationRef }
  }
  const [activeCredentials, staleCredentials, cleanupPendingRevocations] = await Promise.all([
    ctx.db.query('credentials')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', args.principalRef).eq('lifecycle', 'active'))
      .order('desc')
      .take(26),
    ctx.db.query('credentials')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', args.principalRef).eq('lifecycle', 'stale'))
      .order('desc')
      .take(26),
    ctx.db.query('agentAccessProviderRevocations')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', args.principalRef).eq('lifecycle', 'pending'))
      .order('desc')
      .take(26),
  ])
  const cleanupPendingCredentials = await Promise.all(cleanupPendingRevocations.map(async (revocation) => (
    await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', revocation.credentialRef))
      .unique()
  )))
  if (cleanupPendingCredentials.some((credential) => credential === null)) {
    return { kind: 'conflict' as const, code: 'credential_not_found' as const, correlationRef: args.correlationRef }
  }
  const pendingCredentials = [...new Map(
    [...activeCredentials, ...staleCredentials, ...cleanupPendingCredentials]
      .flatMap((credential) => credential === null ? [] : [[credential.credentialRef, credential] as const]),
  ).values()]
  const hasMore = pendingCredentials.length > 25
  const credentials = pendingCredentials.slice(0, 25)
  const bindings = await Promise.all(credentials.map(async (credential) => (
    await credentialProviderBinding(ctx, credential)
  )))
  if (bindings.some((binding) => binding === null)) {
    return { kind: 'conflict' as const, code: 'credential_binding_invalid' as const, correlationRef: args.correlationRef }
  }
  const now = Date.now()
  const consequenceAdmitted = await admitAgentLifecycleReduction(ctx, owner, {
    action: 'agent_access.disconnect',
    targetType: 'agent',
    targetRef: admission.principalId,
    targetRevision: Math.max(1, admission.grantGeneration),
    resourceRefs: [`agent:${admission.principalId}`],
    consequenceSummary: 'Disconnect this Agent and revoke every remaining credential generation.',
    statusReadbackRef: `agent-access/${admission.principalId}`,
    correlationRef: args.correlationRef,
    idempotencyRef: `agent-disconnect:${admission.principalId}:${Math.max(1, admission.grantGeneration)}`,
    command: {
      version: 'ae.agent-disconnect-consequence:v1',
      principalRef: admission.principalId,
      grantGeneration: admission.grantGeneration,
      lifecycle: admission.lifecycle,
      credentialRefs: credentials.map((credential) => credential.credentialRef).sort(),
      hasMore,
    },
    now,
  })
  if (!consequenceAdmitted) {
    return { kind: 'conflict' as const, code: 'authority_mismatch' as const, correlationRef: args.correlationRef }
  }
  const revokedCredentials = await Promise.all(credentials.map(
    async (credential) => ({
      credential,
      revoked: await revokeCanonicalCredential(ctx, credential, owner, args.correlationRef, now),
    }),
  ))
  const changed = admission.lifecycle !== 'revoked'
    || revokedCredentials.some(({ revoked }) => revoked?.changed === true)
  const targets = revokedCredentials.flatMap(({ credential, revoked }) => revoked === null || !revoked.providerRevocationPending
    ? []
    : [{ credentialRef: credential.credentialRef, providerCredentialId: revoked.providerCredentialId }])
  if (admission.lifecycle !== 'revoked') await ctx.db.patch(admission._id, { lifecycle: 'revoked', lastSeenAt: now })
  await invalidateOAuthRefreshFamilies(ctx, { principalRef: args.principalRef }, 'owner_disconnected', now)
  if (changed) await persistAgentAudit(ctx, {
    eventType: 'agent.disconnected',
    actorPrincipalRef: owner.principalRef,
    activeAccountRef: owner.accountRef,
    agentRef: args.principalRef,
    correlationRef: args.correlationRef,
    idempotencyRef: canonicalDigest({
      format: 'agent-disconnect-audit:v1',
      principalRef: args.principalRef,
      correlationRef: args.correlationRef,
    } as never),
    beforeState: 'connected_or_attention',
    outcome: 'disconnected',
    occurredAt: now,
  })
  return {
    kind: changed ? 'completed' as const : 'replayed' as const,
    principalRef: args.principalRef,
    providerTargets: targets,
    hasMore,
    correlationRef: args.correlationRef,
  }
}
