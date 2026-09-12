import { v, type Infer } from 'convex/values'
import type { RegisteredMutation } from 'convex/server'
import { degradeBackend } from '@/lib/observability/degrade-backend'

import { agentAccessGrantV2Value, normalizedAgentAccessGrantValue } from '@/modules/agent-access/public'
import {
  agentAccessPolicyDigest,
  normalizeAgentAccessToolSelection,
  projectAgentAccessGrant,
  normalizeStoredAgentAccessGrant,
  type AgentAccessGrant,
  type NormalizedStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { serviceAssertion } from './serviceAssertion'
import { internal } from './_generated/api'
import { env, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { resolveBusinessActor } from './authz'

const environment = v.union(v.literal('sandbox'), v.literal('production'))
const grantWriteResult = v.union(
  v.object({
    kind: v.literal('recorded'),
    grantRef: v.string(),
    generation: v.number(),
    spendingPolicyDigest: v.string(),
    lifecycle: v.union(v.literal('active'), v.literal('revoked'), v.literal('expired')),
    expiresAt: v.number(),
  }),
  v.object({
    kind: v.literal('replayed'),
    grantRef: v.string(),
    generation: v.number(),
    spendingPolicyDigest: v.string(),
    lifecycle: v.union(v.literal('active'), v.literal('revoked'), v.literal('expired')),
    expiresAt: v.number(),
  }),
  v.object({ kind: v.literal('conflict'), code: v.union(v.literal('grant_exists'), v.literal('generation_stale'), v.literal('grant_material_invalid')) }),
)
const serverServiceAuth = serviceAssertion
const serverAuthRefusal = v.object({
  kind: v.literal('refused'),
  code: v.literal('authentication_required'),
})
const grantWriteForServerResult = v.union(grantWriteResult, serverAuthRefusal)
const grantRevocationResult = v.union(
  v.object({ kind: v.literal('revoked'), grantRef: v.string(), generation: v.number() }),
  v.object({ kind: v.literal('already_revoked'), grantRef: v.string(), generation: v.number() }),
  v.object({ kind: v.literal('not_found'), grantRef: v.string() }),
  v.object({ kind: v.literal('binding_mismatch'), grantRef: v.string() }),
)

type RegisterGrantForServerArgs = {
  grant: AgentAccessGrant
  serviceAuth: Infer<typeof serverServiceAuth>
}
type RegisterGrantForServerResult = Infer<typeof grantWriteForServerResult>

const grantReadResult = v.union(normalizedAgentAccessGrantValue, v.null())
const publicGrantReadback = v.object({
  principalId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  authorityMode: v.union(v.literal('read_only'), v.literal('approval_required'), v.literal('spending_policy'), v.literal('unrestricted_test_only')),
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()),
  lifecycle: v.union(v.literal('active'), v.literal('revoked'), v.literal('expired')),
  expiresAt: v.number(),
  budget: v.object({
    maximumSpendPerCall: v.object({ currency: v.string(), units: v.string(), exponent: v.number() }),
    maximumDailySpend: v.object({ currency: v.string(), units: v.string(), exponent: v.number() }),
    maximumMonthlySpend: v.object({ currency: v.string(), units: v.string(), exponent: v.number() }),
    maximumConcurrentCalls: v.number(),
  }),
  rate: v.object({
    maximumCallsPerMinute: v.number(),
    maximumCallsPerHour: v.number(),
  }),
})


const registerGrantServerOperation = 'agentAccessPolicy.registerGrantForServer'

async function verifyServerAssertion(
  operation: string,
  command: StableHashValue,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32) return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation,
    command,
    assertion,
  })
}

function grantBindingMatchesAssertion(grant: AgentAccessGrant, assertion: CustomerRequestServiceAssertion): boolean {
  return assertion.scopes.includes(MARKET_TOOLS_CALL_SCOPE)
    && assertion.principalId === grant.principalId
    && assertion.ownerId === grant.ownerId
    && assertion.credentialId === grant.credentialId
}

