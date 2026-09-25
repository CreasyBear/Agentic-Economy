import { degradeBackend } from '@/lib/observability/degrade-backend'
import { AGENT_ACCESS_GRANT_FORMAT, AGENT_ACCESS_POLICY_FORMAT, normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
export function refreshFamilyFromDocument(row: Doc<'agentAccessOAuthRefreshFamilies'>) {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}

export async function resolveRefreshCanonicalMaterial(ctx: MutationCtx, keyId: string) {
  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', keyId)).unique()
  if (binding === null || binding.lifecycle !== 'active' || binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'active') return null
  const [credential, accessPrincipal] = await Promise.all([
    ctx.db.query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
        .eq('bindingRef', binding.bindingRef).eq('generation', binding.credentialGeneration).eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', binding.principalRef)).unique(),
  ])
  if (credential === null || accessPrincipal === null || accessPrincipal.lifecycle !== 'active'
    || accessPrincipal.credentialId !== keyId || credential.principalRef !== accessPrincipal.principalId) return null
  const grants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
      .eq('credentialId', keyId).eq('environment', accessPrincipal.environment).eq('lifecycle', 'active'))
    .take(2)
  const grant = grants.find((candidate) => candidate.principalId === accessPrincipal.principalId)
  if (grant === undefined || grant.format !== AGENT_ACCESS_GRANT_FORMAT) return null
  let normalizedGrant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  try {
    normalizedGrant = normalizeStoredAgentAccessGrant(grant)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'resolveRefreshCanonicalMaterial', reason: 'invalid_response' })
  }
  if (normalizedGrant.format !== AGENT_ACCESS_GRANT_FORMAT
    || normalizedGrant.spendingPolicy.format !== AGENT_ACCESS_POLICY_FORMAT
    || normalizedGrant.generation !== credential.generation
    || normalizedGrant.spendingPolicyDigest !== accessPrincipal.spendingPolicyDigest) return null
  const [membership, ownerships] = await Promise.all([
    ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', accessPrincipal.ownerId).eq('memberPrincipalRef', accessPrincipal.principalId).eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('accountOwnerships')
      .withIndex('by_accountRef_and_lifecycle', (query) => query.eq('accountRef', accessPrincipal.ownerId).eq('lifecycle', 'active'))
      .take(2),
  ])
  const ownership = ownerships[0]
  if (membership === null || ownerships.length !== 1 || ownership === undefined) return null
  return {
    ownerId: accessPrincipal.ownerId,
    ownerPrincipalRef: ownership.ownerPrincipalRef,
    principalRef: accessPrincipal.principalId,
    applicationRef: accessPrincipal.applicationRef,
    environment: accessPrincipal.environment,
    scopes: [...accessPrincipal.scopes],
    authorityMode: normalizedGrant.authorityMode,
    toolAccess: normalizedGrant.toolAccess,
    toolRefs: [...normalizedGrant.toolRefs],
    spendingPolicy: {
      format: AGENT_ACCESS_POLICY_FORMAT,
      toolAccess: normalizedGrant.spendingPolicy.toolAccess,
      toolRefs: [...normalizedGrant.spendingPolicy.toolRefs],
      environment: normalizedGrant.spendingPolicy.environment,
      budget: { ...normalizedGrant.spendingPolicy.budget },
      rate: { ...normalizedGrant.spendingPolicy.rate },
    },
    credentialRef: credential.credentialRef,
    grantRef: normalizedGrant.grantRef,
    generation: normalizedGrant.generation,
    expiresAt: normalizedGrant.expiresAt,
  }
}
