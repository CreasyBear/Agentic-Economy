import type { Infer } from 'convex/values'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { validateCanonicalAgentDelegation } from '../../authority/canonicalAgent/authority'
import { resolveCurrentAgentAuthority } from './agentCallAuthority'
import { reconciledCallAuthorityResult, type CurrentAgentAuthority, type ReconciledCallAuthority } from './contracts'
import { refuseUnclaimedHandler } from './dispatchRefusal'

function callMatchesCurrentAuthority(
  row: Doc<'capabilityCalls'>,
  current: CurrentAgentAuthority,
): boolean {
  return [
    row.principalId === current.principal.principalId,
    row.ownerId === current.principal.ownerId,
    row.credentialId === current.principal.credentialId,
    row.applicationRef === current.principal.applicationRef,
    row.environment === current.principal.environment,
    row.grantRef === current.grantRef,
    row.grantGeneration === current.grantGeneration,
    row.policyDigest === current.policyDigest,
    row.grantExpiresAt === current.expiresAt,
  ].every(Boolean)
}

async function validatePersistedCallDelegation(
  ctx: MutationCtx,
  input: Readonly<{
    callRef: string
    toolRef: string
    principalId: string
    accountRef: string
    grantRef: string
    grantGeneration: number
  }>,
): Promise<boolean> {
  const accessGrant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef))
    .unique()
  if (accessGrant === null
    || accessGrant.lifecycle !== 'active'
    || accessGrant.generation !== input.grantGeneration
    || accessGrant.principalId !== input.principalId
    || accessGrant.ownerId !== input.accountRef) return false
  const canonicalGrant = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef))
    .unique()
  if (canonicalGrant === null) return false
  return await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'operation-workload-reconciliation',
    evidenceRef: input.callRef,
    principalRef: input.principalId,
    accountRef: input.accountRef,
    grantRef: input.grantRef,
    grantGeneration: canonicalGrant.generation,
    requiredScopes: [MARKET_TOOLS_CALL_SCOPE],
    resourceRefs: [input.toolRef],
    now: Date.now(),
  }) !== null
}

/**
 * Requires a previously accepted unresolved Call and live current authority for
 * the same credential. Ensures a monetary-only policy revision cannot rewrite or
 * strand that purchase's original authority. Both original and current canonical
 * delegations must still permit the Tool. Credential, scope, mode, rate/concurrency
 * or expiry changes never enter this exception. Invalid evidence returns null.
 */
async function reconcileAcceptedCallAfterLimitUpdate(
  ctx: MutationCtx,
  row: Doc<'capabilityCalls'>,
  current: CurrentAgentAuthority,
  now: number,
): Promise<ReconciledCallAuthority | null> {
  if ((row.state !== 'pending' && row.state !== 'reconciliation_required')
    || row.quoteRef === undefined
    || row.principalId !== current.principal.principalId
    || row.ownerId !== current.principal.ownerId
    || row.credentialId !== current.principal.credentialId
    || row.applicationRef !== current.principal.applicationRef
    || row.environment !== current.principal.environment
    || current.principal.authorityMode !== 'spending_policy'
    || current.grantGeneration <= row.grantGeneration
    || current.expiresAt !== row.grantExpiresAt) return null
  const quoteRef = row.quoteRef
  const [oldRow, currentRow, quote, delegation, currentDelegation] = await Promise.all([
    ctx.db.query('agentAccessGrants').withIndex('by_grantRef', q => q.eq('grantRef', row.grantRef)).unique(),
    ctx.db.query('agentAccessGrants').withIndex('by_grantRef', q => q.eq('grantRef', current.grantRef)).unique(),
    quoteRef === undefined
      ? Promise.resolve(null)
      : ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique(),
    ctx.db.query('authorityDelegationGrants').withIndex('by_grantRef', q => q.eq('grantRef', row.grantRef)).unique(),
    ctx.db.query('authorityDelegationGrants').withIndex('by_grantRef', q => q.eq('grantRef', current.grantRef)).unique(),
  ])
  if (oldRow === null || currentRow === null || delegation === null || currentDelegation === null
    || quote?.state !== 'consumed' || quote.consumedCallRef !== row.callRef
    || quote.grantRef !== row.grantRef || quote.grantPolicyDigest !== row.policyDigest
    || oldRow.lifecycle !== 'revoked' || currentRow.lifecycle !== 'active') return null
  if (canonicalDigest(uniqueSorted(delegation.scopes)) !== canonicalDigest(uniqueSorted(currentDelegation.scopes))
    || canonicalDigest(uniqueSorted(delegation.resourceRefs)) !== canonicalDigest(uniqueSorted(currentDelegation.resourceRefs))
    || delegation.budgetLimit !== currentDelegation.budgetLimit
    || delegation.expiresAt !== currentDelegation.expiresAt) return null
  let original: ReturnType<typeof normalizeStoredAgentAccessGrant>
  let latest: ReturnType<typeof normalizeStoredAgentAccessGrant>
  try {
    original = normalizeStoredAgentAccessGrant(oldRow)
    latest = normalizeStoredAgentAccessGrant(currentRow)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'reconcileAcceptedCallAfterLimitUpdate', reason: 'invalid_response' })
  }
  if (original.format !== 'ae.agent-access-grant:v2' || latest.format !== 'ae.agent-access-grant:v2'
    || original.principalId !== row.principalId || original.ownerId !== row.ownerId
    || original.credentialId !== row.credentialId || original.applicationRef !== row.applicationRef
    || original.environment !== row.environment || original.generation !== row.grantGeneration
    || original.spendingPolicyDigest !== row.policyDigest || original.expiresAt !== row.grantExpiresAt
    || latest.spendingPolicyDigest !== current.policyDigest) return null
  const nonMonetary = (grant: typeof original) => ({
    authorityMode: grant.authorityMode, environment: grant.environment,
    toolAccess: grant.toolAccess, toolRefs: grant.toolRefs,
    budgetPolicyRef: grant.spendingPolicy.budget.budgetPolicyRef,
    currency: grant.spendingPolicy.budget.currency, exponent: grant.spendingPolicy.budget.exponent,
    maximumConcurrentCalls: grant.spendingPolicy.budget.maximumConcurrentCalls,
    rate: grant.spendingPolicy.rate,
  })
  if (canonicalDigest(nonMonetary(original)) !== canonicalDigest(nonMonetary(latest))) return null
  const originalDelegation = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'accepted-call-policy-update-recovery', evidenceRef: row.callRef,
    principalRef: row.principalId, accountRef: row.ownerId, grantRef: row.grantRef,
    grantGeneration: delegation.generation, requiredScopes: [MARKET_TOOLS_CALL_SCOPE],
    resourceRefs: [row.toolRef], now,
  })
  return originalDelegation === null ? null : {
    principalId: row.principalId, accountRef: row.ownerId, credentialId: row.credentialId,
    grantRef: row.grantRef, grantGeneration: row.grantGeneration,
    policyDigest: row.policyDigest, expiresAt: row.grantExpiresAt,
  }
}

