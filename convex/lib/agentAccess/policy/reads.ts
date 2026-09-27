import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { projectAgentAccessGrant, normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import { agentSpendingPolicyStateValue } from '@/modules/agent-access/spending-policy-update'
import { loadOwnedAgent, policyFromMaterial } from '../spendingPolicy/material'
import type { AgentAccessEnvironment } from '@/modules/agent-access/agent-access'
import { environment, grantReadResult, publicGrantReadback } from './contracts'

export const listOwnerGrantReadbacksArgs = {
  requireAuthority: v.optional(v.boolean()),
  principalRefs: v.optional(v.array(v.string())),
}
export const listOwnerGrantReadbacksResult = v.array(v.object({
  principalRef: v.string(),
  spendingPolicy: agentSpendingPolicyStateValue,
  grant: v.optional(publicGrantReadback),
}))
export const readGrantArgs = { grantRef: v.string() }
export const readActiveGrantArgs = {
  credentialId: v.string(), environment, principalId: v.string(), applicationRef: v.string(),
  grantRef: v.optional(v.string()), ownerId: v.optional(v.string()),
  generation: v.optional(v.number()), now: v.number(),
}
export { grantReadResult }

/** Page-scoped owner authority: each requested principal uses bounded indexed joins. */
export async function listOwnerGrantReadbacksHandler(
  ctx: QueryCtx,
  args: { requireAuthority?: boolean; principalRefs?: string[] },
) {
  const identity = await ctx.auth.getUserIdentity()
  const owner = identity === null ? null : await resolveInteractiveAuthorityContext(ctx.db, identity)
  if (owner?.provenance.accessKind !== 'ownership') {
    if (args.requireAuthority === true) throw new Error('agent_access_owner_authority_required')
    return []
  }
  if (args.principalRefs === undefined) return []
  if (args.principalRefs.length > 25 || new Set(args.principalRefs).size !== args.principalRefs.length
    || args.principalRefs.some((ref) => ref.trim().length === 0)) {
    throw new Error('agent_access_policy_page_invalid')
  }
  const now = Date.now()
  return await Promise.all(args.principalRefs.map(async (principalRef) => {
    const loaded = await loadOwnedAgent(ctx, owner, principalRef, now)
    if (loaded.kind === 'agent_not_found') return null
    if (loaded.kind !== 'ok') return {
      principalRef,
      spendingPolicy: loaded.kind === 'expired'
        ? { kind: 'expired' as const, expiresAt: loaded.expiresAt }
        : { kind: 'unavailable' as const },
    }
    const { grant } = loaded.material
    const row = projectAgentAccessGrant(grant)
    return {
      principalRef,
      spendingPolicy: policyFromMaterial(loaded.material),
      grant: {
        principalId: row.principalId, credentialId: row.credentialId,
        applicationRef: row.applicationRef, environment: row.environment,
        authorityMode: row.authorityMode, toolAccess: row.toolAccess, toolRefs: [...row.toolRefs],
        lifecycle: row.lifecycle, expiresAt: row.expiresAt,
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
      },
    }
  })).then((rows) => rows.filter((row) => row !== null))
}

export async function readGrantHandler(ctx: QueryCtx, args: { grantRef: string }) {
    const row = await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef)).unique()
    if (row === null) return null
    const { _id, _creationTime, ...grant } = row
    return normalizeStoredAgentAccessGrant(grant)
}

export async function readActiveGrantHandler(ctx: QueryCtx, args: { credentialId: string; environment: AgentAccessEnvironment; principalId: string; applicationRef: string; grantRef?: string; ownerId?: string; generation?: number; now: number }) {
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
}
