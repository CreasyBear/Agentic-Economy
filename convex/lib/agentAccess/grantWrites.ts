import { v } from 'convex/values'
import type { MutationCtx } from '../../_generated/server'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { agentAccessGrantV2Value } from '@/modules/agent-access/public'
import { normalizeStoredAgentAccessGrant, type AgentAccessGrant } from '@/modules/agent-access/policy'
import { grantWriteResult, grantRevocationResult } from './contracts'
import { invalidGrantMaterial, sameGrantMaterial } from './grantPredicates'

export const upsertGrantArgs = { grant: agentAccessGrantV2Value }
export { grantWriteResult, grantRevocationResult }
export const revokeGrantArgs = {
  grantRef: v.string(), ownerId: v.string(), credentialId: v.string(), principalId: v.string(), updatedAt: v.number(),
}


export async function upsertGrantHandler(ctx: MutationCtx, args: { grant: AgentAccessGrant }) {
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
    if (invalidGrantMaterial(grant)) {
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
}

export async function revokeGrantHandler(ctx: MutationCtx, args: { grantRef: string; ownerId: string; credentialId: string; principalId: string; updatedAt: number }) {
    const row = await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef)).unique()
    if (row === null) return { kind: 'not_found' as const, grantRef: args.grantRef }
    if (row.ownerId !== args.ownerId || row.credentialId !== args.credentialId || row.principalId !== args.principalId) {
      return { kind: 'binding_mismatch' as const, grantRef: row.grantRef }
    }
    if (row.lifecycle !== 'active') return { kind: 'already_revoked' as const, grantRef: row.grantRef, generation: row.generation }
    await ctx.db.patch(row._id, { lifecycle: 'revoked', updatedAt: args.updatedAt })
    return { kind: 'revoked' as const, grantRef: row.grantRef, generation: row.generation }
}
