import { v, type Infer } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import {
  MARKET_TOOLS_CALL_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
} from '@/modules/agent-access/contract'

export const environment = v.union(v.literal('sandbox'), v.literal('production'))
export const authorityMode = v.union(v.literal('read_only'), v.literal('approval_required'), v.literal('spending_policy'), v.literal('unrestricted_test_only'))
export const lifecycle = v.union(v.literal('active'), v.literal('revoked'), v.literal('expired'))

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

export type AgentPrincipalAdmission =
  | Readonly<{ kind: 'allowed'; grantRef: string; ownerId: string; principalId: string }>
  | Readonly<{ kind: 'refused'; reason: 'authorization_denied' }>

async function verifyAgentPrincipalForScope(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  principal: AgentAccessPrincipalValue,
  requiredScope: typeof MARKET_TOOLS_CALL_SCOPE | typeof MARKET_SUPPLY_MANAGE_SCOPE,
  requireSpendingPolicy = false,
): Promise<AgentPrincipalAdmission> {
  if (!principal.scopes.includes(requiredScope)
    || (principal.environment === 'production' && principal.authorityMode === 'unrestricted_test_only')
    || (requireSpendingPolicy && principal.authorityMode !== 'spending_policy' && principal.authorityMode !== 'unrestricted_test_only')) {
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
  const grant = grants.flatMap((candidate) => {
    try {
      return [normalizeStoredAgentAccessGrant(candidate)]
    } catch {
      return []
    }
  }).find((candidate) => candidate.principalId === stored.principalId
    && candidate.ownerId === stored.ownerId
    && candidate.credentialId === stored.credentialId
    && candidate.applicationRef === stored.applicationRef
    && candidate.authorityMode === stored.authorityMode
    && candidate.generation === stored.grantGeneration
    && candidate.spendingPolicyDigest === stored.spendingPolicyDigest
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
  requireSpendingPolicy = false,
): Promise<AgentPrincipalAdmission> {
  return await verifyAgentPrincipalForScope(ctx, principal, MARKET_SUPPLY_MANAGE_SCOPE, requireSpendingPolicy)
}

export async function verifyMarketAgentPrincipal(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  principal: AgentAccessPrincipalValue,
): Promise<AgentPrincipalAdmission> {
  return await verifyAgentPrincipalForScope(ctx, principal, MARKET_TOOLS_CALL_SCOPE)
}
