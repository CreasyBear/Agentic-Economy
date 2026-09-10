import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { resolveBusinessActor } from './authz'
import { requireSourceWrite } from './sourceWriteAdmission'
import { MARKET_TOOLS_CALL_SCOPE } from '../src/modules/agent-access/contract'
import { DELEGATION_MAX_ANCESTRY_GRANTS } from '../src/modules/authority/delegation/public'

export type BillingSourceWriteArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

export function principalAllowed(
  identity: { tokenIdentifier?: string } | null,
  principalId: string,
): boolean {
  if (identity === null || identity.tokenIdentifier === undefined) return false
  return (
    identity.tokenIdentifier === principalId ||
    `clerk_api_key:${identity.tokenIdentifier}` === principalId
  )
}

export async function ownerPrincipalAllowed(
  identity: {
    issuer?: string
    subject?: string
    tokenIdentifier?: string
  } | null,
  principalId: string,
  loadPrincipal: () => Promise<Readonly<{
    ownerId: string
    ownerTokenIdentifier?: string
  }> | null>,
): Promise<boolean> {
  if (principalAllowed(identity, principalId)) return true
  if (identity?.subject === undefined) return false
  const principal = await loadPrincipal()
  if (principal === null || principal.ownerId !== identity.subject) return false
  if (principal.ownerTokenIdentifier === undefined) return true
  const identityRefs = [
    identity.tokenIdentifier,
    identity.issuer === undefined
      ? undefined
      : `${identity.issuer}|${identity.subject}`,
  ].filter((value): value is string => value !== undefined)
  return identityRefs.includes(principal.ownerTokenIdentifier)
}

/**
 * Rebinds legacy billing handlers to the current canonical account only after
 * the interactive Principal + Account authority has been resolved and the
 * durable agent principal has been rechecked. The adapted subject is a local
 * compatibility input for legacy handler comparisons; it never comes from a
 * request, credential locator, or provider identifier.
 */
export async function canonicalBillingPrincipalContext<
  Context extends MutationCtx | QueryCtx,
>(
  ctx: Context,
  principalId: string,
  credentialId?: string,
): Promise<Context | null> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  // Public queries are authorized by the materialized interactive credential
  // lifecycle resolved above. Reading wall-clock time inside a cached query
  // can freeze a once-valid result, so the agent's time window is rechecked
  // only by mutation consequence contexts. Lifecycle revocation remains a DB
  // fact and therefore denies both reads and consequences immediately.
  const consequenceNow = 'scheduler' in ctx ? Date.now() : undefined
  const [agentPrincipal, principal, account] = await Promise.all([
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', principalId))
      .unique(),
    ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', principalId))
      .unique(),
    ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', actor.canonicalAccountRef),
      )
      .unique(),
  ])
  if (
    agentPrincipal === null ||
    agentPrincipal.principalId !== principalId ||
    agentPrincipal.ownerId !== actor.canonicalAccountRef ||
    (credentialId !== undefined && agentPrincipal.credentialId !== credentialId) ||
    agentPrincipal.lifecycle !== 'active' ||
    (consequenceNow !== undefined &&
      agentPrincipal.expiresAt !== undefined &&
      agentPrincipal.expiresAt <= consequenceNow) ||
    principal === null ||
    principal.principalRef !== principalId ||
    principal.kind !== 'agent' ||
    principal.lifecycle !== 'active' ||
    account === null ||
    account.accountRef !== actor.canonicalAccountRef ||
    account.lifecycle !== 'active'
  ) {
    return null
  }
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  return {
    ...ctx,
    auth: {
      ...ctx.auth,
      getUserIdentity: async () => ({
        ...identity,
        subject: actor.canonicalAccountRef,
      }),
    },
  } as Context
}

export type PersistedCallAuthorityExpectation = Readonly<{
  callRef: string
  principalId?: string
  credentialId?: string
  grantRef?: string
  grantGeneration?: number
  toolRef?: string
  inputDigest?: string
  attemptRef?: string
}>

const allAuthorityFacts = (facts: readonly boolean[]): boolean =>
  facts.every(Boolean)

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
    grant.policyDigest === call.policyDigest,
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

