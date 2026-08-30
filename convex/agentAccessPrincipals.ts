import { v, type Infer } from 'convex/values'
import type { RegisteredMutation } from 'convex/server'
import { env, mutation, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { agentAccessPolicyValue } from '@/modules/agent-access/public'
import { createAgentAccessGrant } from '@/modules/agent-access/policy'
import type {
  AgentAccessGrantRegistrationResult,
  IssuedAgentBindingRegistration,
} from '@/modules/agent-access/agent-access'
import {
  MARKET_OPERATIONS_INVOKE_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
  agentAuthorityModeForScopes,
} from '@/modules/agent-access/contract'
import {
  issuedAgentCanonicalRefs,
  issuedAgentGrantRef,
} from '@/modules/agent-access/issued-agent-binding'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { DelegationService } from '@/modules/authority/delegation/public'
import { principalRef } from '@/modules/principal-account/public'
import {
  resolveCanonicalAgentContext,
  validateCanonicalAgentDelegation,
} from './lib/canonicalAgentAuthority'
import { resolveInteractiveAuthorityContext } from './interactiveAuthority'
import { createConvexDelegationContextPort, createConvexDelegationStore } from './lib/delegationPersistence'
import { serviceAssertion } from './serviceAssertion'
import { internal } from './_generated/api'


const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo'))
const lifecycle = v.union(v.literal('active'), v.literal('revoked'), v.literal('expired'))
export const agentAccessPrincipalValue = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
})
export type AgentAccessPrincipalValue = Infer<typeof agentAccessPrincipalValue>
const agentPrincipalArgs = {
  principalId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
  grantGeneration: v.number(),
  policyDigest: v.string(),
  lifecycle,
  expiresAt: v.optional(v.number()),
  seenAt: v.number(),
}
const agentPrincipalResult = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('conflict') }),
)
const issuedBindingResult = v.union(
  v.object({
    kind: v.union(v.literal('recorded'), v.literal('replayed')),
    grantRef: v.string(),
    generation: v.number(),
    policyDigest: v.string(),
    lifecycle,
    expiresAt: v.number(),
  }),
  v.object({ kind: v.union(v.literal('conflict'), v.literal('unavailable')) }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
)
const issuedBindingArgs = {
  issuanceKey: v.string(),
  grantRef: v.string(),
  credentialId: v.string(),
  displayName: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
  policy: agentAccessPolicyValue,
  createdAt: v.number(),
  expiresAt: v.number(),
}
const REGISTER_ISSUED_BINDING_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'
type RegisterIssuedBindingArgs = IssuedAgentBindingRegistration & Readonly<{
  serviceAuth: CustomerRequestServiceAssertion
}>
type RegisterIssuedBindingResult = Readonly<{
  kind: 'recorded' | 'replayed'
  grantRef: string
  generation: number
  policyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt: number
}> | Readonly<{
  kind: 'conflict' | 'unavailable'
}> | Readonly<{
  kind: 'refused'
  code: 'authentication_required'
}>

type AgentPrincipalWrite = Readonly<{
  principalId: string
  ownerId: string
  ownerTokenIdentifier?: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: readonly string[]
  authorityMode: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
  grantGeneration: number
  policyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt?: number
  seenAt: number
}>

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

async function writeAgentPrincipal(ctx: Pick<MutationCtx, 'db'>, args: AgentPrincipalWrite): Promise<{ kind: 'recorded' } | { kind: 'conflict' }> {
  if (args.environment === 'production' && args.authorityMode === 'full_yolo') return { kind: 'conflict' as const }
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
      policyDigest: args.policyDigest,
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
    policyDigest: args.policyDigest,
    lifecycle: args.lifecycle,
    ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
    ...(args.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: args.ownerTokenIdentifier }),
    recordedAt: args.seenAt,
    lastSeenAt: args.seenAt,
  })
  return { kind: 'recorded' as const }
}

function issuedBindingCommand(args: IssuedAgentBindingRegistration): StableHashValue {
  return {
    ...args,
    scopes: [...args.scopes],
  } as StableHashValue
}

async function validIssuedBindingAssertion(
  args: IssuedAgentBindingRegistration,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  return key !== undefined
    && key.length >= 32
    && assertion.principalId === 'ae:server-function'
    && assertion.ownerId === 'ae:server-function'
    && assertion.credentialId === 'ae:server-function'
    && assertion.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
    && await verifyCustomerRequestServiceAssertion({
      key,
      operation: REGISTER_ISSUED_BINDING_OPERATION,
      command: issuedBindingCommand(args),
      assertion,
    })
}