function sameGrantMaterial(left: NormalizedStoredAgentAccessGrant, right: NormalizedStoredAgentAccessGrant): boolean {
  return left.format === right.format
    && left.spendingPolicy.format === right.spendingPolicy.format
    && left.grantRef === right.grantRef
    && left.principalId === right.principalId
    && left.ownerId === right.ownerId
    && left.applicationRef === right.applicationRef
    && left.credentialId === right.credentialId
    && left.environment === right.environment
    && left.toolAccess === right.toolAccess
    && left.toolRefs.length === right.toolRefs.length
    && left.toolRefs.every((ref, index) => ref === right.toolRefs[index])
    && left.authorityMode === right.authorityMode
    && left.generation === right.generation
    && left.spendingPolicyDigest === right.spendingPolicyDigest
    && left.budgetPolicyRef === right.budgetPolicyRef
    && left.ratePolicyRef === right.ratePolicyRef
    && left.expiresAt === right.expiresAt
}
export const listOwnerGrantReadbacks = query({
  args: { requireAuthority: v.optional(v.boolean()) },
  returns: v.array(publicGrantReadback),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      if (args.requireAuthority === true) {
        throw new Error('agent_access_owner_authority_required')
      }
      return []
    }
    const rows = await ctx.db.query('agentAccessGrants')
      .withIndex('by_ownerId_and_updatedAt', (grantQuery) => grantQuery.eq('ownerId', actor.canonicalAccountRef))
      .order('desc')
      .take(64)
    return rows.map((stored) => {
      const row = projectAgentAccessGrant(normalizeStoredAgentAccessGrant(stored))
      return {
        principalId: row.principalId,
        credentialId: row.credentialId,
        applicationRef: row.applicationRef,
        environment: row.environment,
        authorityMode: row.authorityMode,
        toolAccess: row.toolAccess,
        toolRefs: [...row.toolRefs],
        lifecycle: row.lifecycle,
        expiresAt: row.expiresAt,
        budget: {
          maximumSpendPerCall: row.budget.maximumSpendPerCall,
          maximumDailySpend: row.budget.maximumDailySpend,
          maximumMonthlySpend: row.budget.maximumMonthlySpend,
          maximumConcurrentCalls: row.budget.maximumConcurrentCalls,
        },
        rate: {
          maximumCallsPerMinute: row.rate.maximumCallsPerMinute,
          maximumCallsPerHour: row.rate.maximumCallsPerHour,
        },
      }
    })
  },
})
export const registerGrantForServer: RegisteredMutation<'public', RegisterGrantForServerArgs, RegisterGrantForServerResult> = mutation({
  args: {
    grant: agentAccessGrantV2Value,
    serviceAuth: serverServiceAuth,
  },
  returns: grantWriteForServerResult,
  handler: async (ctx, args): Promise<RegisterGrantForServerResult> => {
    if (!grantBindingMatchesAssertion(args.grant, args.serviceAuth)
      || !await verifyServerAssertion(registerGrantServerOperation, { grant: args.grant }, args.serviceAuth)) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    const principal = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (principalQuery) => principalQuery.eq('principalId', args.grant.principalId))
      .unique()
    if (principal === null
      || principal.credentialId !== args.grant.credentialId
      || principal.lifecycle !== 'active'
      || (principal.expiresAt !== undefined && principal.expiresAt <= Date.now())) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    return await ctx.runMutation(internal.agentAccessPolicy.upsertGrant, {
      grant: { ...args.grant, ownerId: principal.ownerId },
    })
  },
})
export const upsertGrant = internalMutation({
  args: {
    grant: agentAccessGrantV2Value,
  },
  returns: grantWriteResult,
  handler: async (ctx, args) => {
    let grant: AgentAccessGrant
    try {
      const normalized = normalizeStoredAgentAccessGrant(args.grant)
      if (normalized.format !== 'ae.agent-access-grant:v2') {
        return { kind: 'conflict' as const, code: 'grant_material_invalid' as const }
      }
      grant = normalized
    } catch (cause) {
      return degradeBackend(cause, { kind: 'conflict' as const, code: 'grant_material_invalid' as const }, { site: 'upsertGrant', reason: 'invalid_response' })
    }
    const selection = normalizeAgentAccessToolSelection(grant)
    if (selection === undefined
      || selection.toolRefs.some((ref, index) => ref !== grant.toolRefs[index])
      || grant.toolAccess !== grant.spendingPolicy.toolAccess
      || grant.toolRefs.length !== grant.spendingPolicy.toolRefs.length
      || grant.toolRefs.some((ref, index) => ref !== grant.spendingPolicy.toolRefs[index])
      || grant.spendingPolicy.environment !== grant.environment
      || (grant.environment === 'production' && grant.authorityMode === 'unrestricted_test_only')
      || grant.spendingPolicy.budget.budgetPolicyRef !== grant.budgetPolicyRef
      || grant.spendingPolicy.rate.ratePolicyRef !== grant.ratePolicyRef
      || grant.generation < 1
      || grant.spendingPolicy.budget.generation !== grant.generation
      || grant.spendingPolicy.rate.generation !== grant.generation
      || grant.expiresAt <= grant.createdAt
      || agentAccessPolicyDigest(grant.spendingPolicy) !== grant.spendingPolicyDigest) {
      return { kind: 'conflict' as const, code: 'grant_material_invalid' as const }
    }
    const existingByRef = await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', grant.grantRef)).unique()
    if (existingByRef !== null) {
      const existing = normalizeStoredAgentAccessGrant(existingByRef)
      return sameGrantMaterial(existing, grant)
        ? {
            kind: 'replayed' as const,
            grantRef: existing.grantRef,
            generation: existing.generation,
            spendingPolicyDigest: existing.spendingPolicyDigest,
            lifecycle: existing.lifecycle,
            expiresAt: existing.expiresAt,
          }
        : { kind: 'conflict' as const, code: 'grant_exists' as const }
    }
    const activeRows = await ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => (
        query.eq('credentialId', grant.credentialId).eq('environment', grant.environment).eq('lifecycle', 'active')
      ))
      .take(8)
    const activeForCredential = activeRows.filter((row) => row.credentialId === grant.credentialId && row.environment === grant.environment)
    for (const active of activeForCredential) {
      if (active.generation >= grant.generation) return { kind: 'conflict' as const, code: 'generation_stale' as const }
      await ctx.db.patch(active._id, { lifecycle: 'revoked', updatedAt: grant.updatedAt })
    }
    await ctx.db.insert('agentAccessGrants', grant)
    return {
      kind: 'recorded' as const,
      grantRef: grant.grantRef,
      generation: grant.generation,
      spendingPolicyDigest: grant.spendingPolicyDigest,
      lifecycle: grant.lifecycle,
      expiresAt: grant.expiresAt,
    }
  },
})

