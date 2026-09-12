import { v, type ObjectType } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createAgentAuditEnvelope,
  type AgentAuditInput,
} from '@/modules/agent-access/public'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import {
  MARKET_TOOLS_CALL_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
} from '@/modules/agent-access/contract'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { AccountRef, PrincipalRef } from '@/modules/principal-account/public'
import { createPackage3AuditEvent } from '@/modules/observability/public'
import {
  resolveCanonicalAgentContext,
  validateCanonicalAgentDelegation,
} from '../../canonicalAgentAuthority'
import { persistAuditEvent } from '../../../securityShared'
import { environment, authorityMode, lifecycle } from './verification'

export const agentPrincipalArgs = {
  principalId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
  grantGeneration: v.number(),
  spendingPolicyDigest: v.string(),
  lifecycle,
  expiresAt: v.optional(v.number()),
  seenAt: v.number(),
}
export const agentPrincipalResult = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('conflict') }),
)
export const registerAgentPrincipalResult = v.union(
  agentPrincipalResult,
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
)
export const getAgentPrincipalResult = v.union(v.object({
  principalId: v.string(),
  ownerId: v.string(),
  ownerTokenIdentifier: v.optional(v.string()),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
  grantGeneration: v.number(),
  spendingPolicyDigest: v.string(),
  lifecycle,
  expiresAt: v.optional(v.number()),
}), v.null())

export type AgentPrincipalWrite = Readonly<{
  principalId: string
  ownerId: string
  ownerTokenIdentifier?: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: readonly string[]
  authorityMode: 'read_only' | 'approval_required' | 'spending_policy' | 'unrestricted_test_only'
  grantGeneration: number
  spendingPolicyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt?: number
  seenAt: number
}>

export type CanonicalCredentialOwner = Readonly<{ principalRef: PrincipalRef; accountRef: AccountRef }>

const SUPPLIER_CONNECTION_DELEGATION_SCOPES = Object.freeze([
  'connection:install',
  'connection:refresh',
  'connection:revoke',
] as const)

/** Translate the public supplier permission into the existing canonical connection verbs. */
export function canonicalAgentDelegationScopes(scopes: readonly string[]): readonly string[] {
  return scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
    ? uniqueSorted([...scopes, ...SUPPLIER_CONNECTION_DELEGATION_SCOPES])
    : uniqueSorted(scopes)
}

