import { degradeBackend } from '@/lib/observability/degrade-backend'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import type { MutationCtx } from '../../../_generated/server'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { revokeReplacementMaterial } from '../principals/replacementTransition'
import { invalidateOAuthRefreshFamilies } from '../principals/refreshInvalidation'
import type { AgentAccessPredecessorSnapshot } from './contracts'
export async function resolveReplacementPredecessor(
  ctx: Pick<MutationCtx, 'db'>,
  canonicalPrincipalRef: string,
  activeAccountRef: string,
): Promise<AgentAccessPredecessorSnapshot | null> {
  const current = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', canonicalPrincipalRef))
    .unique()
  if (current === null
    || current.ownerId !== activeAccountRef
    || current.lifecycle !== 'active') return null
  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', current.credentialId))
    .unique()
  if (binding === null
    || binding.principalRef !== canonicalPrincipalRef
    || binding.lifecycle !== 'active'
    || binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'active') return null
  const credential = await ctx.db.query('credentials')
    .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
      .eq('bindingRef', binding.bindingRef)
      .eq('generation', binding.credentialGeneration)
      .eq('lifecycle', 'active'))
    .unique()
  if (credential === null
    || credential.principalRef !== canonicalPrincipalRef
    || credential.type !== 'api_key'
    || credential.generation !== binding.credentialGeneration) return null
  const grants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_generation', (query) => query
      .eq('credentialId', current.credentialId)
      .eq('environment', current.environment)
      .eq('generation', current.grantGeneration))
    .take(2)
  const currentGrants = grants.flatMap((candidate) => {
    let normalizedCandidate: ReturnType<typeof normalizeStoredAgentAccessGrant>
    try {
      normalizedCandidate = normalizeStoredAgentAccessGrant(candidate)
    } catch (cause) {
      return degradeBackend(cause, [], { site: 'resolveReplacementPredecessor', reason: 'invalid_response' })
    }
    return candidate.principalId === canonicalPrincipalRef
      && candidate.ownerId === activeAccountRef
      && candidate.applicationRef === current.applicationRef
      && candidate.environment === current.environment
      && normalizedCandidate.lifecycle === 'active'
      && normalizedCandidate.generation === current.grantGeneration
      && normalizedCandidate.spendingPolicyDigest === current.spendingPolicyDigest
      ? [{ candidate, normalized: normalizedCandidate }]
      : []
  })
  if (currentGrants.length !== 1) return null
  const currentGrant = currentGrants[0]
  if (currentGrant === undefined) return null
  return {
    credentialId: current.credentialId,
    applicationRef: current.applicationRef,
    environment: current.environment,
    grantRef: currentGrant.candidate.grantRef,
    grantGeneration: currentGrant.normalized.generation,
    spendingPolicyDigest: currentGrant.normalized.spendingPolicyDigest,
    bindingRef: binding.bindingRef,
    bindingRevision: binding.revision,
    bindingCredentialGeneration: binding.credentialGeneration,
    credentialRef: credential.credentialRef,
    credentialRevision: credential.revision,
    credentialGeneration: credential.generation,
  }
}

export async function revokeCompromisedPredecessor(
  ctx: MutationCtx,
  snapshot: AgentAccessPredecessorSnapshot,
  owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>,
  now: number,
  correlationRef: string,
): Promise<boolean> {
  const [credential, binding, grant] = await Promise.all([
    ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query.eq('credentialRef', snapshot.credentialRef))
      .unique(),
    ctx.db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', snapshot.bindingRef))
      .unique(),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', snapshot.grantRef))
      .unique(),
  ])
  let normalizedGrant: ReturnType<typeof normalizeStoredAgentAccessGrant> | undefined
  if (grant !== null) {
    try {
      normalizedGrant = normalizeStoredAgentAccessGrant(grant)
    } catch (cause) {
      normalizedGrant = degradeBackend(cause, undefined, { site: 'revokeCompromisedPredecessor', reason: 'invalid_response' })
    }
  }
  if (credential === null || binding === null || grant === null
    || normalizedGrant === undefined
    || credential.lifecycle !== 'active'
    || credential.revision !== snapshot.credentialRevision
    || credential.generation !== snapshot.credentialGeneration
    || binding.lifecycle !== 'active'
    || binding.revision !== snapshot.bindingRevision
    || binding.credentialGeneration !== snapshot.bindingCredentialGeneration
    || binding.providerIdentifier !== snapshot.credentialId
    || normalizedGrant.lifecycle !== 'active'
    || normalizedGrant.generation !== snapshot.grantGeneration
    || normalizedGrant.spendingPolicyDigest !== snapshot.spendingPolicyDigest
    || credential.principalRef !== grant.principalId
    || binding.principalRef !== grant.principalId) return false
  await revokeReplacementMaterial(
    ctx,
    credential,
    binding,
    grant,
    owner,
    now,
    'suspected_compromise',
    correlationRef,
  )
  await invalidateOAuthRefreshFamilies(
    ctx,
    { credentialRef: credential.credentialRef },
    'suspected_compromise',
    now,
  )
  return true
}
export function samePredecessorSnapshot(
  left: AgentAccessPredecessorSnapshot | undefined,
  right: AgentAccessPredecessorSnapshot | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.credentialId === right.credentialId
    && left.applicationRef === right.applicationRef
    && left.environment === right.environment
    && left.grantRef === right.grantRef
    && left.grantGeneration === right.grantGeneration
    && left.spendingPolicyDigest === right.spendingPolicyDigest
    && left.bindingRef === right.bindingRef
    && left.bindingRevision === right.bindingRevision
    && left.bindingCredentialGeneration === right.bindingCredentialGeneration
    && left.credentialRef === right.credentialRef
    && left.credentialRevision === right.credentialRevision
    && left.credentialGeneration === right.credentialGeneration
}