export const readGrant = internalQuery({
  args: { grantRef: v.string() },
  returns: grantReadResult,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef)).unique()
    if (row === null) return null
    const { _id, _creationTime, ...grant } = row
    return normalizeStoredAgentAccessGrant(grant)
  },
})

export const readActiveGrant = internalQuery({
  args: {
    credentialId: v.string(),
    environment,
    principalId: v.string(),
    applicationRef: v.string(),
    grantRef: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    generation: v.optional(v.number()),
    now: v.number(),
  },
  returns: grantReadResult,
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => (
        query.eq('credentialId', args.credentialId).eq('environment', args.environment).eq('lifecycle', 'active')
      ))
      .take(8)
    const row = rows.find((candidate) => candidate.principalId === args.principalId
      && candidate.applicationRef === args.applicationRef
      && (args.grantRef === undefined || candidate.grantRef === args.grantRef)
      && (args.ownerId === undefined || candidate.ownerId === args.ownerId)
      && (args.generation === undefined || candidate.generation === args.generation))
    if (row === undefined || row.expiresAt <= args.now) return null
    const grant = normalizeStoredAgentAccessGrant(row)
    if (grant.environment === 'production' && grant.authorityMode === 'unrestricted_test_only') return null
    return grant
  },
})

/** Internal lifecycle primitive. Owner-facing revocation uses the canonical
 * agent lifecycle commands, never this grant-shaped seam directly. */
export const revokeGrant = internalMutation({
  args: {
    grantRef: v.string(), ownerId: v.string(), credentialId: v.string(), principalId: v.string(), updatedAt: v.number(),
  },
  returns: grantRevocationResult,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef)).unique()
    if (row === null) return { kind: 'not_found' as const, grantRef: args.grantRef }
    if (row.ownerId !== args.ownerId || row.credentialId !== args.credentialId || row.principalId !== args.principalId) {
      return { kind: 'binding_mismatch' as const, grantRef: row.grantRef }
    }
    if (row.lifecycle !== 'active') return { kind: 'already_revoked' as const, grantRef: row.grantRef, generation: row.generation }
    await ctx.db.patch(row._id, { lifecycle: 'revoked', updatedAt: args.updatedAt })
    return { kind: 'revoked' as const, grantRef: row.grantRef, generation: row.generation }
  },
})