export const registerIssuedAgentBindingForServer: RegisteredMutation<'public', RegisterIssuedBindingArgs, RegisterIssuedBindingResult> = mutation({
  args: { ...issuedBindingArgs, serviceAuth: serviceAssertion },
  returns: issuedBindingResult,
  handler: async (ctx, args): Promise<RegisterIssuedBindingResult> => {
    const { serviceAuth, ...input } = args
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null
      || identity.subject.trim().length === 0
      || !await validIssuedBindingAssertion(input, serviceAuth)) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }

    let owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>
    try {
      owner = await resolveInteractiveAuthorityContext(ctx, identity)
    } catch {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    const now = Date.now()
    const scopes = uniqueSorted(input.scopes)
    if (input.grantRef !== issuedAgentGrantRef(identity.subject, input.issuanceKey)) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    if (input.credentialId.trim().length === 0
      || input.displayName.trim().length === 0
      || input.displayName.length > 80
      || input.applicationRef.trim().length === 0
      || input.expiresAt <= now
      || input.createdAt > now + 60_000
      || scopes.length !== input.scopes.length
      || agentAuthorityModeForScopes(scopes) !== input.authorityMode
      || input.policy.environment !== input.environment
      || (input.environment === 'production' && input.authorityMode === 'full_yolo')) {
      return { kind: 'conflict' as const }
    }

    const refs = issuedAgentCanonicalRefs(input.credentialId, input.grantRef)
    const grantDecision = createAgentAccessGrant({
      grantRef: input.grantRef,
      principalId: refs.principalRef,
      ownerId: owner.accountRef,
      applicationRef: input.applicationRef,
      credentialId: input.credentialId,
      environment: input.environment,
      operationAccess: 'all_admitted',
      authorityMode: input.authorityMode,
      policy: input.policy,
      lifecycle: 'active',
      generation: 1,
      createdAt: input.createdAt,
      updatedAt: now,
      expiresAt: input.expiresAt,
    })
    if (grantDecision.kind === 'refused') return { kind: 'conflict' as const }

    const [existingBinding, existingCredential, existingPrincipal, memberships] = await Promise.all([
      ctx.db.query('externalIdentityBindings')
        .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
          .eq('providerNamespace', 'clerk/api-key')
          .eq('providerIdentifier', input.credentialId))
        .unique(),
      ctx.db.query('credentials')
        .withIndex('by_credentialRef', (query) => query.eq('credentialRef', refs.credentialRef))
        .unique(),
      ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', refs.principalRef))
        .unique(),
      ctx.db.query('memberships')
        .withIndex('by_memberPrincipalRef_and_lifecycle', (query) => query
          .eq('memberPrincipalRef', refs.principalRef)
          .eq('lifecycle', 'active'))
        .take(2),
    ])
    const replaying = existingBinding !== null || existingCredential !== null || existingPrincipal !== null || memberships.length > 0
    if ((existingBinding !== null && (existingBinding.bindingRef !== refs.bindingRef
        || existingBinding.principalRef !== refs.principalRef
        || existingBinding.lifecycle !== 'active'
        || existingBinding.providerState.kind !== 'known'
        || existingBinding.providerState.value !== 'active'
        || existingBinding.credentialGeneration !== 1))
      || (existingCredential !== null && (existingCredential.bindingRef !== refs.bindingRef
        || existingCredential.principalRef !== refs.principalRef
        || existingCredential.type !== 'api_key'
        || existingCredential.lifecycle !== 'active'
        || existingCredential.generation !== 1
        || existingCredential.expiresAt !== input.expiresAt))
      || (existingPrincipal !== null && (existingPrincipal.kind !== 'agent'
        || existingPrincipal.lifecycle !== 'active'
        || existingPrincipal.displayName !== input.displayName))
      || memberships.length > 1
      || (memberships[0] !== undefined && (memberships[0].membershipRef !== refs.membershipRef
        || memberships[0].accountRef !== owner.accountRef))) {
      return { kind: 'conflict' as const }
    }

    const action = {
      actorPrincipalRef: owner.principalRef,
      activeAccountRef: owner.accountRef,
      correlationRef: canonicalDigest({ format: 'issued-agent-binding:v1', grantRef: input.grantRef } as never),
      idempotencyRef: `issued-agent:${input.grantRef}`,
    }
    if (existingPrincipal === null) {
      await ctx.db.insert('principals', {
        principalRef: refs.principalRef,
        kind: 'agent',
        displayName: input.displayName,
        lifecycle: 'active',
        revision: 1,
        createdAt: now,
        updatedAt: now,
      })
    }
    if (memberships.length === 0) {
      await ctx.db.insert('memberships', {
        membershipRef: refs.membershipRef,
        accountRef: owner.accountRef,
        memberPrincipalRef: refs.principalRef,
        lifecycle: 'active',
        revision: 1,
        createdAt: now,
        createdBy: action,
      })
    }
    if (existingBinding === null) {
      await ctx.db.insert('externalIdentityBindings', {
        bindingRef: refs.bindingRef,
        principalRef: refs.principalRef,
        providerNamespace: 'clerk/api-key',
        providerIdentifier: input.credentialId,
        providerState: { kind: 'known', value: 'active' },
        lifecycle: 'active',
        credentialGeneration: 1,
        bindIdempotencyRef: action.idempotencyRef,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      })
    }
    if (existingCredential === null) {
      await ctx.db.insert('credentials', {
        credentialRef: refs.credentialRef,
        bindingRef: refs.bindingRef,
        principalRef: refs.principalRef,
        type: 'api_key',
        lifecycle: 'active',
        generation: 1,
        issueIdempotencyRef: action.idempotencyRef,
        revision: 1,
        issuedAt: input.createdAt,
        expiresAt: input.expiresAt,
        updatedAt: now,
      })
    }

    const delegation = await new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, principalRef(owner.principalRef)),
      { now: () => now, randomUuid: () => refs.delegationUuid },
    ).issueRoot({
      context: action,
      subjectPrincipalRef: principalRef(refs.principalRef),
      scopes: canonicalAgentDelegationScopes(scopes),
      resourceRefs: ['*'],
      budgetLimit: 1,
      expiresAt: input.expiresAt,
    })
    if (delegation.grantRef !== input.grantRef) throw new Error('issued_agent_grant_ref_mismatch')

    const storedGrant: AgentAccessGrantRegistrationResult = await ctx.runMutation(
      internal.agentAccessPolicy.upsertGrant,
      { grant: grantDecision.grant },
    )
    if ((storedGrant.kind !== 'recorded' && storedGrant.kind !== 'replayed')
      || storedGrant.grantRef === undefined
      || storedGrant.generation === undefined
      || storedGrant.policyDigest === undefined
      || storedGrant.lifecycle === undefined
      || storedGrant.expiresAt === undefined) throw new Error('issued_agent_grant_conflict')
    const storedPrincipal = await writeAgentPrincipal(ctx, {
      principalId: refs.principalRef,
      ownerId: owner.accountRef,
      ownerTokenIdentifier: identity.tokenIdentifier,
      credentialId: input.credentialId,
      applicationRef: input.applicationRef,
      environment: input.environment,
      scopes,
      authorityMode: input.authorityMode,
      grantGeneration: storedGrant.generation,
      policyDigest: storedGrant.policyDigest,
      lifecycle: storedGrant.lifecycle,
      expiresAt: storedGrant.expiresAt,
      seenAt: now,
    })
    if (storedPrincipal.kind !== 'recorded') throw new Error('issued_agent_principal_conflict')
    return {
      kind: replaying || storedGrant.kind === 'replayed' ? 'replayed' as const : 'recorded' as const,
      grantRef: storedGrant.grantRef,
      generation: storedGrant.generation,
      policyDigest: storedGrant.policyDigest,
      lifecycle: storedGrant.lifecycle,
      expiresAt: storedGrant.expiresAt,
    }
  },
})
export type AgentPrincipalAdmission =
  | Readonly<{ kind: 'allowed'; grantRef: string; ownerId: string; principalId: string }>
  | Readonly<{ kind: 'refused'; reason: 'authorization_denied' }>

