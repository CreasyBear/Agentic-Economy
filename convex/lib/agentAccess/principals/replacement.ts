import { v, type ObjectType } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { type MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { internal } from '../../../_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createAgentAccessGrant,
  normalizeAgentAccessToolSelection,
  normalizeStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'
import type {
  AgentAccessGrantRegistrationResult,
  AgentCredentialReplacementRegistration,
} from '@/modules/agent-access/agent-access'
import {
  MARKET_SUPPLY_MANAGE_SCOPE,
  MARKET_TOOLS_CALL_SCOPE,
  agentAuthorityModeForScopes,
  agentAuthorityScopeForMode,
} from '@/modules/agent-access/contract'
import {
  issuedAgentGrantRef,
  replacementAgentCanonicalRefs,
} from '@/modules/agent-access/issued-agent-binding'
import { agentAccessPolicyValue } from '@/modules/agent-access/public'
import type { CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { DelegationService, delegationGrantRef } from '@/modules/authority/delegation/public'
import { principalRef } from '@/modules/principal-account/public'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../../delegationPersistence'
import { environment, authorityMode } from './verification'
import {
  persistAgentAudit,
  canonicalAgentDelegationScopes,
  validReplacementAssertion,
  ensureProviderRevocation,
  type CanonicalCredentialOwner,
} from './records'

export const replacementRegistrationResult = v.union(
  v.object({
    kind: v.union(v.literal('recorded'), v.literal('replayed')),
    principalRef: v.string(), generation: v.number(), successorCredentialRef: v.string(),
    predecessorCredentialRef: v.string(), predecessorKeyId: v.string(), successorGrantRef: v.string(),
  }),
  v.object({ kind: v.union(v.literal('conflict'), v.literal('unavailable')) }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
)
export const replacementTransitionResult = v.union(
  v.object({ kind: v.union(v.literal('completed'), v.literal('replayed')), providerCredentialId: v.string() }),
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
export const replacementTransitionArgs = {
  principalRef: v.string(), successorCredentialRef: v.string(), successorGrantRef: v.string(),
}
const PREPARE_REPLACEMENT_OPERATION = 'agentAccessPrincipals.prepareCredentialReplacementForServer'
const PROMOTE_REPLACEMENT_OPERATION = 'agentAccessPrincipals.promoteCredentialReplacementForServer'
const CANCEL_REPLACEMENT_OPERATION = 'agentAccessPrincipals.cancelCredentialReplacementForServer'

export async function prepareCredentialReplacementForServerHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof replacementRegistrationArgs> & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
) {
  const { serviceAuth, ...input } = args
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
    || current.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE) !== scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)) {
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
  const generation = predecessor.generation + 1
  const refs = replacementAgentCanonicalRefs({
    principalRef: input.principalRef,
    credentialId: input.credentialId,
    generation,
    grantRef: input.grantRef,
  })
  const pendingSuccessors = await ctx.db.query('credentials')
    .withIndex('by_predecessorCredentialRef', (query) => query.eq('predecessorCredentialRef', predecessor.credentialRef))
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
      || existingBinding.credentialGeneration !== generation))
    || (existingCredential !== null && (existingCredential.bindingRef !== refs.bindingRef
      || existingCredential.principalRef !== input.principalRef
      || existingCredential.generation !== generation
      || existingCredential.predecessorCredentialRef !== predecessor.credentialRef
      || existingCredential.lifecycle !== 'active'))) return { kind: 'conflict' as const }

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
    spendingPolicy: {
      ...input.spendingPolicy,
      budget: { ...input.spendingPolicy.budget, generation },
      rate: { ...input.spendingPolicy.rate, generation },
    },
    lifecycle: 'active',
    generation,
    createdAt: input.createdAt,
    updatedAt: now,
    expiresAt: input.expiresAt,
  })
  if (grantDecision.kind === 'refused') return { kind: 'conflict' as const }
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
    authorityGeneration: generation,
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
      authorityGeneration: successor.generation,
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
    authorityGeneration: successor.generation,
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
