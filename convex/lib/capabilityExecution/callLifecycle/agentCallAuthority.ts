import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { Doc } from '../../../_generated/dataModel'
import type { ActionCtx, QueryCtx } from '../../../_generated/server'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { normalizedAgentAccessGrantValue } from '@/modules/agent-access/public'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { resolveCanonicalAgentContext, validateCanonicalAgentDelegation } from '../../authority/canonicalAgent/authority'
import { principalValue, type CurrentAgentAuthority, type CallPrincipal } from './contracts'

export const resolveCallAgentAuthorityArgs = {
  principal: principalValue,
  toolRef: v.optional(v.string()),
  callRef: v.optional(v.string()),
  receiptList: v.optional(v.literal(true)),
}
export const reconcileCallWorkloadAuthorityArgs = { callRef: v.string() }
export const readAcceptedCallGrantAfterLimitUpdateArgs = { callRef: v.string() }
export const resolveCallAgentAuthorityResult = v.union(principalValue, v.null())
export const readAcceptedCallGrantAfterLimitUpdateResult = v.union(normalizedAgentAccessGrantValue, v.null())

const resolveCallAgentAuthorityRef = makeFunctionReference<
  'mutation',
  { principal: CallPrincipal; toolRef?: string; callRef?: string; receiptList?: true },
  CallPrincipal | null
>('capabilityCalls:resolveCallAgentAuthority')

type CurrentAuthorityPurpose =
  | Readonly<{ kind: 'new_operation'; toolRef: string }>
  | Readonly<{ kind: 'persisted_invocation'; toolRef: string }>
  | Readonly<{ kind: 'receipt_list' }>

type CallAuthorityTarget = Readonly<{
  purpose: CurrentAuthorityPurpose
  invocation: Doc<'capabilityCalls'> | null
}>


async function resolveCallAuthorityTarget(
  ctx: Pick<QueryCtx, 'db'>,
  args: Readonly<{ toolRef?: string; callRef?: string; receiptList?: true }>,
): Promise<CallAuthorityTarget | null> {
  const targetCount = Number(args.toolRef !== undefined)
    + Number(args.callRef !== undefined)
    + Number(args.receiptList === true)
  if (targetCount !== 1) return null
  if (args.toolRef !== undefined) {
    return { purpose: { kind: 'new_operation', toolRef: args.toolRef }, invocation: null }
  }
  if (args.receiptList === true) return { purpose: { kind: 'receipt_list' }, invocation: null }
  if (args.callRef === undefined) return null
  const callRef = args.callRef
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .take(2)
  if (rows.length !== 1) return null
  const [invocation] = rows
  return invocation === undefined
    ? null
    : {
        purpose: { kind: 'persisted_invocation', toolRef: invocation.toolRef },
        invocation,
      }
}

export async function resolveCallAgentAuthorityHandler(
  ctx: Pick<QueryCtx, 'db'>,
  args: Readonly<{ principal: CallPrincipal; toolRef?: string; callRef?: string; receiptList?: true }>,
): Promise<CallPrincipal | null> {
  const target = await resolveCallAuthorityTarget(ctx, args)
  if (target === null) return null
  const current = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    Date.now(),
    target.purpose,
  )
  if (current === null) return null
  // Recovery is owned by the durable Agent and Account. Exact historical grant
  // and credential matching remains mandatory for dispatch, not for readback or
  // remedy through a currently authorised replacement credential.
  if (target.invocation !== null && ![
    target.invocation.principalId === current.principal.principalId,
    target.invocation.ownerId === current.principal.ownerId,
    target.invocation.applicationRef === current.principal.applicationRef,
    target.invocation.environment === current.principal.environment,
  ].every(Boolean)) return null
  return current.principal
}

export async function canonicalAgentPrincipal(
  ctx: ActionCtx,
  principal: CallPrincipal,
  target: Readonly<{ toolRef: string } | { callRef: string } | { receiptList: true }>,
): Promise<CallPrincipal | null> {
  return await ctx.runMutation(resolveCallAgentAuthorityRef, { principal, ...target })
}

