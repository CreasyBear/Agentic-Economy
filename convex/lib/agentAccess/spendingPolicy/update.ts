import type { MutationCtx } from '../../../_generated/server'
import type { ObjectType } from 'convex/values'
import {
  agentSpendingLimitsUpdateArgs, agentSpendingLimitsUpdateSchema,
  type AgentSpendingLimitsResult, createAgentAccessGrant,
  normalizeStoredAgentAccessGrant, projectAgentAccessGrant, normalizeStoredAgentAccessPolicy,
} from '@/modules/agent-access/policy'
import { persistAgentAudit } from '../principals/records'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { validateCanonicalAgentDelegation } from '../../authority/canonicalAgent/authority'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../../authority/delegation/persistence'
import { DelegationService, parsePersistedDelegationGrant } from '@/modules/authority/delegation/public'
import { principalRef } from '@/modules/principal-account/public'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { agentAuditOpaqueRef } from '@/modules/agent-access/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { upsertGrantHandler } from '../policy/writes'
import { loadOwnedAgent, mapLoadFailure, type OwnerAuthority } from './material'

const INVALID_CORRELATION_REF = 'invalid-correlation-reference'

/**
 * CONTRACT: policyCommandNamespace(principalRef, idempotencyKey)
 *   Requires: both values have passed the public command schema.
 *   Ensures: returns one bounded, deterministic namespace for this principal
 *   and idempotency key; command material is intentionally checked separately
 *   against the immutable grant so reusing a key with different limits is a
 *   conflict rather than a second grant.
 *   Invariant: the namespace is safe for the delegation and audit reference
 *   limits.
 *   On violation: the public boundary rejects the command before this helper.
 */
function policyCommandNamespace(principal: string, idempotencyKey: string): string {
  const digest = canonicalDigest({
    format: 'ae.agent-spending-policy-command:v1',
    principalRef: principal,
    idempotencyKey,
  } as never)
  return `agent-spending-policy:${digest.slice('sha256:'.length)}`
}

