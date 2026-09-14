import { v } from 'convex/values'
import type { QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'

import {
  agentSpendingLimitsReadResultValue,
  agentSpendingLimitsResultValue,
  agentSpendingLimitsUpdateArgs,
  agentSpendingLimitsUpdateSchema,
  type AgentSpendingLimitsReadResult,
  type AgentSpendingLimitsResult,
} from '@/modules/agent-access/spending-policy-update'
import {
  createAgentAccessGrant,
  normalizeStoredAgentAccessGrant,
  projectAgentAccessGrant,
  normalizeStoredAgentAccessPolicy,
  normalizeAgentAccessToolSelection,
} from '@/modules/agent-access/policy'
import { canonicalAgentDelegationScopes, persistAgentAudit } from './lib/agentAccess/principals/records'
import { resolveInteractiveAuthorityContext } from './interactiveAuthority'
import {
  resolveCanonicalAgentContext,
  validateCanonicalAgentDelegation,
} from './lib/canonicalAgentAuthority'
import { createConvexDelegationContextPort, createConvexDelegationStore } from './lib/delegationPersistence'
import { DelegationService, parsePersistedDelegationGrant } from '@/modules/authority/delegation/public'
import { principalRef } from '@/modules/principal-account/public'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { agentAuditOpaqueRef } from '@/modules/agent-access/public'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'

type AccessAdmission = Doc<'agentAccessPrincipals'>
type StoredCredential = Doc<'credentials'>
type StoredDelegation = Doc<'authorityDelegationGrants'>
type OwnerAuthority = Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>

type OwnedAgentMaterial = Readonly<{
  admission: AccessAdmission
  credential: StoredCredential
  grant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  delegation: StoredDelegation
}>

type OwnedAgentLoad =
  | Readonly<{ kind: 'ok'; material: OwnedAgentMaterial }>
  | Readonly<{ kind: 'agent_not_found' }>
  | Readonly<{ kind: 'authority_unavailable' }>
  | Readonly<{ kind: 'policy_invalid' }>

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

function isCurrentSupportedDelegation(
  delegation: ReturnType<typeof parsePersistedDelegationGrant>,
  owner: OwnerAuthority,
  admission: AccessAdmission,
  grant: ReturnType<typeof normalizeStoredAgentAccessGrant>,
  now: number,
): boolean {
  const expectedScopes = canonicalAgentDelegationScopes(admission.scopes)
  const expectedResources = grant.toolAccess === 'all_admitted' ? ['*'] : grant.toolRefs
  const hasResources = expectedResources.every((resource) => delegation.resourceRefs.includes('*') || delegation.resourceRefs.includes(resource))
  return delegation.grantRef === grant.grantRef
    && delegation.accountRef === owner.accountRef
    && delegation.actorPrincipalRef === owner.principalRef
    && delegation.subjectPrincipalRef === admission.principalId
    && delegation.parentGrantRef === undefined
    && delegation.parentGeneration === undefined
    && delegation.lifecycle === 'active'
    && delegation.expiresAt > now
    && expectedScopes.every((scope) => delegation.scopes.includes(scope))
    && hasResources
}

function readRows<T>(rows: readonly T[]): T | undefined {
  return rows.length === 1 ? rows[0] : undefined
}

/**
 * Load the complete current owner-owned Agent chain from canonical storage.
 * The admission row is only a projection: the credential, grant, and
 * delegation are independently checked before the caller may edit limits.
 */
async function loadOwnedAgent(
  ctx: Pick<QueryCtx, 'db'>,
  owner: OwnerAuthority,
  requestedPrincipalRef: string,
  now: number,
): Promise<OwnedAgentLoad> {
  const admissionRows = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (q) => q.eq('principalId', requestedPrincipalRef))
    .take(2)
  if (admissionRows.length > 1) return { kind: 'authority_unavailable' }
  const admission = readRows(admissionRows)
  if (admission === undefined || admission.lifecycle !== 'active' || admission.ownerId !== owner.accountRef) {
    return { kind: 'agent_not_found' }
  }

  // This resolver is the canonical source for the Agent Principal, Account,
  // binding, and current credential. The admission row only selects the
  // provider credential locator and carries the policy projection.
  const canonical = await resolveCanonicalAgentContext(ctx, admission.credentialId, now)
  if (canonical === null) return { kind: 'authority_unavailable' }
  if (canonical.accountRef !== owner.accountRef) return { kind: 'agent_not_found' }
  if (canonical.principalRef !== admission.principalId
    || canonical.credentialLocator !== admission.credentialId) {
    return { kind: 'authority_unavailable' }
  }
  const credentialRows = await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (q) => q.eq('credentialRef', canonical.credentialRef))
    .take(2)
  if (credentialRows.length !== 1) return { kind: 'authority_unavailable' }
  const credential = credentialRows[0]
  if (credential === undefined
    || credential.principalRef !== canonical.principalRef
    || credential.type !== 'api_key'
    || credential.generation !== canonical.credentialGeneration
    || credential.lifecycle !== 'active'
    || credential.expiresAt !== canonical.credentialExpiresAt
    || !Number.isSafeInteger(credential.issuedAt)
    || !Number.isSafeInteger(credential.expiresAt)
    || credential.expiresAt <= credential.issuedAt
    || credential.expiresAt <= now) {
    return { kind: 'authority_unavailable' }
  }

  const grantRows = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_lifecycle', (q) => q
      .eq('credentialId', admission.credentialId)
      .eq('environment', admission.environment)
      .eq('lifecycle', 'active'))
    .take(2)
  if (grantRows.length !== 1) return { kind: 'authority_unavailable' }
  const storedGrant = grantRows[0]
  if (storedGrant === undefined) return { kind: 'authority_unavailable' }
  let grant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  try {
    grant = normalizeStoredAgentAccessGrant(storedGrant)
  } catch {
    return { kind: 'policy_invalid' }
  }
  const selection = normalizeAgentAccessToolSelection(grant)
  const scopes = uniqueSorted(admission.scopes)
  if (selection === undefined
    || grant.principalId !== admission.principalId
    || grant.ownerId !== owner.accountRef
    || grant.applicationRef !== admission.applicationRef
    || grant.credentialId !== admission.credentialId
    || grant.environment !== admission.environment
    || grant.authorityMode !== admission.authorityMode
    || grant.lifecycle !== 'active'
    || grant.generation !== admission.grantGeneration
    || grant.spendingPolicyDigest !== admission.spendingPolicyDigest
    || grant.expiresAt <= now
    || grant.expiresAt > credential.expiresAt
    || scopes.length !== admission.scopes.length
    || !scopes.includes(MARKET_TOOLS_CALL_SCOPE)) {
    return { kind: 'authority_unavailable' }
  }
  if (grant.spendingPolicy.environment !== grant.environment
    || grant.spendingPolicy.budget.currency !== 'AUD'
    || grant.spendingPolicy.budget.exponent !== 6) {
    return { kind: 'policy_invalid' }
  }

  const delegationRows = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (q) => q.eq('grantRef', grant.grantRef))
    .take(2)
  if (delegationRows.length !== 1) return { kind: 'authority_unavailable' }
  const storedDelegation = delegationRows[0]
  if (storedDelegation === undefined) return { kind: 'authority_unavailable' }
  let delegation: ReturnType<typeof parsePersistedDelegationGrant>
  try {
    delegation = parsePersistedDelegationGrant(storedDelegation)
  } catch {
    return { kind: 'authority_unavailable' }
  }
  if (!isCurrentSupportedDelegation(delegation, owner, admission, grant, now)) {
    return { kind: 'authority_unavailable' }
  }
  return { kind: 'ok', material: { admission, credential, grant, delegation: storedDelegation } }
}

