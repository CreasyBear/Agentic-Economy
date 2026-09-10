import { v, type ObjectType } from 'convex/values'
import { env, type MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { internal } from '../../../_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  agentAccessPolicyValue,
  agentAuditOpaqueRef,
} from '@/modules/agent-access/public'
import {
  createAgentAccessGrant,
  normalizeAgentAccessToolSelection,
} from '@/modules/agent-access/policy'
import type {
  AgentAccessGrantRegistrationResult,
  IssuedAgentBindingRegistration,
} from '@/modules/agent-access/agent-access'
import {
  MARKET_TOOLS_CALL_SCOPE,
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
import {
  PrincipalRegistry,
  PrincipalRegistryError,
  principalRef,
  type Principal,
} from '@/modules/principal-account/public'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../../delegationPersistence'
import { authorityMode, environment, lifecycle } from './verification'
import { canonicalAgentDelegationScopes, persistAgentAudit, writeAgentPrincipal } from './records'

export const issuedBindingArgs = {
  issuanceKey: v.string(),
  grantRef: v.string(),
  credentialId: v.string(),
  displayName: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()),
  spendingPolicy: agentAccessPolicyValue,
  createdAt: v.number(),
  expiresAt: v.number(),
}
export const issuedBindingResult = v.union(
  v.object({
    kind: v.union(v.literal('recorded'), v.literal('replayed')),
    grantRef: v.string(),
    generation: v.number(),
    spendingPolicyDigest: v.string(),
    lifecycle,
    expiresAt: v.number(),
  }),
  v.object({ kind: v.union(v.literal('conflict'), v.literal('unavailable')) }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
)
const REGISTER_ISSUED_BINDING_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'
export type RegisterIssuedBindingArgs = IssuedAgentBindingRegistration & Readonly<{
  serviceAuth: CustomerRequestServiceAssertion
}>
export type RegisterIssuedBindingResult = Readonly<{
  kind: 'recorded' | 'replayed'
  grantRef: string
  generation: number
  spendingPolicyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt: number
}> | Readonly<{
  kind: 'conflict' | 'unavailable'
}> | Readonly<{
  kind: 'refused'
  code: 'authentication_required'
}>

export const renameAgentArgs = {
  principalRef: v.string(),
  expectedRevision: v.number(),
  displayName: v.string(),
  correlationRef: v.string(),
}
export const renameAgentResult = v.union(
  v.object({
    kind: v.union(v.literal('completed'), v.literal('replayed')),
    principalRef: v.string(),
    displayName: v.string(),
    revision: v.number(),
    correlationRef: v.string(),
  }),
  v.object({ kind: v.literal('conflict'), code: v.string(), correlationRef: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required'), correlationRef: v.string() }),
)

function principalFromDocument(row: Doc<'principals'>): Principal {
  return Object.freeze({
    principalRef: principalRef(row.principalRef),
    kind: row.kind,
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.mergedIntoPrincipalRef === undefined
      ? {}
      : { mergedIntoPrincipalRef: principalRef(row.mergedIntoPrincipalRef) }),
  })
}

function principalDocument(principal: Principal) {
  return {
    principalRef: principal.principalRef,
    kind: principal.kind,
    displayName: principal.displayName,
    lifecycle: principal.lifecycle,
    revision: principal.revision,
    createdAt: principal.createdAt,
    updatedAt: principal.updatedAt,
    ...(principal.mergedIntoPrincipalRef === undefined
      ? {}
      : { mergedIntoPrincipalRef: principal.mergedIntoPrincipalRef }),
  }
}

function principalRegistry(ctx: Pick<MutationCtx, 'db'>, now: number): PrincipalRegistry {
  return new PrincipalRegistry({
    transact: async (operation) => await operation({
      get: async (ref) => {
        const row = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', ref))
          .unique()
        return row === null ? undefined : principalFromDocument(row)
      },
      insert: async (principal) => {
        const existing = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', principal.principalRef))
          .unique()
        if (existing !== null) throw new PrincipalRegistryError('principal_ref_conflict')
        await ctx.db.insert('principals', principalDocument(principal))
      },
      replace: async (principal, expectedRevision) => {
        const current = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', principal.principalRef))
          .unique()
        if (current === null) throw new PrincipalRegistryError('principal_not_found')
        if (current.revision !== expectedRevision) throw new PrincipalRegistryError('principal_revision_conflict')
        await ctx.db.replace(current._id, principalDocument(principal))
      },
      replaceMany: async (replacements) => {
        const current = await Promise.all(replacements.map(async ({ principal, expectedRevision }) => {
          const row = await ctx.db.query('principals')
            .withIndex('by_principalRef', (query) => query.eq('principalRef', principal.principalRef))
            .unique()
          if (row === null) throw new PrincipalRegistryError('principal_not_found')
          if (row.revision !== expectedRevision) throw new PrincipalRegistryError('principal_revision_conflict')
          return { row, principal }
        }))
        await Promise.all(current.map(async ({ row, principal }) => {
          await ctx.db.replace(row._id, principalDocument(principal))
        }))
      },
    }),
  }, { now: () => now })
}

function issuedBindingCommand(args: IssuedAgentBindingRegistration): StableHashValue {
  return {
    ...args,
    scopes: [...args.scopes],
    toolRefs: [...args.toolRefs],
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
    && assertion.scopes.includes(MARKET_TOOLS_CALL_SCOPE)
    && await verifyCustomerRequestServiceAssertion({
      key,
      operation: REGISTER_ISSUED_BINDING_OPERATION,
      command: issuedBindingCommand(args),
      assertion,
    })
}

export async function registerIssuedAgentBindingForServerHandler(
  ctx: MutationCtx,
  args: RegisterIssuedBindingArgs,
): Promise<RegisterIssuedBindingResult> {
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
  const toolSelection = normalizeAgentAccessToolSelection(input)
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
    || toolSelection === undefined
    || toolSelection.toolAccess !== input.spendingPolicy.toolAccess
    || toolSelection.toolRefs.length !== input.spendingPolicy.toolRefs.length
    || toolSelection.toolRefs.some((ref, index) => ref !== input.spendingPolicy.toolRefs[index])
    || agentAuthorityModeForScopes(scopes) !== input.authorityMode
    || input.spendingPolicy.environment !== input.environment
    || (input.environment === 'production' && input.authorityMode === 'unrestricted_test_only')) {
    return { kind: 'conflict' as const }
  }

  const refs = issuedAgentCanonicalRefs({
    ownerAccountRef: owner.accountRef,
    issuanceKey: input.issuanceKey,
    credentialId: input.credentialId,
    generation: 1,
    grantRef: input.grantRef,
  })
  const grantDecision = createAgentAccessGrant({
    grantRef: input.grantRef,
    principalId: refs.principalRef,
    ownerId: owner.accountRef,
    applicationRef: input.applicationRef,
    credentialId: input.credentialId,
    environment: input.environment,
    toolAccess: toolSelection.toolAccess,
    toolRefs: toolSelection.toolRefs,
    authorityMode: input.authorityMode,
    spendingPolicy: input.spendingPolicy,
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
    resourceRefs: toolSelection.toolAccess === 'all_admitted' ? ['*'] : toolSelection.toolRefs,
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
    || storedGrant.spendingPolicyDigest === undefined
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
    spendingPolicyDigest: storedGrant.spendingPolicyDigest,
    lifecycle: storedGrant.lifecycle,
    expiresAt: storedGrant.expiresAt,
    seenAt: now,
  })
  if (storedPrincipal.kind !== 'recorded') throw new Error('issued_agent_principal_conflict')
  if (existingPrincipal === null) await persistAgentAudit(ctx, {
    eventType: 'agent.created',
    actorPrincipalRef: owner.principalRef,
    activeAccountRef: owner.accountRef,
    agentRef: refs.principalRef,
    correlationRef: action.correlationRef,
    idempotencyRef: action.idempotencyRef,
    authorityGeneration: storedGrant.generation,
    beforeState: 'missing',
    outcome: 'created',
    occurredAt: now,
  })
  return {
    kind: replaying || storedGrant.kind === 'replayed' ? 'replayed' as const : 'recorded' as const,
    grantRef: storedGrant.grantRef,
    generation: storedGrant.generation,
    spendingPolicyDigest: storedGrant.spendingPolicyDigest,
    lifecycle: storedGrant.lifecycle,
    expiresAt: storedGrant.expiresAt,
  }
}

export async function renameAgentForServerHandler(ctx: MutationCtx, args: ObjectType<typeof renameAgentArgs>) {
  try {
    agentAuditOpaqueRef(args.correlationRef, 'correlationRef')
  } catch {
    return { kind: 'conflict' as const, code: 'correlation_ref_invalid' as const, correlationRef: 'invalid-correlation-reference' }
  }
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return { kind: 'refused' as const, code: 'authentication_required' as const, correlationRef: args.correlationRef }
  }
  let owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>
  try {
    owner = await resolveInteractiveAuthorityContext(ctx, identity)
  } catch {
    return { kind: 'refused' as const, code: 'authentication_required' as const, correlationRef: args.correlationRef }
  }
  if (owner.provenance.accessKind !== 'ownership') {
    return { kind: 'conflict' as const, code: 'account_ownership_required' as const, correlationRef: args.correlationRef }
  }
  const [principal, membership, admission] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', args.principalRef))
      .unique(),
    ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', owner.accountRef)
        .eq('memberPrincipalRef', args.principalRef)
        .eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', args.principalRef))
      .unique(),
  ])
  if (principal === null
    || principal.kind !== 'agent'
    || membership === null
    || admission === null
    || admission.ownerId !== owner.accountRef) {
    return { kind: 'conflict' as const, code: 'agent_not_found' as const, correlationRef: args.correlationRef }
  }

  const now = Date.now()
  try {
    const renamed = await principalRegistry(ctx, now).rename({
      principalRef: principalRef(args.principalRef),
      expectedRevision: args.expectedRevision,
      displayName: args.displayName,
    })
    const replayed = renamed.revision === principal.revision
    if (!replayed) await persistAgentAudit(ctx, {
      eventType: 'agent.renamed',
      actorPrincipalRef: owner.principalRef,
      activeAccountRef: owner.accountRef,
      agentRef: renamed.principalRef,
      correlationRef: args.correlationRef,
      idempotencyRef: `agent-rename:${renamed.principalRef}:${args.expectedRevision}`,
      beforeState: 'named',
      outcome: 'renamed',
      occurredAt: now,
    })
    return {
      kind: replayed ? 'replayed' as const : 'completed' as const,
      principalRef: renamed.principalRef,
      displayName: renamed.displayName,
      revision: renamed.revision,
      correlationRef: args.correlationRef,
    }
  } catch (error) {
    if (error instanceof PrincipalRegistryError) {
      return { kind: 'conflict' as const, code: error.code, correlationRef: args.correlationRef }
    }
    throw error
  }
}
