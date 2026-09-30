import { v, type ObjectType } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { env, type MutationCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { agentAccessPolicyDigest, createAgentAccessGrant, normalizeAgentAccessToolSelection, normalizeStoredAgentAccessPolicy, normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import type { AgentAccessGrantRegistrationResult, AgentCredentialReplacementRegistration } from '@/modules/agent-access/agent-access'
import { agentAuthorityModeForScopes } from '@/modules/agent-access/contract'
import { issuedAgentGrantRef, replacementAgentCanonicalRefs } from '@/modules/agent-access/issued-agent-binding'
import { agentAccessPolicyValue } from '@/modules/agent-access/public'
import type { CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { DelegationService } from '@/modules/authority/delegation/public'
import { principalRef } from '@/modules/principal-account/public'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../../authority/delegation/persistence'
import { environment, authorityMode } from './verification'
import { persistAgentAudit, canonicalAgentDelegationScopes, validReplacementAssertion, type CanonicalCredentialOwner } from './records'
export const replacementRegistrationResult = v.union(
  v.object({
    kind: v.union(v.literal('recorded'), v.literal('replayed')),
    principalRef: v.string(), generation: v.number(), successorCredentialRef: v.string(),
    predecessorCredentialRef: v.string(), predecessorKeyId: v.string(), successorGrantRef: v.string(),
  }),
  v.object({ kind: v.union(v.literal('conflict'), v.literal('unavailable')) }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
)
export const replacementRegistrationArgs = {
  principalRef: v.string(), replacementMode: v.union(v.literal('planned'), v.literal('compromise')),
  issuanceKey: v.string(), grantRef: v.string(), credentialId: v.string(),
  applicationRef: v.string(), environment, scopes: v.array(v.string()), authorityMode,
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()),
  spendingPolicy: agentAccessPolicyValue,
  createdAt: v.number(), expiresAt: v.number(),
}
const PREPARE_REPLACEMENT_OPERATION = 'agentAccessPrincipals.prepareCredentialReplacementForServer'
export async function prepareCredentialReplacementForServerHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof replacementRegistrationArgs> & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
) {
  const { serviceAuth, ...input } = args
  if (deploymentPaymentEnvironment(env) !== input.environment) return { kind: 'conflict' as const }
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || !await validReplacementAssertion(
    PREPARE_REPLACEMENT_OPERATION,
    { ...input, scopes: [...input.scopes], toolRefs: [...input.toolRefs] } as StableHashValue,
    serviceAuth,
  )) return { kind: 'refused' as const, code: 'authentication_required' as const }
  let owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>
  try {
    owner = await resolveInteractiveAuthorityContext(ctx, identity)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused' as const, code: 'authentication_required' as const }, { site: 'prepareCredentialReplacementForServerHandler', reason: 'forbidden' })
  }
  if (input.grantRef !== issuedAgentGrantRef(identity.subject, input.issuanceKey)) {
    return { kind: 'refused' as const, code: 'authentication_required' as const }
  }
  return await prepareCredentialReplacementCore(ctx, input, owner, Date.now())
}

export async function prepareCredentialReplacementCore(
  ctx: MutationCtx,
  input: AgentCredentialReplacementRegistration,
  owner: CanonicalCredentialOwner,
  now: number,
) {
  if (deploymentPaymentEnvironment(env) !== input.environment) return { kind: 'conflict' as const }
  const scopes = uniqueSorted(input.scopes)
  const toolSelection = normalizeAgentAccessToolSelection(input)
  if (input.principalRef.trim().length === 0
    || input.credentialId.trim().length === 0
    || input.expiresAt <= now
    || input.createdAt > now + 60_000
    || scopes.length !== input.scopes.length
    || toolSelection === undefined
    || toolSelection.toolAccess !== input.spendingPolicy.toolAccess
    || toolSelection.toolRefs.length !== input.spendingPolicy.toolRefs.length
    || toolSelection.toolRefs.some((ref, index) => ref !== input.spendingPolicy.toolRefs[index])
    || agentAuthorityModeForScopes(scopes) !== input.authorityMode
    || input.spendingPolicy.environment !== input.environment
    || (input.environment === 'production' && input.authorityMode === 'unrestricted_test_only')) {
    return { kind: 'conflict' as const }
  }
  const [membership, principal, current] = await Promise.all([
    ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', owner.accountRef).eq('memberPrincipalRef', input.principalRef).eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('principals').withIndex('by_principalRef', (query) => query.eq('principalRef', input.principalRef)).unique(),
    ctx.db.query('agentAccessPrincipals').withIndex('by_principalId', (query) => query.eq('principalId', input.principalRef)).unique(),
  ])
  if (membership === null || principal?.kind !== 'agent' || principal.lifecycle !== 'active'
    || current === null || current.ownerId !== owner.accountRef || current.lifecycle !== 'active'
    || current.environment !== input.environment
    || current.authorityMode !== input.authorityMode
    || current.scopes.length !== scopes.length
    || uniqueSorted(current.scopes).some((scope, index) => scope !== scopes[index])) {
    return { kind: 'conflict' as const }
  }
  const currentBinding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', current.credentialId))
    .unique()
  const expectedPredecessorLifecycle = input.replacementMode === 'compromise' ? 'revoked' : 'active'
  if (currentBinding === null
    || currentBinding.principalRef !== input.principalRef
    || currentBinding.lifecycle !== expectedPredecessorLifecycle) {
    return { kind: 'conflict' as const }
  }
  const predecessor = await ctx.db.query('credentials')
    .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
      .eq('bindingRef', currentBinding.bindingRef)
      .eq('generation', currentBinding.credentialGeneration)
      .eq('lifecycle', expectedPredecessorLifecycle))
    .unique()
  if (predecessor === null || predecessor.principalRef !== input.principalRef) return { kind: 'conflict' as const }
  const predecessorGrants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
      .eq('credentialId', current.credentialId)
      .eq('environment', input.environment)
      .eq('lifecycle', expectedPredecessorLifecycle))
    .filter((query) => query.eq(query.field('generation'), current.grantGeneration))
    .take(2)
  if (predecessorGrants.length !== 1) return { kind: 'conflict' as const }
  const predecessorGrantRow = predecessorGrants[0]
  if (predecessorGrantRow === undefined) return { kind: 'conflict' as const }
  let predecessorGrant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  try {
    predecessorGrant = normalizeStoredAgentAccessGrant(predecessorGrantRow)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'conflict' as const }, { site: 'prepareCredentialReplacementCore', reason: 'invalid_response' })
  }
  const authoritativePolicy = normalizeStoredAgentAccessPolicy(predecessorGrant.spendingPolicy)
  const requestedPolicy = normalizeStoredAgentAccessPolicy(input.spendingPolicy)
  if (authoritativePolicy === undefined
    || requestedPolicy === undefined
    || predecessorGrant.principalId !== input.principalRef
    || predecessorGrant.ownerId !== owner.accountRef
    || predecessorGrant.applicationRef !== current.applicationRef
    || predecessorGrant.credentialId !== current.credentialId
    || predecessorGrant.environment !== input.environment
    || predecessorGrant.lifecycle !== expectedPredecessorLifecycle
    || predecessorGrant.authorityMode !== current.authorityMode
    || current.grantGeneration !== predecessorGrant.generation
    || current.spendingPolicyDigest !== predecessorGrant.spendingPolicyDigest
    || agentAccessPolicyDigest(requestedPolicy) !== agentAccessPolicyDigest(authoritativePolicy)) {
    return { kind: 'conflict' as const }
  }
  const generation = predecessor.generation + 1
  const grantGeneration = predecessorGrant.generation + 1
  const refs = replacementAgentCanonicalRefs({
    principalRef: input.principalRef,
    credentialId: input.credentialId,
    generation,
    grantRef: input.grantRef,
  })
  const pendingSuccessors = await ctx.db.query('credentials')
    .withIndex('by_predecessorCredentialRef', (query) => query.eq('predecessorCredentialRef', predecessor.credentialRef))
    .filter((query) => query.eq(query.field('lifecycle'), 'active'))
    .take(2)
  if (pendingSuccessors.some((candidate) => (
    candidate.lifecycle === 'active'
    && candidate.credentialRef !== refs.credentialRef
  ))) return { kind: 'conflict' as const }
  const [existingBinding, existingCredential] = await Promise.all([
    ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', input.credentialId))
      .unique(),
    ctx.db.query('credentials').withIndex('by_credentialRef', (query) => query.eq('credentialRef', refs.credentialRef)).unique(),
  ])
  const replaying = existingBinding !== null || existingCredential !== null
  if ((existingBinding !== null && (existingBinding.bindingRef !== refs.bindingRef
      || existingBinding.principalRef !== input.principalRef
      || existingBinding.credentialGeneration !== generation
      || existingBinding.lifecycle !== 'active'))
    || (existingCredential !== null && (existingCredential.bindingRef !== refs.bindingRef
      || existingCredential.principalRef !== input.principalRef
      || existingCredential.generation !== generation
      || existingCredential.predecessorCredentialRef !== predecessor.credentialRef
      || existingCredential.lifecycle !== 'active'))) return { kind: 'conflict' as const }

  const grantDecision = createAgentAccessGrant({
    grantRef: input.grantRef,
    principalId: input.principalRef,
    ownerId: owner.accountRef,
    applicationRef: current.applicationRef,
    credentialId: input.credentialId,
    environment: input.environment,
    toolAccess: toolSelection.toolAccess,
    toolRefs: toolSelection.toolRefs,
    authorityMode: input.authorityMode,
    spendingPolicy: authoritativePolicy,
    lifecycle: 'active',
    generation: grantGeneration,
    createdAt: input.createdAt,
    updatedAt: now,
    expiresAt: input.expiresAt,
  })
  if (grantDecision.kind === 'refused') return { kind: 'conflict' as const }

  const action = {
    actorPrincipalRef: owner.principalRef,
    activeAccountRef: owner.accountRef,
    correlationRef: canonicalDigest({ format: 'agent-credential-replacement:v1', grantRef: input.grantRef } as never),
    idempotencyRef: `agent-credential-replacement:${input.grantRef}`,
  }
  if (existingBinding === null) await ctx.db.insert('externalIdentityBindings', {
    bindingRef: refs.bindingRef,
    principalRef: input.principalRef,
    providerNamespace: 'clerk/api-key',
    providerIdentifier: input.credentialId,
    providerState: { kind: 'known', value: 'active' },
    lifecycle: 'active',
    credentialGeneration: generation,
    bindIdempotencyRef: action.idempotencyRef,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  if (existingCredential === null) await ctx.db.insert('credentials', {
    credentialRef: refs.credentialRef,
    bindingRef: refs.bindingRef,
    principalRef: input.principalRef,
    type: 'api_key',
    lifecycle: 'active',
    generation,
    issueIdempotencyRef: action.idempotencyRef,
    revision: 1,
    issuedAt: input.createdAt,
    expiresAt: input.expiresAt,
    updatedAt: now,
    predecessorCredentialRef: predecessor.credentialRef,
  })
  const delegation = await new DelegationService(
    createConvexDelegationStore(ctx),
    createConvexDelegationContextPort(ctx, principalRef(owner.principalRef)),
    { now: () => now, randomUuid: () => refs.delegationUuid },
  ).issueRoot({
    context: action,
    subjectPrincipalRef: principalRef(input.principalRef),
    scopes: canonicalAgentDelegationScopes(scopes),
    resourceRefs: toolSelection.toolAccess === 'all_admitted' ? ['*'] : toolSelection.toolRefs,
    budgetLimit: 1,
    expiresAt: input.expiresAt,
  })
  if (delegation.grantRef !== input.grantRef) throw new Error('replacement_agent_grant_ref_mismatch')
  const storedGrant: AgentAccessGrantRegistrationResult = await ctx.runMutation(internal.agentAccessPolicy.upsertGrant, { grant: grantDecision.grant })
  if (storedGrant.kind !== 'recorded' && storedGrant.kind !== 'replayed') throw new Error('replacement_agent_grant_conflict')
  if (!replaying && storedGrant.kind === 'recorded') await persistAgentAudit(ctx, {
    eventType: 'agent.credential.replacement_prepared',
    actorPrincipalRef: owner.principalRef,
    activeAccountRef: owner.accountRef,
    agentRef: input.principalRef,
    credentialRef: refs.credentialRef,
    correlationRef: action.correlationRef,
    idempotencyRef: action.idempotencyRef,
    authorityGeneration: grantGeneration,
    beforeState: 'predecessor_active',
    outcome: 'replacement_prepared',
    occurredAt: now,
  })
  return {
    kind: replaying || storedGrant.kind === 'replayed' ? 'replayed' as const : 'recorded' as const,
    principalRef: input.principalRef,
    generation,
    successorCredentialRef: refs.credentialRef,
    predecessorCredentialRef: predecessor.credentialRef,
    predecessorKeyId: current.credentialId,
    successorGrantRef: input.grantRef,
  }
}