export async function persistAgentAudit(
  ctx: Pick<MutationCtx, 'db'>,
  input: AgentAuditInput,
): Promise<void> {
  const audit = createPackage3AuditEvent(createAgentAuditEnvelope(input))
  if (!audit.valid) throw new Error(`agent_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
}

export async function writeAgentPrincipal(ctx: Pick<MutationCtx, 'db'>, args: AgentPrincipalWrite): Promise<{ kind: 'recorded' } | { kind: 'conflict' }> {
  if (args.environment === 'production' && args.authorityMode === 'unrestricted_test_only') return { kind: 'conflict' as const }
  const existing = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
  const scopes = uniqueSorted(args.scopes)
  if (existing !== null) {
    if (existing.credentialId !== args.credentialId || existing.ownerId !== args.ownerId
      || existing.applicationRef !== args.applicationRef || existing.environment !== args.environment
      || (existing.ownerTokenIdentifier !== undefined
        && args.ownerTokenIdentifier !== undefined
        && existing.ownerTokenIdentifier !== args.ownerTokenIdentifier)) return { kind: 'conflict' as const }
    await ctx.db.patch(existing._id, {
      scopes,
      authorityMode: args.authorityMode,
      grantGeneration: args.grantGeneration,
      spendingPolicyDigest: args.spendingPolicyDigest,
      lifecycle: args.lifecycle,
      ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
      lastSeenAt: args.seenAt,
      ...(args.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: args.ownerTokenIdentifier }),
    })
    return { kind: 'recorded' as const }
  }
  const credential = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', args.credentialId)).unique()
  if (credential !== null) return { kind: 'conflict' as const }
  await ctx.db.insert('agentAccessPrincipals', {
    principalId: args.principalId,
    ownerId: args.ownerId,
    credentialId: args.credentialId,
    applicationRef: args.applicationRef,
    environment: args.environment,
    scopes,
    authorityMode: args.authorityMode,
    grantGeneration: args.grantGeneration,
    spendingPolicyDigest: args.spendingPolicyDigest,
    lifecycle: args.lifecycle,
    ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
    ...(args.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: args.ownerTokenIdentifier }),
    recordedAt: args.seenAt,
    lastSeenAt: args.seenAt,
  })
  return { kind: 'recorded' as const }
}

export async function validReplacementAssertion(
  operation: string,
  command: StableHashValue,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  return key !== undefined
    && key.length >= 32
    && assertion.principalId === 'ae:server-function'
    && assertion.ownerId === 'ae:server-function'
    && assertion.credentialId === 'ae:server-function'
    && assertion.scopes.includes(MARKET_TOOLS_CALL_SCOPE)
    && await verifyCustomerRequestServiceAssertion({ key, operation, command, assertion })
}

export type ProviderRevocationCommand = Readonly<{
  principalRef: string
  credentialRef: string
  providerCredentialId: string
  correlationRef: string
  now: number
}>

/** Shared by credential-replacement and credential-revocation flows: both need to
 * park a pending provider-side revocation record and let the caller reconcile it. */
export async function ensureProviderRevocation(
  ctx: MutationCtx,
  command: ProviderRevocationCommand,
) {
  const existing = await ctx.db.query('agentAccessProviderRevocations')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', command.credentialRef))
    .unique()
  if (existing !== null) {
    if (existing.principalRef !== command.principalRef
      || existing.providerCredentialId !== command.providerCredentialId) {
      throw new Error('provider_revocation_identity_conflict')
    }
    if (existing.lifecycle === 'pending' && existing.correlationRef !== command.correlationRef) {
      await ctx.db.patch(existing._id, {
        correlationRef: command.correlationRef,
        updatedAt: command.now,
      })
    }
    return existing.lifecycle
  }
  await ctx.db.insert('agentAccessProviderRevocations', {
    revocationRef: canonicalDigest({
      format: 'agent-provider-revocation:v1',
      credentialRef: command.credentialRef,
    } as never),
    principalRef: command.principalRef,
    credentialRef: command.credentialRef,
    providerCredentialId: command.providerCredentialId,
    lifecycle: 'pending',
    correlationRef: command.correlationRef,
    createdAt: command.now,
    updatedAt: command.now,
  })
  return 'pending' as const
}

export async function recordAgentPrincipalHandler(ctx: MutationCtx, args: AgentPrincipalWrite) {
  return await writeAgentPrincipal(ctx, args)
}

export async function registerAgentPrincipalHandler(ctx: MutationCtx, args: ObjectType<typeof agentPrincipalArgs>) {
  const identity = await ctx.auth.getUserIdentity()
  const now = Date.now()
  if (identity === null || identity.tokenIdentifier.trim().length === 0) {
    return { kind: 'refused' as const, code: 'authentication_required' as const }
  }
  const canonical = await resolveCanonicalAgentContext(ctx, identity.tokenIdentifier, now)
  if (canonical === null) {
    return { kind: 'refused' as const, code: 'authentication_required' as const }
  }
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
  const grants = [...sandboxGrants, ...productionGrants]
  if (grants.length !== 1) return { kind: 'conflict' as const }
  const [grant] = grants
  if (grant === undefined) return { kind: 'conflict' as const }
  let normalizedGrant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  try {
    normalizedGrant = normalizeStoredAgentAccessGrant(grant)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'conflict' as const }, { site: 'registerAgentPrincipalHandler', reason: 'invalid_response' })
  }
  const delegation = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', grant.grantRef))
    .take(2)
  if (delegation.length !== 1) return { kind: 'conflict' as const }
  const [delegationGrant] = delegation
  if (delegationGrant === undefined) return { kind: 'conflict' as const }
  const liveDelegation = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'agent-principal-registration',
    evidenceRef: identity.tokenIdentifier,
    principalRef: canonical.principalRef,
    accountRef: canonical.accountRef,
    grantRef: grant.grantRef,
    grantGeneration: normalizedGrant.generation,
    requiredScopes: delegationGrant.scopes,
    resourceRefs: delegationGrant.resourceRefs,
    now,
  })
  const expectedScopes = canonicalAgentDelegationScopes(args.scopes)
  if (liveDelegation === null
    || args.principalId !== canonical.principalRef
    || args.credentialId !== canonical.credentialLocator
    || args.applicationRef !== grant.applicationRef
    || args.environment !== grant.environment
    || args.authorityMode !== normalizedGrant.authorityMode
    || args.grantGeneration !== normalizedGrant.generation
    || args.spendingPolicyDigest !== normalizedGrant.spendingPolicyDigest
    || args.lifecycle !== normalizedGrant.lifecycle
    || args.expiresAt !== normalizedGrant.expiresAt
    || grant.principalId !== canonical.principalRef
    || grant.ownerId !== canonical.accountRef
    || grant.credentialId !== canonical.credentialLocator
    || normalizedGrant.expiresAt > canonical.credentialExpiresAt
    || expectedScopes.length !== liveDelegation.scopes.length
    || expectedScopes.some((scope, index) => scope !== liveDelegation.scopes[index])) {
    return { kind: 'conflict' as const }
  }
  return await writeAgentPrincipal(ctx, {
    principalId: canonical.principalRef,
    ownerId: canonical.accountRef,
    credentialId: canonical.credentialLocator,
    applicationRef: grant.applicationRef,
    environment: grant.environment,
    scopes: uniqueSorted(args.scopes),
    authorityMode: normalizedGrant.authorityMode,
    grantGeneration: normalizedGrant.generation,
    spendingPolicyDigest: normalizedGrant.spendingPolicyDigest,
    lifecycle: normalizedGrant.lifecycle,
    expiresAt: normalizedGrant.expiresAt,
    seenAt: now,
    ownerTokenIdentifier: identity.tokenIdentifier,
  })
}

export async function getAgentPrincipalHandler(ctx: QueryCtx, args: Readonly<{ principalId: string }>) {
  const row = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
  return row === null || (row.environment === 'production' && row.authorityMode === 'unrestricted_test_only') ? null : {
    principalId: row.principalId,
    ownerId: row.ownerId,
    ...(row.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: row.ownerTokenIdentifier }),
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    environment: row.environment,
    scopes: row.scopes,
    authorityMode: row.authorityMode,
    grantGeneration: row.grantGeneration,
    spendingPolicyDigest: row.spendingPolicyDigest,
    lifecycle: row.lifecycle,
    ...(row.expiresAt === undefined ? {} : { expiresAt: row.expiresAt }),
  }
}