async function verifyAgentPrincipalForScope(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  principal: AgentAccessPrincipalValue,
  requiredScope: typeof MARKET_OPERATIONS_INVOKE_SCOPE | typeof MARKET_SUPPLY_MANAGE_SCOPE,
  requireMandate = false,
): Promise<AgentPrincipalAdmission> {
  if (!principal.scopes.includes(requiredScope)
    || (principal.environment === 'production' && principal.authorityMode === 'full_yolo')
    || (requireMandate && principal.authorityMode !== 'bounded_mandate' && principal.authorityMode !== 'full_yolo')) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  const stored = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', principal.principalId)).unique()
  if (stored === null
    || stored.ownerId !== principal.ownerId
    || stored.credentialId !== principal.credentialId
    || stored.applicationRef !== principal.applicationRef
    || stored.environment !== principal.environment
    || stored.authorityMode !== principal.authorityMode
    || stored.lifecycle !== 'active'
    || (stored.expiresAt !== undefined && stored.expiresAt <= Date.now())
    || !stored.scopes.includes(requiredScope)
    || principal.scopes.some((scope) => !stored.scopes.includes(scope))) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  const grants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => (
      query.eq('credentialId', principal.credentialId)
        .eq('environment', principal.environment)
        .eq('lifecycle', 'active')
    ))
    .take(8)
  const grant = grants.find((candidate) => candidate.principalId === stored.principalId
    && candidate.ownerId === stored.ownerId
    && candidate.credentialId === stored.credentialId
    && candidate.applicationRef === stored.applicationRef
    && candidate.authorityMode === stored.authorityMode
    && candidate.operationAccess === 'all_admitted'
    && candidate.generation === stored.grantGeneration
    && candidate.policyDigest === stored.policyDigest
    && candidate.expiresAt > Date.now())
  return grant === undefined
    ? { kind: 'refused', reason: 'authorization_denied' }
    : {
        kind: 'allowed',
        grantRef: grant.grantRef,
        ownerId: stored.ownerId,
        principalId: stored.principalId,
      }
}