async function currentCallDelegationAncestryIsValid(
  ctx: Pick<MutationCtx, 'db'>,
  input: Readonly<{
    leafGrantRef: string
    expectedGeneration: number
    accountRef: string
    principalRef: string
    toolRef: string
    now: number
  }>,
): Promise<boolean> {
  const reverse: DelegationGrantRow[] = []
  const visited = new Set<string>()
  let nextRef: string | undefined = input.leafGrantRef
  while (nextRef !== undefined) {
    if (reverse.length >= DELEGATION_MAX_ANCESTRY_GRANTS || visited.has(nextRef)) return false
    visited.add(nextRef)
    const row = await ctx.db
      .query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', nextRef as string))
      .unique()
    if (row === null || !delegationGrantRowIsCurrent(row, nextRef, input)) {
      return false
    }
    reverse.push(row)
    nextRef = row.parentGrantRef
  }
  const ancestry = reverse.reverse()
  const root = ancestry[0]
  const leaf = ancestry[ancestry.length - 1]
  if (root === undefined || leaf === undefined || !delegationLeafIsCurrent(leaf, input)) {
    return false
  }
  const [rootPrincipal, rootAccount, rootMembership] = await Promise.all([
    ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) =>
        query.eq('principalRef', root.actorPrincipalRef),
      )
      .unique(),
    ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', input.accountRef),
      )
      .unique(),
    ctx.db
      .query('memberships')
      .withIndex(
        'by_accountRef_and_memberPrincipalRef_and_lifecycle',
        (query) =>
          query
            .eq('accountRef', input.accountRef)
            .eq('memberPrincipalRef', root.actorPrincipalRef)
            .eq('lifecycle', 'active'),
      )
      .unique(),
  ])
  const rootOwnership = rootAccount === null
    ? null
    : await ctx.db
        .query('accountOwnerships')
        .withIndex('by_ownershipRef', (query) =>
          query.eq('ownershipRef', rootAccount.currentOwnershipRef),
        )
        .unique()
  if (!delegationRootIsCurrent({
    root,
    rootPrincipal,
    rootAccount,
    rootMembership,
    rootOwnership,
    accountRef: input.accountRef,
  })) {
    return false
  }
  for (let index = 1; index < ancestry.length; index += 1) {
    const parent = ancestry[index - 1]
    const child = ancestry[index]
    if (parent === undefined || child === undefined || !delegationEdgeIsCurrent(parent, child)) {
      return false
    }
  }
  return true
}

type DelegationGrantRow = Doc<'authorityDelegationGrants'>

function delegationGrantRowIsCurrent(
  row: DelegationGrantRow,
  expectedRef: string,
  input: Readonly<{ accountRef: string; now: number }>,
): boolean {
  return allAuthorityFacts([
    row.grantRef === expectedRef,
    row.accountRef === input.accountRef,
    row.lifecycle === 'active',
    row.expiresAt > input.now,
    Number.isSafeInteger(row.generation),
    row.generation >= 1,
    Number.isSafeInteger(row.budgetLimit),
    row.budgetLimit >= 1,
    row.budgetUsed >= 0,
    row.budgetUsed <= row.budgetLimit,
    new Set(row.scopes).size === row.scopes.length,
    new Set(row.resourceRefs).size === row.resourceRefs.length,
  ])
}

function delegationLeafIsCurrent(
  leaf: DelegationGrantRow,
  input: Readonly<{
    leafGrantRef: string
    expectedGeneration: number
    principalRef: string
    toolRef: string
  }>,
): boolean {
  return allAuthorityFacts([
    leaf.grantRef === input.leafGrantRef,
    leaf.generation === input.expectedGeneration,
    leaf.subjectPrincipalRef === input.principalRef,
    leaf.scopes.includes(MARKET_TOOLS_CALL_SCOPE),
    leaf.resourceRefs.includes('*') || leaf.resourceRefs.includes(input.toolRef),
  ])
}

function delegationRootIsCurrent(input: Readonly<{
  root: DelegationGrantRow
  rootPrincipal: Doc<'principals'> | null
  rootAccount: Doc<'accounts'> | null
  rootMembership: Doc<'memberships'> | null
  rootOwnership: Doc<'accountOwnerships'> | null
  accountRef: string
}>): boolean {
  const {
    root,
    rootPrincipal,
    rootAccount,
    rootMembership,
    rootOwnership,
    accountRef,
  } = input
  if (rootPrincipal === null || rootAccount === null) return false
  const membershipIsCurrent = rootMembership !== null && allAuthorityFacts([
    rootMembership.accountRef === accountRef,
    rootMembership.memberPrincipalRef === root.actorPrincipalRef,
    rootMembership.lifecycle === 'active',
  ])
  const ownershipIsCurrent = rootOwnership !== null && allAuthorityFacts([
    rootOwnership.accountRef === accountRef,
    rootOwnership.ownerPrincipalRef === root.actorPrincipalRef,
    rootOwnership.lifecycle === 'active',
  ])
  return allAuthorityFacts([
    rootPrincipal.principalRef === root.actorPrincipalRef,
    rootPrincipal.lifecycle === 'active',
    rootAccount.lifecycle === 'active',
    membershipIsCurrent || ownershipIsCurrent,
  ])
}

function delegationEdgeIsCurrent(
  parent: DelegationGrantRow,
  child: DelegationGrantRow,
): boolean {
  return allAuthorityFacts([
    child.parentGrantRef === parent.grantRef,
    child.parentGeneration === parent.generation,
    child.actorPrincipalRef === parent.subjectPrincipalRef,
    child.createdAt >= parent.createdAt,
    child.expiresAt < parent.expiresAt,
    child.budgetLimit <= parent.budgetLimit,
    authoritySubset(child.scopes, parent.scopes),
    authoritySubset(child.resourceRefs, parent.resourceRefs),
  ])
}

function authoritySubset(
  requested: readonly string[],
  permitted: readonly string[],
): boolean {
  if (permitted.includes('*')) return true
  const allowed = new Set(permitted)
  return requested.every((value) => allowed.has(value))
}

export async function requireBillingSourceWrite(
  ctx: MutationCtx,
  args: BillingSourceWriteArgs,
): Promise<void> {
  const result = await requireSourceWrite(ctx, args, 'billing')
  if (result.kind === 'rejected') {
    throw new Error(`money_billing_source_write_rejected:${result.reason}`)
  }
}