function deterministicDelegationUuid(grantRef: string): string {
  const hex = grantRef.slice('grt_'.length)
  if (!/^[0-9a-f]{32}$/u.test(hex)) throw new Error('agent_spending_policy_grant_ref_invalid')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function amountEqual(left: Readonly<{ currency: string; units: string; exponent: number }>, right: Readonly<{ currency: string; units: string; exponent: number }>): boolean {
  return left.currency === right.currency && left.units === right.units && left.exponent === right.exponent
}
function validOpaqueCommandRef(value: string, label: 'correlationRef' | 'idempotencyRef'): boolean {
  try {
    agentAuditOpaqueRef(value, label)
    return true
  } catch (cause) {
    void cause;
    return false
  }
}

function invalidCommand(correlationRef: string): AgentSpendingLimitsResult {
  return {
    kind: 'conflict',
    code: 'policy_invalid',
    correlationRef: validOpaqueCommandRef(correlationRef, 'correlationRef')
      ? correlationRef
      : INVALID_CORRELATION_REF,
  }
}

function sameReplayMaterial(
  grant: ReturnType<typeof normalizeStoredAgentAccessGrant>,
  input: Readonly<{
    principalRef: string
    expectedGeneration: number
    maximumSpendPerCall: Readonly<{ currency: string; units: string; exponent: number }>
    maximumDailySpend: Readonly<{ currency: string; units: string; exponent: number }>
    maximumMonthlySpend: Readonly<{ currency: string; units: string; exponent: number }>
  }>,
  owner: OwnerAuthority,
): boolean {
  const budget = projectAgentAccessGrant(grant).budget
  return grant.principalId === input.principalRef
    && grant.ownerId === owner.accountRef
    && grant.generation === input.expectedGeneration + 1
    && amountEqual(budget.maximumSpendPerCall, input.maximumSpendPerCall)
    && amountEqual(budget.maximumDailySpend, input.maximumDailySpend)
    && amountEqual(budget.maximumMonthlySpend, input.maximumMonthlySpend)
}

function replayResult(
  grant: ReturnType<typeof normalizeStoredAgentAccessGrant>,
  principal: string,
  correlationRef: string,
): AgentSpendingLimitsResult {
  return {
    kind: 'replayed',
    principalRef: principal,
    grantRef: grant.grantRef,
    generation: grant.generation,
    spendingPolicyDigest: grant.spendingPolicyDigest,
    correlationRef,
  }
}
/**
 * CONTRACT: updateForServer
 *   Requires: an authenticated current Account owner, one active Agent chain,
 *   an active canonical delegation, valid AUD/6 limits, the current access
 *   generation, and a canonical idempotency/correlation identity.
 *   Ensures: one immutable v2 access grant and canonical delegation carry the
 *   new monetary policy; the Agent admission projection and one policy audit
 *   event advance in the same transaction. A replay returns the original
 *   grant revision without new writes.
 *   Invariant: credential identity, scopes, tool selection, rate policy,
 *   concurrency limit, accepted Call records, and native spending usage are
 *   unchanged. The prior canonical delegation remains active for recovery.
 *   On violation: returns a typed refusal/conflict before authority writes;
 *   unexpected storage or delegation failures throw so Convex rolls back all
 *   writes.
 */
export async function updateForServerHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof agentSpendingLimitsUpdateArgs>,
): Promise<AgentSpendingLimitsResult> {
  let parsed: ReturnType<typeof agentSpendingLimitsUpdateSchema.parse>
  try {
    parsed = agentSpendingLimitsUpdateSchema.parse({
      principalRef: args.principalRef,
      expectedGeneration: args.expectedGeneration,
      idempotencyKey: args.idempotencyKey,
      maximumSpendPerCall: args.maximumSpendPerCall,
      maximumDailySpend: args.maximumDailySpend,
      maximumMonthlySpend: args.maximumMonthlySpend,
    })
  } catch (cause) {
    void cause;
    return invalidCommand(args.correlationRef)
  }
  if (!validOpaqueCommandRef(parsed.idempotencyKey, 'idempotencyRef')
    || !validOpaqueCommandRef(args.correlationRef, 'correlationRef')) {
    return invalidCommand(args.correlationRef)
  }

  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return { kind: 'refused', code: 'authentication_required', correlationRef: args.correlationRef }
  }
  let owner: OwnerAuthority
  try {
    owner = await resolveInteractiveAuthorityContext(ctx, identity)
  } catch (cause) {
    void cause;
    return { kind: 'refused', code: 'authentication_required', correlationRef: args.correlationRef }
  }
  if (owner.provenance.accessKind !== 'ownership') {
    return { kind: 'conflict', code: 'account_ownership_required', correlationRef: args.correlationRef }
  }

  const now = Date.now()
  const loaded = await loadOwnedAgent(ctx, owner, parsed.principalRef, now)
  if (loaded.kind !== 'ok') return mapLoadFailure(loaded, args.correlationRef) as AgentSpendingLimitsResult
  const { admission, credential, grant, delegation: storedDelegation } = loaded.material

  const commandNamespace = policyCommandNamespace(parsed.principalRef, parsed.idempotencyKey)
  const expectedGrantRef = issuedAgentGrantRef(identity.subject, commandNamespace)
  const existingReplay = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (q) => q.eq('grantRef', expectedGrantRef))
    .unique()
  if (existingReplay !== null) {
    let replayGrant: ReturnType<typeof normalizeStoredAgentAccessGrant>
    try {
      replayGrant = normalizeStoredAgentAccessGrant(existingReplay)
    } catch (cause) {
      void cause;
      return { kind: 'conflict', code: 'idempotency_conflict', correlationRef: args.correlationRef }
    }
    return sameReplayMaterial(replayGrant, parsed, owner)
      ? replayResult(replayGrant, parsed.principalRef, args.correlationRef)
      : { kind: 'conflict', code: 'idempotency_conflict', correlationRef: args.correlationRef }
  }

  if (parsed.expectedGeneration !== grant.generation) {
    return { kind: 'conflict', code: 'revision_conflict', correlationRef: args.correlationRef }
  }

  const pendingSuccessors = await ctx.db.query('credentials')
    .withIndex('by_predecessorCredentialRef', (q) => q.eq('predecessorCredentialRef', credential.credentialRef))
    .filter((q) => q.eq(q.field('lifecycle'), 'active'))
    .take(1)
  if (pendingSuccessors.length !== 0) {
    return { kind: 'conflict', code: 'credential_replacement_pending', correlationRef: args.correlationRef }
  }

  const currentDelegation = parsePersistedDelegationGrant(storedDelegation)
  const delegated = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'agent-spending-policy-update',
    evidenceRef: parsed.principalRef,
    principalRef: admission.principalId,
    accountRef: owner.accountRef,
    grantRef: grant.grantRef,
    grantGeneration: currentDelegation.generation,
    requiredScopes: admission.scopes,
    resourceRefs: grant.toolAccess === 'all_admitted' ? ['*'] : grant.toolRefs,
    now,
  })
  if (delegated === null) {
    return { kind: 'conflict', code: 'authority_unavailable', correlationRef: args.correlationRef }
  }

  const currentPolicy = normalizeStoredAgentAccessPolicy(grant.spendingPolicy)
  if (currentPolicy === undefined
    || !Number.isSafeInteger(currentPolicy.budget.generation)
    || !Number.isSafeInteger(currentPolicy.budget.generation + 1)
    || currentPolicy.budget.currency !== 'AUD'
    || currentPolicy.budget.exponent !== 6) {
    return { kind: 'conflict', code: 'policy_invalid', correlationRef: args.correlationRef }
  }
  const updatedPolicy = {
    ...currentPolicy,
    toolRefs: [...currentPolicy.toolRefs],
    budget: {
      ...currentPolicy.budget,
      generation: currentPolicy.budget.generation + 1,
      maximumSpendPerCall: parsed.maximumSpendPerCall,
      maximumDailySpend: parsed.maximumDailySpend,
      maximumMonthlySpend: parsed.maximumMonthlySpend,
    },
    rate: { ...currentPolicy.rate },
  }
  const nextGeneration = grant.generation + 1
  if (!Number.isSafeInteger(nextGeneration)) {
    return { kind: 'conflict', code: 'revision_conflict', correlationRef: args.correlationRef }
  }
  const grantDecision = createAgentAccessGrant({
    grantRef: expectedGrantRef,
    principalId: grant.principalId,
    ownerId: owner.accountRef,
    applicationRef: grant.applicationRef,
    credentialId: grant.credentialId,
    environment: grant.environment,
    toolAccess: grant.toolAccess,
    toolRefs: [...grant.toolRefs],
    authorityMode: grant.authorityMode,
    spendingPolicy: updatedPolicy,
    budgetPolicyRef: grant.budgetPolicyRef,
    ratePolicyRef: grant.ratePolicyRef,
    lifecycle: 'active',
    generation: nextGeneration,
    createdAt: now,
    updatedAt: now,
    expiresAt: grant.expiresAt,
  })
  if (grantDecision.kind !== 'accepted') {
    return { kind: 'conflict', code: 'policy_invalid', correlationRef: args.correlationRef }
  }

  const action = {
    actorPrincipalRef: owner.principalRef,
    activeAccountRef: owner.accountRef,
    correlationRef: args.correlationRef,
    idempotencyRef: commandNamespace,
  }
  const nextDelegation = await new DelegationService(
    createConvexDelegationStore(ctx),
    createConvexDelegationContextPort(ctx, principalRef(owner.principalRef)),
    { now: () => now, randomUuid: () => deterministicDelegationUuid(expectedGrantRef) },
  ).issueRoot({
    context: action,
    subjectPrincipalRef: principalRef(grant.principalId),
    scopes: [...currentDelegation.scopes],
    resourceRefs: [...currentDelegation.resourceRefs],
    budgetLimit: currentDelegation.budgetLimit,
    expiresAt: currentDelegation.expiresAt,
  })
  if (nextDelegation.grantRef !== expectedGrantRef) {
    throw new Error('agent_spending_policy_delegation_ref_mismatch')
  }

  const storedGrant = await upsertGrantHandler(ctx, {
    grant: grantDecision.grant,
  })
  if (storedGrant.kind !== 'recorded'
    || storedGrant.grantRef !== expectedGrantRef
    || storedGrant.generation !== nextGeneration
    || storedGrant.spendingPolicyDigest !== grantDecision.grant.spendingPolicyDigest) {
    throw new Error('agent_spending_policy_grant_conflict')
  }
  await ctx.db.patch(admission._id, {
    grantGeneration: storedGrant.generation,
    spendingPolicyDigest: storedGrant.spendingPolicyDigest,
    lastSeenAt: now,
  })
  await persistAgentAudit(ctx, {
    eventType: 'agent.policy_updated',
    actorPrincipalRef: owner.principalRef,
    activeAccountRef: owner.accountRef,
    agentRef: admission.principalId,
    correlationRef: args.correlationRef,
    idempotencyRef: commandNamespace,
    authorityGeneration: storedGrant.generation,
    beforeState: 'current',
    outcome: 'updated',
    occurredAt: now,
  })
  return {
    kind: 'completed',
    principalRef: admission.principalId,
    grantRef: storedGrant.grantRef,
    generation: storedGrant.generation,
    spendingPolicyDigest: storedGrant.spendingPolicyDigest,
    correlationRef: args.correlationRef,
  }
}