type CanonicalAgentContext = NonNullable<Awaited<ReturnType<typeof resolveCanonicalAgentContext>>>
type StoredAgent = Doc<'agentAccessPrincipals'>
type NormalizedActiveGrant = ReturnType<typeof normalizeStoredAgentAccessGrant>

function validAuthorityRequest(candidate: CallPrincipal, now: number, purpose: CurrentAuthorityPurpose): boolean {
  return [
    Number.isSafeInteger(now),
    now >= 0,
    purpose.kind === 'receipt_list' || purpose.toolRef.trim().length > 0,
    candidate.scopes.includes(MARKET_TOOLS_CALL_SCOPE),
  ].every(Boolean)
}

function candidateMatchesCanonical(candidate: CallPrincipal, canonical: CanonicalAgentContext): boolean {
  return [
    candidate.principalId === canonical.principalRef,
    candidate.ownerId === canonical.accountRef,
  ].every(Boolean)
}

function scopeSubset(candidateScopes: readonly string[], storedScopes: readonly string[]): boolean {
  return candidateScopes.every((scope) => storedScopes.includes(scope))
}

function storedAgentMatches(
  stored: StoredAgent,
  candidate: CallPrincipal,
  canonical: CanonicalAgentContext,
  now: number,
): boolean {
  const unexpired = stored.expiresAt === undefined || stored.expiresAt > now
  return [
    stored.principalId === canonical.principalRef,
    stored.ownerId === canonical.accountRef,
    stored.credentialId === candidate.credentialId,
    stored.applicationRef === candidate.applicationRef,
    stored.environment === candidate.environment,
    stored.authorityMode === candidate.authorityMode,
    stored.lifecycle === 'active',
    unexpired,
    stored.scopes.includes(MARKET_TOOLS_CALL_SCOPE),
    scopeSubset(candidate.scopes, stored.scopes),
  ].every(Boolean)
}

async function loadCurrentStoredAgent(
  ctx: Pick<QueryCtx, 'db'>,
  candidate: CallPrincipal,
  canonical: CanonicalAgentContext,
  now: number,
): Promise<StoredAgent | null> {
  const rows = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', canonical.credentialLocator))
    .take(2)
  if (rows.length !== 1) return null
  const [stored] = rows
  if (stored === undefined) return null
  return storedAgentMatches(stored, candidate, canonical, now) ? stored : null
}

function activeGrantMatches(
  grant: NormalizedActiveGrant,
  stored: StoredAgent,
  canonical: CanonicalAgentContext,
  now: number,
): boolean {
  return [
    grant.principalId === canonical.principalRef,
    grant.ownerId === stored.ownerId,
    grant.applicationRef === stored.applicationRef,
    grant.environment === stored.environment,
    grant.authorityMode === stored.authorityMode,
    grant.generation === stored.grantGeneration,
    grant.spendingPolicyDigest === stored.spendingPolicyDigest,
    grant.expiresAt > now,
    grant.expiresAt <= canonical.credentialExpiresAt,
  ].every(Boolean)
}

async function loadCurrentActiveGrant(
  ctx: Pick<QueryCtx, 'db'>,
  stored: StoredAgent,
  canonical: CanonicalAgentContext,
  now: number,
): Promise<NormalizedActiveGrant | null> {
  const [sandboxGrants, productionGrants] = await Promise.all([
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', canonical.credentialLocator)
        .eq('environment', 'sandbox')
        .eq('lifecycle', 'active'))
      .take(2),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', canonical.credentialLocator)
        .eq('environment', 'production')
        .eq('lifecycle', 'active'))
      .take(2),
  ])
  const activeGrants = [...sandboxGrants, ...productionGrants]
  if (activeGrants.length !== 1) return null
  const [storedGrant] = activeGrants
  if (storedGrant === undefined) return null
  let grant: NormalizedActiveGrant
  try {
    grant = normalizeStoredAgentAccessGrant(storedGrant)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'loadCurrentActiveGrant', reason: 'invalid_response' })
  }
  return activeGrantMatches(grant, stored, canonical, now) ? grant : null
}

