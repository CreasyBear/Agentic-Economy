import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { MARKET_TOOLS_CALL_SCOPE } from '../../../../src/modules/agent-access/contract'
import { allAuthorityFacts, currentCallDelegationAncestryIsValid } from './delegation'

type PersistedCallAuthorityExpectation = Readonly<{
  callRef: string
  principalId?: string
  credentialId?: string
  grantRef?: string
  grantGeneration?: number
  toolRef?: string
  inputDigest?: string
  attemptRef?: string
}>


function optionalAuthorityExpectationMatches<T>(
  expected: T | undefined,
  actual: T,
): boolean {
  return expected === undefined || expected === actual
}

function callMatchesAuthorityExpectation(
  call: Doc<'capabilityCalls'>,
  expected: PersistedCallAuthorityExpectation,
): boolean {
  return allAuthorityFacts([
    call.callRef === expected.callRef,
    optionalAuthorityExpectationMatches(expected.principalId, call.principalId),
    optionalAuthorityExpectationMatches(expected.credentialId, call.credentialId),
    optionalAuthorityExpectationMatches(expected.grantRef, call.grantRef),
    optionalAuthorityExpectationMatches(expected.grantGeneration, call.grantGeneration),
    optionalAuthorityExpectationMatches(expected.toolRef, call.toolRef),
    optionalAuthorityExpectationMatches(expected.inputDigest, call.inputDigest),
    optionalAuthorityExpectationMatches(expected.attemptRef, call.attemptRef),
    call.state !== 'refused',
    call.state !== 'cancelled',
  ])
}

function bindingIsCurrent(
  binding: Doc<'externalIdentityBindings'> | null,
  call: Doc<'capabilityCalls'>,
): binding is Doc<'externalIdentityBindings'> {
  if (binding === null) return false
  return allAuthorityFacts([
    binding.principalRef === call.principalId,
    binding.lifecycle === 'active',
    binding.providerState.kind === 'known',
    binding.providerState.kind === 'known'
      && binding.providerState.value === 'active',
    Number.isSafeInteger(binding.credentialGeneration),
    binding.credentialGeneration >= 0,
  ])
}

function credentialIsCurrent(
  credential: Doc<'credentials'> | null,
  binding: Doc<'externalIdentityBindings'>,
  call: Doc<'capabilityCalls'>,
  now: number,
): boolean {
  if (credential === null) return false
  const expiry = credential.expiryMaterialization
  const expiryIsCurrent = expiry === undefined
    ? true
    : allAuthorityFacts([
        expiry.credentialGeneration === credential.generation,
        expiry.credentialExpiresAt === credential.expiresAt,
        expiry.state === 'scheduled',
      ])
  return allAuthorityFacts([
    credential.bindingRef === binding.bindingRef,
    credential.principalRef === call.principalId,
    credential.generation === binding.credentialGeneration,
    credential.type === 'api_key',
    credential.expiresAt > now,
    expiryIsCurrent,
  ])
}

function accountAuthorityIsCurrent(input: Readonly<{
  call: Doc<'capabilityCalls'>
  account: Doc<'accounts'> | null
  membership: Doc<'memberships'> | null
  ownership: Doc<'accountOwnerships'> | null
}>): boolean {
  const { call, account, membership, ownership } = input
  if (account === null) return false
  const membershipIsCurrent = membership !== null && allAuthorityFacts([
    membership.accountRef === call.ownerId,
    membership.memberPrincipalRef === call.principalId,
    membership.lifecycle === 'active',
  ])
  const ownershipIsCurrent = ownership !== null && allAuthorityFacts([
    ownership.accountRef === call.ownerId,
    ownership.ownerPrincipalRef === call.principalId,
    ownership.lifecycle === 'active',
  ])
  return allAuthorityFacts([
    account.accountRef === call.ownerId,
    account.lifecycle === 'active',
    membershipIsCurrent || ownershipIsCurrent,
  ])
}

function principalAuthorityIsCurrent(input: Readonly<{
  call: Doc<'capabilityCalls'>
  agentPrincipal: Doc<'agentAccessPrincipals'> | null
  principal: Doc<'principals'> | null
  now: number
}>): boolean {
  const { call, agentPrincipal, principal, now } = input
  if (agentPrincipal === null || principal === null) return false
  return allAuthorityFacts([
    agentPrincipal.principalId === call.principalId,
    agentPrincipal.ownerId === call.ownerId,
    agentPrincipal.credentialId === call.credentialId,
    agentPrincipal.applicationRef === call.applicationRef,
    agentPrincipal.environment === call.environment,
    agentPrincipal.grantGeneration === call.grantGeneration,
    agentPrincipal.spendingPolicyDigest === call.policyDigest,
    agentPrincipal.scopes.includes(MARKET_TOOLS_CALL_SCOPE),
    agentPrincipal.lifecycle === 'active',
    agentPrincipal.expiresAt === undefined || agentPrincipal.expiresAt > now,
    principal.principalRef === call.principalId,
    principal.kind === 'agent',
    principal.lifecycle === 'active',
  ])
}