/** Return original grant material only when the accepted purchase remains
 * authorized under the narrow monetary-update contract. This never makes a
 * superseded grant active or authorizes a new purchase. Each effect check reads
 * current canonical authority again in this transaction. */
export async function readAcceptedCallGrantAfterLimitUpdateHandler(
  ctx: MutationCtx,
  args: Readonly<{ callRef: string }>,
): Promise<ReturnType<typeof normalizeStoredAgentAccessGrant> | null> {
  const authority = await reconcilePersistedCallAuthority(ctx, args.callRef, Date.now())
  if (authority === null) return null
  const row = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', q => q.eq('grantRef', authority.grantRef)).unique()
  if (row === null || row.lifecycle !== 'revoked') return null
  return normalizeStoredAgentAccessGrant(row)
}

export async function reconcilePersistedCallAuthority(
  ctx: MutationCtx,
  callRef: string,
  now: number,
): Promise<ReconciledCallAuthority | null> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (row === null) return null
  const storedAgent = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', row.credentialId))
    .unique()
  if (storedAgent === null) return null
  const current = await resolveCurrentAgentAuthority(ctx, {
    principalId: storedAgent.principalId,
    ownerId: storedAgent.ownerId,
    credentialId: storedAgent.credentialId,
    applicationRef: storedAgent.applicationRef,
    environment: storedAgent.environment,
    scopes: storedAgent.scopes,
    authorityMode: storedAgent.authorityMode,
  }, now, { kind: 'persisted_invocation', toolRef: row.toolRef })
  if (current === null) return null
  if (!callMatchesCurrentAuthority(row, current)) {
    return await reconcileAcceptedCallAfterLimitUpdate(ctx, row, current, now)
  }
  const delegationIsCurrent = await validatePersistedCallDelegation(ctx, {
    callRef: row.callRef,
    toolRef: row.toolRef,
    principalId: current.principal.principalId,
    accountRef: current.principal.ownerId,
    grantRef: current.grantRef,
    grantGeneration: current.grantGeneration,
  })
  if (!delegationIsCurrent) return null
  return Object.freeze({
    principalId: current.principal.principalId,
    accountRef: current.principal.ownerId,
    credentialId: current.principal.credentialId,
    grantRef: current.grantRef,
    grantGeneration: current.grantGeneration,
    policyDigest: current.policyDigest,
    expiresAt: current.expiresAt,
  })
}

export async function refuseCallBeforeEffectForInvalidAuthority(
  ctx: MutationCtx,
  callRef: string,
): Promise<void> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (row === null || row.state !== 'pending') return
  // The same transactional exclusion and durable refund intent applies when
  // workload authority refuses before the worker's own preparation gates.
  await refuseUnclaimedHandler(ctx, {
    callRef: row.callRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    idempotencyKey: row.idempotencyKey,
    code: 'grant_not_found',
    retryable: false,
    nextAction: 'Refresh the agent grant and retry.',
  })
}

export async function reconcileCallWorkloadAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{ callRef: string }>,
): Promise<Infer<typeof reconciledCallAuthorityResult>> {
  const authority = await reconcilePersistedCallAuthority(ctx, args.callRef, Date.now())
  if (authority === null) {
    await refuseCallBeforeEffectForInvalidAuthority(ctx, args.callRef)
    return { kind: 'refused' }
  }
  return { kind: 'authorized', authority }
}

