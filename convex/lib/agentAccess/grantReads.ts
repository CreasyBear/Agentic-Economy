import { v } from 'convex/values'
import type { QueryCtx } from '../../_generated/server'
import { resolveBusinessActor } from '../../authz'
import { projectAgentAccessGrant, normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import type { AgentAccessEnvironment } from '@/modules/agent-access/agent-access'
import { environment, grantReadResult, publicGrantReadback } from './contracts'

export const listOwnerGrantReadbacksArgs = { requireAuthority: v.optional(v.boolean()) }
export const listOwnerGrantReadbacksResult = v.array(publicGrantReadback)
export const readGrantArgs = { grantRef: v.string() }
export const readActiveGrantArgs = {
  credentialId: v.string(), environment, principalId: v.string(), applicationRef: v.string(),
  grantRef: v.optional(v.string()), ownerId: v.optional(v.string()),
  generation: v.optional(v.number()), now: v.number(),
}
export { grantReadResult }

export async function listOwnerGrantReadbacksHandler(ctx: QueryCtx, args: { requireAuthority?: boolean }) {
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