function grantAuthorityIsCurrent(
  grant: Doc<'agentAccessGrants'> | null,
  call: Doc<'capabilityCalls'>,
  now: number,
): boolean {
  if (grant === null) return false
  return allAuthorityFacts([
    grant.grantRef === call.grantRef,
    grant.principalId === call.principalId,
    grant.ownerId === call.ownerId,
    grant.credentialId === call.credentialId,
    grant.applicationRef === call.applicationRef,
    grant.environment === call.environment,
    grant.generation === call.grantGeneration,
    // Current grants use spendingPolicyDigest; protected historical grants
    // retain policyDigest. Admission records that same digest on the Call.
    (grant.spendingPolicyDigest ?? grant.policyDigest) === call.policyDigest,
    grant.lifecycle === 'active',
    grant.expiresAt === call.grantExpiresAt,
    grant.expiresAt > now,
  ])
}

/**
 * Rechecks the durable Call, agent, grant, Principal, and Account rows
 * at the instant a money consequence is applied. Caller-shaped fields are
 * accepted only as exact-match expectations against those durable rows.
 */
export async function persistedCallAuthorityIsCurrent(
  ctx: Pick<MutationCtx, 'db'>,
  expected: PersistedCallAuthorityExpectation,
): Promise<boolean> {
  const call = await ctx.db
    .query('capabilityCalls')
    .withIndex('by_callRef', (query) =>
      query.eq('callRef', expected.callRef),
    )
    .unique()
  if (call === null || !callMatchesAuthorityExpectation(call, expected)) {
    recordPersistedAuthorityFailure(expected, 'call_mismatch')
    return false
  }
  const now = Date.now()
  const binding = await ctx.db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) =>
      query
        .eq('providerNamespace', 'clerk/api-key')
        .eq('providerIdentifier', call.credentialId),
    )
    .unique()
  if (!bindingIsCurrent(binding, call)) {
    recordPersistedAuthorityFailure(expected, 'binding_not_current')
    return false
  }
  const [agentPrincipal, principal, account, grant, credential] = await Promise.all([
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) =>
        query.eq('principalId', call.principalId),
      )
      .unique(),
    ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) =>
        query.eq('principalRef', call.principalId),
      )
      .unique(),
    ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', call.ownerId),
      )
      .unique(),
    ctx.db
      .query('agentAccessGrants')
      .withIndex('by_grantRef', (query) =>
        query.eq('grantRef', call.grantRef),
      )
      .unique(),
    ctx.db
      .query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) =>
        query
          .eq('bindingRef', binding.bindingRef)
          .eq('generation', binding.credentialGeneration)
          .eq('lifecycle', 'active'),
      )
      .unique(),
  ])
  if (!credentialIsCurrent(credential, binding, call, now)) {
    recordPersistedAuthorityFailure(expected, 'credential_not_current')
    return false
  }
  const [membership, ownership] = account === null
    ? [null, null]
    : await Promise.all([
        ctx.db
          .query('memberships')
          .withIndex(
            'by_accountRef_and_memberPrincipalRef_and_lifecycle',
            (query) =>
              query
                .eq('accountRef', account.accountRef)
                .eq('memberPrincipalRef', call.principalId)
                .eq('lifecycle', 'active'),
          )
          .unique(),
        ctx.db
          .query('accountOwnerships')
          .withIndex('by_ownershipRef', (query) =>
            query.eq('ownershipRef', account.currentOwnershipRef),
          )
          .unique(),
      ])
  if (!principalAuthorityIsCurrent({ call, agentPrincipal, principal, now })) {
    recordPersistedAuthorityFailure(expected, 'principal_not_current')
    return false
  }
  if (!accountAuthorityIsCurrent({ call, account, membership, ownership })) {
    recordPersistedAuthorityFailure(expected, 'account_not_current')
    return false
  }
  if (!grantAuthorityIsCurrent(grant, call, now)) {
    recordPersistedAuthorityFailure(expected, 'grant_not_current')
    return false
  }
  const delegationCurrent = await currentCallDelegationAncestryIsValid(ctx, {
      leafGrantRef: call.grantRef,
      expectedGeneration: call.grantGeneration,
      accountRef: call.ownerId,
      principalRef: call.principalId,
      toolRef: call.toolRef,
      now,
    })
  if (!delegationCurrent) {
    recordPersistedAuthorityFailure(expected, 'delegation_not_current')
  }
  return delegationCurrent
}

function recordPersistedAuthorityFailure(
  expected: PersistedCallAuthorityExpectation,
  reason:
    | 'call_mismatch'
    | 'binding_not_current'
    | 'credential_not_current'
    | 'principal_not_current'
    | 'account_not_current'
    | 'grant_not_current'
    | 'delegation_not_current',
): void {
  console.warn('persisted_call_authority_refused', {
    callRef: expected.callRef,
    attemptRef: expected.attemptRef,
    reason,
  })
}