export type AgentSupplyPrincipalAdmission = AgentPrincipalAdmission

export async function verifySupplyAgentPrincipal(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  principal: AgentAccessPrincipalValue,
  requireMandate = false,
): Promise<AgentPrincipalAdmission> {
  return await verifyAgentPrincipalForScope(ctx, principal, MARKET_SUPPLY_MANAGE_SCOPE, requireMandate)
}

export async function verifyMarketAgentPrincipal(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  principal: AgentAccessPrincipalValue,
): Promise<AgentPrincipalAdmission> {
  return await verifyAgentPrincipalForScope(ctx, principal, MARKET_OPERATIONS_INVOKE_SCOPE)
}

export const recordAgentPrincipal = internalMutation({
  args: {
    ...agentPrincipalArgs,
    ownerId: v.string(),
    ownerTokenIdentifier: v.optional(v.string()),
  },
  returns: agentPrincipalResult,
  handler: async (ctx, args) => await writeAgentPrincipal(ctx, args),
})

export const registerAgentPrincipal = mutation({
  args: agentPrincipalArgs,
  returns: v.union(
    agentPrincipalResult,
    v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
  ),
  handler: async (ctx, args) => {
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
      grantGeneration: grant.generation,
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
      || args.authorityMode !== grant.authorityMode
      || args.grantGeneration !== grant.generation
      || args.policyDigest !== grant.policyDigest
      || args.lifecycle !== grant.lifecycle
      || args.expiresAt !== grant.expiresAt
      || grant.principalId !== canonical.principalRef
      || grant.ownerId !== canonical.accountRef
      || grant.credentialId !== canonical.credentialLocator
      || grant.expiresAt > canonical.credentialExpiresAt
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
      authorityMode: grant.authorityMode,
      grantGeneration: grant.generation,
      policyDigest: grant.policyDigest,
      lifecycle: grant.lifecycle,
      expiresAt: grant.expiresAt,
      seenAt: now,
      ownerTokenIdentifier: identity.tokenIdentifier,
    })
  },
})
export const getAgentPrincipal = internalQuery({
  args: { principalId: v.string() },
  returns: v.union(v.object({
    principalId: v.string(),
    ownerId: v.string(),
    ownerTokenIdentifier: v.optional(v.string()),
    credentialId: v.string(),
    applicationRef: v.string(),
    environment,
    scopes: v.array(v.string()),
    authorityMode,
    grantGeneration: v.number(),
    policyDigest: v.string(),
    lifecycle,
    expiresAt: v.optional(v.number()),
  }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
    return row === null || (row.environment === 'production' && row.authorityMode === 'full_yolo') ? null : {
      principalId: row.principalId,
      ownerId: row.ownerId,
      ...(row.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: row.ownerTokenIdentifier }),
      credentialId: row.credentialId,
      applicationRef: row.applicationRef,
      environment: row.environment,
      scopes: row.scopes,
      authorityMode: row.authorityMode,
      grantGeneration: row.grantGeneration,
      policyDigest: row.policyDigest,
      lifecycle: row.lifecycle,
      ...(row.expiresAt === undefined ? {} : { expiresAt: row.expiresAt }),
    }
  },
})