function delegationResourceForPurpose(
  grant: NormalizedActiveGrant,
  purpose: CurrentAuthorityPurpose,
): string | undefined {
  if (purpose.kind === 'persisted_invocation') return purpose.toolRef
  if (purpose.kind === 'new_operation') {
    if (!isPublicToolRef(purpose.toolRef)) return undefined
    return grant.toolAccess === 'all_admitted' || grant.toolRefs.includes(purpose.toolRef)
      ? purpose.toolRef
      : undefined
  }
  return grant.toolAccess === 'all_admitted' ? '*' : grant.toolRefs[0]
}

/**
 * The caller is a current Agent with an active grant carrying the call scope. Used before Quote
 * resolves a listing or URL; the per-Tool delegation is checked against the resolved ref after.
 */
export async function hasCurrentAgentGrant(
  ctx: Pick<QueryCtx, 'db'>,
  candidate: CallPrincipal,
  now: number,
): Promise<boolean> {
  if (!validAuthorityRequest(candidate, now, { kind: 'receipt_list' })) return false
  const canonical = await resolveCanonicalAgentContext(ctx, candidate.credentialId, now)
  if (canonical === null || !candidateMatchesCanonical(candidate, canonical)) return false
  const storedAgent = await loadCurrentStoredAgent(ctx, candidate, canonical, now)
  return storedAgent !== null && await loadCurrentActiveGrant(ctx, storedAgent, canonical, now) !== null
}

export async function resolveCurrentAgentAuthority(
  ctx: Pick<QueryCtx, 'db'>,
  candidate: CallPrincipal,
  now: number,
  purpose: CurrentAuthorityPurpose,
): Promise<CurrentAgentAuthority | null> {
  if (!validAuthorityRequest(candidate, now, purpose)) return null

  const canonical = await resolveCanonicalAgentContext(ctx, candidate.credentialId, now)
  if (canonical === null || !candidateMatchesCanonical(candidate, canonical)) return null
  const storedAgent = await loadCurrentStoredAgent(ctx, candidate, canonical, now)
  if (storedAgent === null) return null
  const grant = await loadCurrentActiveGrant(
    ctx,
    storedAgent,
    canonical,
    now,
  )
  if (grant === null) return null
  const resourceRef = delegationResourceForPurpose(grant, purpose)
  if (resourceRef === undefined) return null

  const scopes = uniqueSorted(candidate.scopes)
  if (scopes.length !== candidate.scopes.length) return null
  // Credential replacement issues a new delegation, whose own generation can
  // differ from the Agent access generation used in Call authority evidence.
  const canonicalGrant = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', grant.grantRef))
    .unique()
  if (canonicalGrant === null) return null
  const delegation = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: purpose.kind === 'receipt_list' ? 'operation-receipt-list' : 'operation-public-admission',
    evidenceRef: resourceRef,
    principalRef: canonical.principalRef,
    accountRef: canonical.accountRef,
    grantRef: grant.grantRef,
    grantGeneration: canonicalGrant.generation,
    requiredScopes: scopes,
    resourceRefs: [resourceRef],
    now,
  })
  if (delegation === null) return null

  return Object.freeze({
    principal: Object.freeze({
      principalId: canonical.principalRef,
      ownerId: canonical.accountRef,
      credentialId: storedAgent.credentialId,
      applicationRef: storedAgent.applicationRef,
      environment: storedAgent.environment,
      scopes,
      authorityMode: storedAgent.authorityMode,
    }),
    grantRef: grant.grantRef,
    grantGeneration: grant.generation,
    policyDigest: grant.spendingPolicyDigest,
    expiresAt: grant.expiresAt,
  })
}

