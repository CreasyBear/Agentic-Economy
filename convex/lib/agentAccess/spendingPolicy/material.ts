import type { QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { normalizeStoredAgentAccessGrant, normalizeAgentAccessToolSelection, type AgentSpendingLimitsResult, type AgentSpendingLimitsReadResult } from '@/modules/agent-access/policy'
import { canonicalAgentDelegationScopes } from '../principals/records'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { resolveCanonicalAgentContext } from '../../authority/canonicalAgent/authority'
import { parsePersistedDelegationGrant } from '@/modules/authority/delegation/public'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { uniqueSorted } from '@/modules/common/unique-sorted'

type AccessAdmission = Doc<'agentAccessPrincipals'>
type StoredCredential = Doc<'credentials'>
type StoredDelegation = Doc<'authorityDelegationGrants'>
export type OwnerAuthority = Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>

type OwnedAgentMaterial = Readonly<{
  admission: AccessAdmission
  credential: StoredCredential
  grant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  delegation: StoredDelegation
}>

type OwnedAgentLoad =
  | Readonly<{ kind: 'ok'; material: OwnedAgentMaterial }>
  | Readonly<{ kind: 'agent_not_found' }>
  | Readonly<{ kind: 'authority_unavailable' }>
  | Readonly<{ kind: 'policy_invalid' }>


function isCurrentSupportedDelegation(
  delegation: ReturnType<typeof parsePersistedDelegationGrant>,
  owner: OwnerAuthority,
  admission: AccessAdmission,
  grant: ReturnType<typeof normalizeStoredAgentAccessGrant>,
  now: number,
): boolean {
  const expectedScopes = canonicalAgentDelegationScopes(admission.scopes)
  const expectedResources = grant.toolAccess === 'all_admitted' ? ['*'] : grant.toolRefs
  const hasResources = expectedResources.every((resource) => delegation.resourceRefs.includes('*') || delegation.resourceRefs.includes(resource))
  return delegation.grantRef === grant.grantRef
    && delegation.accountRef === owner.accountRef
    && delegation.actorPrincipalRef === owner.principalRef
    && delegation.subjectPrincipalRef === admission.principalId
    && delegation.parentGrantRef === undefined
    && delegation.parentGeneration === undefined
    && delegation.lifecycle === 'active'
    && delegation.expiresAt > now
    && expectedScopes.every((scope) => delegation.scopes.includes(scope))
    && hasResources
}

function readRows<T>(rows: readonly T[]): T | undefined {
  return rows.length === 1 ? rows[0] : undefined
}

/**
 * Load the complete current owner-owned Agent chain from canonical storage.
 * The admission row is only a projection: the credential, grant, and
 * delegation are independently checked before the caller may edit limits.
 */
export async function loadOwnedAgent(
  ctx: Pick<QueryCtx, 'db'>,
  owner: OwnerAuthority,
  requestedPrincipalRef: string,
  now: number,
): Promise<OwnedAgentLoad> {
  const admissionRows = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (q) => q.eq('principalId', requestedPrincipalRef))
    .take(2)
  if (admissionRows.length > 1) return { kind: 'authority_unavailable' }
  const admission = readRows(admissionRows)
  if (admission === undefined || admission.lifecycle !== 'active' || admission.ownerId !== owner.accountRef) {
    return { kind: 'agent_not_found' }
  }

  // This resolver is the canonical source for the Agent Principal, Account,
  // binding, and current credential. The admission row only selects the
  // provider credential locator and carries the policy projection.
  const canonical = await resolveCanonicalAgentContext(ctx, admission.credentialId, now)
  if (canonical === null) return { kind: 'authority_unavailable' }
  if (canonical.accountRef !== owner.accountRef) return { kind: 'agent_not_found' }
  if (canonical.principalRef !== admission.principalId
    || canonical.credentialLocator !== admission.credentialId) {
    return { kind: 'authority_unavailable' }
  }
  const credentialRows = await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (q) => q.eq('credentialRef', canonical.credentialRef))
    .take(2)
  if (credentialRows.length !== 1) return { kind: 'authority_unavailable' }
  const credential = credentialRows[0]
  if (credential === undefined
    || credential.principalRef !== canonical.principalRef
    || credential.type !== 'api_key'
    || credential.generation !== canonical.credentialGeneration
    || credential.lifecycle !== 'active'
    || credential.expiresAt !== canonical.credentialExpiresAt
    || !Number.isSafeInteger(credential.issuedAt)
    || !Number.isSafeInteger(credential.expiresAt)
    || credential.expiresAt <= credential.issuedAt
    || credential.expiresAt <= now) {
    return { kind: 'authority_unavailable' }
  }

  const grantRows = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_lifecycle', (q) => q
      .eq('credentialId', admission.credentialId)
      .eq('environment', admission.environment)
      .eq('lifecycle', 'active'))
    .take(2)
  if (grantRows.length !== 1) return { kind: 'authority_unavailable' }
  const storedGrant = grantRows[0]
  if (storedGrant === undefined) return { kind: 'authority_unavailable' }
  let grant: ReturnType<typeof normalizeStoredAgentAccessGrant>
  try {
    grant = normalizeStoredAgentAccessGrant(storedGrant)
  } catch (cause) {
    void cause;
    return { kind: 'policy_invalid' }
  }
  const selection = normalizeAgentAccessToolSelection(grant)
  const scopes = uniqueSorted(admission.scopes)
  if (selection === undefined
    || grant.principalId !== admission.principalId
    || grant.ownerId !== owner.accountRef
    || grant.applicationRef !== admission.applicationRef
    || grant.credentialId !== admission.credentialId
    || grant.environment !== admission.environment
    || grant.authorityMode !== admission.authorityMode
    || grant.lifecycle !== 'active'
    || grant.generation !== admission.grantGeneration
    || grant.spendingPolicyDigest !== admission.spendingPolicyDigest
    || grant.expiresAt <= now
    || grant.expiresAt > credential.expiresAt
    || scopes.length !== admission.scopes.length
    || !scopes.includes(MARKET_TOOLS_CALL_SCOPE)) {
    return { kind: 'authority_unavailable' }
  }
  if (grant.spendingPolicy.environment !== grant.environment
    || grant.spendingPolicy.budget.currency !== 'AUD'
    || grant.spendingPolicy.budget.exponent !== 6) {
    return { kind: 'policy_invalid' }
  }

  const delegationRows = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (q) => q.eq('grantRef', grant.grantRef))
    .take(2)
  if (delegationRows.length !== 1) return { kind: 'authority_unavailable' }
  const storedDelegation = delegationRows[0]
  if (storedDelegation === undefined) return { kind: 'authority_unavailable' }
  let delegation: ReturnType<typeof parsePersistedDelegationGrant>
  try {
    delegation = parsePersistedDelegationGrant(storedDelegation)
  } catch (cause) {
    void cause;
    return { kind: 'authority_unavailable' }
  }
  if (!isCurrentSupportedDelegation(delegation, owner, admission, grant, now)) {
    return { kind: 'authority_unavailable' }
  }
  return { kind: 'ok', material: { admission, credential, grant, delegation: storedDelegation } }
}

export function mapLoadFailure(
  result: Exclude<OwnedAgentLoad, { kind: 'ok' }>,
  correlationRef?: string,
): AgentSpendingLimitsResult | AgentSpendingLimitsReadResult {
  if (result.kind === 'agent_not_found') {
    return correlationRef === undefined
      ? { kind: 'refused', code: 'agent_not_found' as const }
      : { kind: 'conflict', code: 'agent_not_found' as const, correlationRef }
  }
  if (result.kind === 'policy_invalid') {
    return correlationRef === undefined
      ? { kind: 'refused', code: 'authority_unavailable' as const }
      : { kind: 'conflict', code: 'policy_invalid' as const, correlationRef }
  }
  return correlationRef === undefined
    ? { kind: 'refused', code: 'authority_unavailable' as const }
    : { kind: 'conflict', code: 'authority_unavailable' as const, correlationRef }
}