function mapLoadFailure(
  result: Exclude<OwnedAgentLoad, { kind: 'ok' }>,
  correlationRef?: string,
): AgentSpendingLimitsResult | AgentSpendingLimitsReadResult {
  if (result.kind === 'agent_not_found') {
    return correlationRef === undefined
      ? { kind: 'refused', code: 'agent_not_found' as const }
      : { kind: 'conflict', code: 'agent_not_found' as const, correlationRef }
  }
  if (result.kind === 'policy_invalid') {
    return correlationRef === undefined
      ? { kind: 'refused', code: 'authority_unavailable' as const }
      : { kind: 'conflict', code: 'policy_invalid' as const, correlationRef }
  }
  return correlationRef === undefined
    ? { kind: 'refused', code: 'authority_unavailable' as const }
    : { kind: 'conflict', code: 'authority_unavailable' as const, correlationRef }
}

function validOpaqueCommandRef(value: string, label: 'correlationRef' | 'idempotencyRef'): boolean {
  try {
    agentAuditOpaqueRef(value, label)
    return true
  } catch {
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
export const updateForServer = mutation({
  args: agentSpendingLimitsUpdateArgs,
  returns: agentSpendingLimitsResultValue,
  handler: async (ctx, args): Promise<AgentSpendingLimitsResult> => {
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
    } catch {
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
    } catch {
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
      } catch {
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

    const storedGrant = await ctx.runMutation(internal.agentAccessPolicy.upsertGrant, {
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
  },
})

/**
 * Owner-authenticated current readback. The query returns only the three
 * editable amounts plus the immutable grant revision/digest needed to issue a
 * fenced update; all other policy material remains server-owned.
 */
export const readCurrent = query({
  args: { principalRef: v.string() },
  returns: agentSpendingLimitsReadResultValue,
  handler: async (ctx, args): Promise<AgentSpendingLimitsReadResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused', code: 'authentication_required' }
    let owner: OwnerAuthority
    try {
      owner = await resolveInteractiveAuthorityContext(ctx.db, identity)
    } catch {
      return { kind: 'refused', code: 'authority_unavailable' }
    }
    if (owner.provenance.accessKind !== 'ownership') {
      return { kind: 'refused', code: 'account_ownership_required' }
    }
    const requestedPrincipalRef = args.principalRef.trim()
    if (requestedPrincipalRef.length === 0) return { kind: 'refused', code: 'agent_not_found' }
    const loaded = await loadOwnedAgent(ctx, owner, requestedPrincipalRef, Date.now())
    if (loaded.kind !== 'ok') return mapLoadFailure(loaded) as AgentSpendingLimitsReadResult
    const { admission, grant } = loaded.material
    const budget = projectAgentAccessGrant(grant).budget
    return {
      kind: 'current',
      principalRef: admission.principalId,
      grantRef: grant.grantRef,
      generation: grant.generation,
      spendingPolicyDigest: grant.spendingPolicyDigest,
      maximumSpendPerCall: budget.maximumSpendPerCall,
      maximumDailySpend: budget.maximumDailySpend,
      maximumMonthlySpend: budget.maximumMonthlySpend,
    }
  },
})
